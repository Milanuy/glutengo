/**
 * GlutenGo — Netlify Function: negocio
 * POST /api/negocio { nombre, tipo, categoria, direccion, barrio, email, telefono, plan, mensaje }
 *
 * 1. Guarda el registro en Supabase (tabla businesses)
 * 2. Envía notificación al administrador
 * 3. Envía auto-reply al negocio
 */

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_KEY   =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SEND_BUSINESS_EMAILS = process.env.ENABLE_BUSINESS_EMAILS === 'true';

const FROM_EMAIL = 'GlutenGo <onboarding@resend.dev>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hola@glutengo.com.uy';
const BASE_URL = 'https://glutengo.com.uy';

// Links de pago de MercadoPago. El verificado usa un plan de suscripción real.
const DEFAULT_MP_LINK_VERIFICADO =
  'https://www.mercadopago.com.uy/subscriptions/checkout?preapproval_plan_id=1195963a38ba4d48822d0c4907468a50';

function configuredSubscriptionLink(value, fallback) {
  if (!value || /VERIFICADO|CERTIFICADO/.test(value)) return fallback;
  if (!/mercadopago\.com\.uy\/subscriptions\/checkout\?preapproval_plan_id=/.test(value)) return fallback;
  return value;
}

const MP_LINKS = {
  verificado: configuredSubscriptionLink(process.env.MP_LINK_VERIFICADO, DEFAULT_MP_LINK_VERIFICADO),
  certificado: configuredSubscriptionLink(process.env.MP_LINK_CERTIFICADO, null),
};

const PLANES = {
  basico:     { label: 'Básico (Gratuito)',       precio: 'Sin costo' },
  verificado: { label: 'Verificado ($590/mes)',   precio: '$590 UYU/mes' },
  certificado:{ label: 'Certificado ($1.590/mes)', precio: '$1.590 UYU/mes' },
};

const VALID_TIPOS = new Set(['exclusivo', 'mixto']);
const VALID_CATEGORIAS = new Set(['restaurante', 'cafeteria', 'panaderia', 'heladeria', 'almacen', 'rotiseria', 'hotel', 'otro']);

const PLAN_PRESETS = {
  basico: {
    visibilityLevel: 'base',
    visibilityLabel: 'Presencia simple',
    position: 999,
    benefits: {
      verifiedBadge: false,
      certifiedBadge: false,
      directContact: false,
      logo: false,
      menu: false,
      priority: false,
      homeFeature: false,
      sideBanner: false,
      megaBanner: false,
    },
    reviewChecklist: [
      'Revisar que el local exista y tenga una propuesta sin gluten clara.',
      'Completar barrio, categoria y coordenadas si se publica en mapa.',
      'Mantener sin links directos ni logo salvo upgrade.'
    ],
  },
  verificado: {
    visibilityLevel: 'priority',
    visibilityLabel: 'Prioridad media',
    position: 300,
    benefits: {
      verifiedBadge: true,
      certifiedBadge: false,
      directContact: true,
      logo: true,
      menu: true,
      priority: true,
      homeFeature: false,
      sideBanner: false,
      megaBanner: false,
    },
    reviewChecklist: [
      'Confirmar pago de la suscripcion mensual.',
      'Confirmar datos comerciales, WhatsApp, Instagram y horarios.',
      'Cargar logo y descripcion cuidada antes de publicar.'
    ],
  },
  certificado: {
    visibilityLevel: 'premium',
    visibilityLabel: 'Prioridad alta',
    position: 100,
    benefits: {
      verifiedBadge: true,
      certifiedBadge: true,
      directContact: true,
      logo: true,
      menu: true,
      priority: true,
      homeFeature: false,
      sideBanner: false,
      megaBanner: false,
    },
    reviewChecklist: [
      'Confirmar pago de la suscripcion mensual.',
      'Coordinar y aprobar revision de protocolo sin gluten.',
      'Cargar logo, descripcion, fotos y evidencia de protocolo.'
    ],
  },
};

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function json(statusCode, body, headers) {
  return { statusCode, headers, body: JSON.stringify(body || {}) };
}

function cleanText(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 180);
}

function authToken(event) {
  const raw = event.headers.authorization || event.headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function currentUser(event) {
  const token = authToken(event);
  if (!token) return null;
  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SUPABASE_ANON_KEY || SUPABASE_KEY,
      Authorization: 'Bearer ' + token,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? user : null;
}

function isVerifiedGoogleUser(user) {
  if (!user || !user.email) return false;
  const app = user.app_metadata || {};
  const meta = user.user_metadata || {};
  const providers = Array.isArray(app.providers) ? app.providers : [];
  const provider = String(app.provider || '').toLowerCase();
  const hasGoogle = provider === 'google' || providers.indexOf('google') !== -1;
  const verified = Boolean(user.email_confirmed_at || user.confirmed_at || meta.email_verified === true);
  return hasGoogle && verified;
}

async function recentSubmissionCount(email) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = SUPABASE_URL + '/rest/v1/businesses' +
    '?select=id' +
    '&email=eq.' + encodeURIComponent(email) +
    '&created_at=gte.' + encodeURIComponent(since) +
    '&limit=6';
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return Array.isArray(rows) ? rows.length : 0;
}

function buildInitialConfig(data) {
  const plan = PLAN_PRESETS[data.plan] ? data.plan : 'basico';
  const preset = PLAN_PRESETS[plan];
  return {
    packagePresetVersion: '2026-06-19',
    slug: slugify(data.nombre),
    category: data.categoria || 'restaurante',
    visibilityLevel: preset.visibilityLevel,
    visibilityLabel: preset.visibilityLabel,
    position: preset.position,
    description: '',
    lat: '',
    lng: '',
    instagram: '',
    logoUrl: '',
    photoUrls: '',
    menuUrl: '',
    menuHighlights: '',
    featuredPlacement: 'none',
    sponsorTarget: '',
    sponsorLabel: '',
    sponsorStart: '',
    sponsorEnd: '',
    sponsorPaid: false,
    internal: (data.mensaje || '').trim().slice(0, 1000),
    reviewChecklist: preset.reviewChecklist,
    benefits: Object.assign({}, preset.benefits),
  };
}

function buildAdminEmail(data) {
  const plan = PLANES[data.plan] || PLANES.basico;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:2rem">
  <div style="background:#fff;max-width:560px;margin:0 auto;border-radius:12px;padding:2rem;box-shadow:0 2px 12px rgba(0,0,0,.1)">
    <h2 style="color:#0E3D22;margin-top:0">Nuevo negocio registrado en GlutenGo</h2>
    <table style="width:100%;border-collapse:collapse">
      <tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-weight:700;color:#374151;width:40%">Local</td><td style="padding:.5rem">${data.nombre}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-weight:700;color:#374151">Tipo</td><td style="padding:.5rem">${data.tipo === 'exclusivo' ? '100% sin gluten' : 'Opciones SG'}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-weight:700;color:#374151">Dirección</td><td style="padding:.5rem">${data.direccion}${data.barrio ? ', ' + data.barrio : ''}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-weight:700;color:#374151">Email</td><td style="padding:.5rem"><a href="mailto:${data.email}">${data.email}</a></td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-weight:700;color:#374151">Teléfono</td><td style="padding:.5rem">${data.telefono || '—'}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:.5rem;font-weight:700;color:#374151">Plan</td><td style="padding:.5rem;color:#166534;font-weight:700">${plan.label}</td></tr>
      <tr><td style="padding:.5rem;font-weight:700;color:#374151">Mensaje</td><td style="padding:.5rem;font-style:italic">${data.mensaje || '—'}</td></tr>
    </table>
    <p style="margin-top:1.5rem;font-size:.85rem;color:#6B7280">
      Registrado el ${new Date().toLocaleDateString('es-UY', { day:'numeric', month:'long', year:'numeric' })}
    </p>
    <a href="mailto:${data.email}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:.65rem 1.25rem;border-radius:8px;font-weight:700;font-size:.88rem;margin-top:.5rem">
      Responder al local →
    </a>
  </div>
</body>
</html>`;
}

function buildAutoReply(data) {
  const plan = PLANES[data.plan] || PLANES.basico;
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#FAF5EC;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:2rem 1rem">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">

        <tr>
          <td style="background:#0E3D22;padding:2rem;text-align:center">
            <h1 style="margin:0;font-size:2rem;font-weight:900;color:#fff">
              Gluten<span style="color:#E8A93C">Go</span>
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:2rem 2.5rem">
            <h2 style="color:#0E3D22;margin:0 0 .75rem;text-align:center;font-size:1.4rem">
              ¡Recibimos tu solicitud!
            </h2>
            <p style="color:#374151;line-height:1.65;margin:0 0 1rem">
              Hola, gracias por contactarnos. Registramos a <strong>${data.nombre}</strong>
              con el plan <strong>${plan.label}</strong>.
            </p>
            <p style="color:#374151;line-height:1.65;margin:0 0 1.5rem">
              Nuestro equipo va a revisar la información y te contactamos en las próximas
              <strong>48–72 horas</strong> para confirmar los detalles y el próximo paso.
            </p>

            <div style="background:#F0FDF4;border-radius:12px;padding:1.25rem;margin-bottom:1.5rem">
              <p style="font-weight:700;color:#0E3D22;margin:0 0 .5rem;font-size:.9rem">Lo que sigue:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">
                  Revisamos la información de tu local
                </td></tr>
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">
                  Te llamamos o escribimos para completar la ficha
                </td></tr>
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">
                  Tu local aparece en la guía de GlutenGo
                </td></tr>
                ${data.plan === 'certificado' ? '<tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">Coordinamos la auditoría presencial</td></tr>' : ''}
              </table>
            </div>

            <p style="color:#374151;line-height:1.65;margin:0 0 1rem;font-size:.9rem">
              ¿Tenés alguna pregunta? Respondé este email directamente
              o escribinos a <a href="mailto:${ADMIN_EMAIL}" style="color:#166534">${ADMIN_EMAIL}</a>
            </p>

            <div style="text-align:center">
              <a href="${BASE_URL}"
                 style="display:inline-block;background:#166534;color:#fff;text-decoration:none;
                        padding:.75rem 1.75rem;border-radius:12px;font-weight:700;font-size:.9rem">
                Ver la guía →
              </a>
            </div>
          </td>
        </tr>

        <tr>
          <td style="padding:1rem 2.5rem;text-align:center;border-top:1px solid #F3F4F6">
            <p style="color:#9CA3AF;font-size:.75rem;margin:0">
              GlutenGo · Montevideo, Uruguay<br>
              La guía celíaca que te mereces
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

exports.handler = async function (event) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(500, { error: 'Supabase no configurado' }, corsHeaders);
  }

  const user = await currentUser(event);
  if (!isVerifiedGoogleUser(user)) {
    return json(401, {
      error: 'Para enviar una solicitud tenés que entrar con Google. Así validamos que el correo exista y evitamos solicitudes falsas.'
    }, corsHeaders);
  }

  const verifiedEmail = cleanText(user.email, 200).toLowerCase();

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch (_) {
    return json(400, { error: 'JSON inválido' }, corsHeaders);
  }

  const { nombre, tipo, categoria, direccion, barrio, telefono, plan, mensaje } = data;
  const cleanNombre = cleanText(nombre, 120);
  const cleanTipo = VALID_TIPOS.has(tipo) ? tipo : '';
  const cleanCategoria = VALID_CATEGORIAS.has(categoria) ? categoria : 'otro';
  const cleanDireccion = cleanText(direccion, 200);
  const cleanBarrio = cleanText(barrio, 100);
  const cleanTelefono = cleanText(telefono, 50);
  const cleanMensaje = cleanText(mensaje, 800);
  const selectedPlan = PLANES[plan] ? plan : 'basico';

  if (cleanNombre.length < 3 || !cleanTipo) {
    return json(400, { error: 'Completá nombre del local y tipo de oferta.' }, corsHeaders);
  }

  try {
    const recentCount = await recentSubmissionCount(verifiedEmail);
    if (recentCount >= 5) {
      return json(429, {
        error: 'Recibimos varias solicitudes desde esta cuenta en las últimas 24 horas. Escribinos por WhatsApp si necesitás cargar más locales.'
      }, corsHeaders);
    }
  } catch (err) {
    console.error('Rate limit negocio error:', err.message);
    return json(500, { error: 'No pudimos validar la solicitud. Intentá de nuevo en unos minutos.' }, corsHeaders);
  }

  const results = { saved: false, notified: false, replied: false };

  // ── 1. Guardar en Supabase
  try {
    const sbRes = await fetch(SUPABASE_URL + '/rest/v1/businesses', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        nombre:    cleanNombre,
        tipo:      cleanTipo,
        direccion: cleanDireccion,
        barrio:    cleanBarrio,
        email:     verifiedEmail,
        telefono:  cleanTelefono,
        plan:      selectedPlan,
        status:    selectedPlan === 'basico' ? 'pending' : 'pending_payment',
        mensaje: JSON.stringify(buildInitialConfig({
          nombre: cleanNombre,
          categoria: cleanCategoria,
          mensaje: cleanMensaje + '\n\nSolicitud enviada con Google verificado: ' + verifiedEmail,
          plan: selectedPlan,
        })),
      }),
    });
    if (!sbRes.ok) throw new Error(await sbRes.text());
    results.saved = true;
  } catch (err) {
    console.error('Supabase negocio error:', err.message);
    return json(500, { error: 'No pudimos guardar la solicitud. Intentá de nuevo en unos minutos.' }, corsHeaders);
  }

  // ── 2. Emails opcionales. Por defecto no se envian: el flujo vive en admin.html.
  if (SEND_BUSINESS_EMAILS && RESEND_API_KEY) {
    try {
      // Notificación a Andy
      const adminRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [ADMIN_EMAIL],
          subject: 'Nuevo negocio en GlutenGo: ' + cleanNombre,
          html: buildAdminEmail({ nombre: cleanNombre, tipo: cleanTipo, direccion: cleanDireccion, barrio: cleanBarrio, email: verifiedEmail, telefono: cleanTelefono, plan: selectedPlan, mensaje: cleanMensaje }),
        }),
      });
      results.notified = adminRes.ok;

      // Auto-reply al negocio
      const replyRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          reply_to: ADMIN_EMAIL,
          to: [verifiedEmail],
          subject: 'Recibimos tu solicitud para GlutenGo',
          html: buildAutoReply({ nombre: cleanNombre, tipo: cleanTipo, plan: selectedPlan, mensaje: cleanMensaje }),
        }),
      });
      results.replied = replyRes.ok;
    } catch (err) {
      console.error('Resend negocio error:', err.message);
    }
  }

  // Incluir link de pago MP para planes pagos
  const mp_link = (selectedPlan === 'verificado' || selectedPlan === 'certificado')
    ? MP_LINKS[selectedPlan]
    : null;

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ ok: true, plan: selectedPlan, email: verifiedEmail, mp_link, ...results }),
  };
};
