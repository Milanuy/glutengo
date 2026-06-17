/**
 * GlutenGo — Netlify Function: mp-webhook
 * POST /api/mp-webhook
 *
 * Recibe notificaciones IPN de MercadoPago.
 * Cuando un pago se aprueba, activa el negocio en Supabase.
 *
 * Config en MP: https://www.mercadopago.com.uy/developers/panel/notifications
 * URL a configurar: https://tu-sitio.netlify.app/api/mp-webhook
 *
 * Variables de entorno requeridas:
 *   MP_ACCESS_TOKEN   — token de MP para verificar el pago
 *   SUPABASE_SERVICE_ROLE_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   RESEND_API_KEY    — para enviar email de bienvenida
 */

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY    =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;
const MP_TOKEN       = process.env.MP_ACCESS_TOKEN;
const RESEND_KEY     = process.env.RESEND_API_KEY;
const FROM_EMAIL     = 'GlutenGo <onboarding@resend.dev>';
const ADMIN_EMAIL    = 'anmaurano@gmail.com';
const BASE_URL       = 'https://glutengo.netlify.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function sbHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json',
  }, extra || {});
}

const PLAN_LABELS = {
  basico: 'Básico', verificado: 'Verificado', certificado: 'Certificado',
};

async function buildWelcomeEmail(negocio) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/></head>
<body style="margin:0;background:#FAF5EC;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:2rem 1rem">
<table width="100%" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <tr><td style="background:#0E3D22;padding:2rem;text-align:center">
    <h1 style="margin:0;font-size:2rem;font-weight:900;color:#fff">Gluten<span style="color:#E8A93C">Go</span></h1>
  </td></tr>
  <tr><td style="padding:2rem 2.5rem">
    <h2 style="color:#0E3D22;text-align:center">¡Tu local ya está activo! 🎉</h2>
    <p style="color:#374151;line-height:1.65">
      Hola, el pago fue confirmado y <strong>${negocio.nombre}</strong> ya aparece en el directorio de GlutenGo
      con el plan <strong>${PLAN_LABELS[negocio.plan] || negocio.plan}</strong>.
    </p>
    <div style="background:#F0FDF4;border-radius:12px;padding:1.25rem;margin:1.25rem 0">
      <p style="font-weight:700;color:#0E3D22;margin:0 0 .5rem">¿Qué sigue?</p>
      <p style="color:#374151;font-size:.88rem;margin:.3rem 0">✅ Tu ficha ya está visible en el mapa y el directorio.</p>
      ${negocio.plan === 'verificado' ? '<p style="color:#374151;font-size:.88rem;margin:.3rem 0">🏅 Te contactaremos para coordinar el badge de verificación.</p>' : ''}
      ${negocio.plan === 'certificado' ? '<p style="color:#374151;font-size:.88rem;margin:.3rem 0">🔍 Coordinamos la auditoría presencial en los próximos 5 días hábiles.</p>' : ''}
      <p style="color:#374151;font-size:.88rem;margin:.3rem 0">📞 Ante cualquier consulta escribinos a <a href="mailto:${ADMIN_EMAIL}" style="color:#166534">${ADMIN_EMAIL}</a></p>
    </div>
    <div style="text-align:center;margin-top:1.5rem">
      <a href="${BASE_URL}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:.75rem 1.75rem;border-radius:12px;font-weight:700">
        Ver el directorio →
      </a>
    </div>
  </td></tr>
  <tr><td style="padding:1rem 2.5rem;text-align:center;border-top:1px solid #F3F4F6">
    <p style="color:#9CA3AF;font-size:.75rem;margin:0">GlutenGo · Montevideo, Uruguay</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 200, headers: corsHeaders, body: 'OK' };
  }

  let notification;
  try {
    notification = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, body: 'Bad request' };
  }

  console.log('MP webhook received:', JSON.stringify(notification));

  // MercadoPago envía: { type: "payment", data: { id: "PAYMENT_ID" } }
  if (notification.type !== 'payment' || !notification.data?.id) {
    return { statusCode: 200, body: 'OK' };
  }

  const paymentId = String(notification.data.id);

  // ── 1. Verificar el pago con la API de MP ─────────────────────────────────
  let payment;
  try {
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { Authorization: 'Bearer ' + MP_TOKEN }
    });
    if (!mpRes.ok) {
      console.error('MP API error:', mpRes.status, await mpRes.text());
      return { statusCode: 200, body: 'OK' };
    }
    payment = await mpRes.json();
  } catch (err) {
    console.error('MP fetch error:', err.message);
    return { statusCode: 200, body: 'OK' };
  }

  console.log('MP payment status:', payment.status, 'payer:', payment.payer?.email);

  // Solo procesar pagos aprobados
  if (payment.status !== 'approved') {
    return { statusCode: 200, body: 'OK' };
  }

  const payerEmail = (payment.payer?.email || '').toLowerCase();
  // MP description debe incluir el plan: "GlutenGo Verificado" o "GlutenGo Certificado"
  const description = (payment.description || '').toLowerCase();
  let plan = 'verificado';
  if (description.includes('certificado')) plan = 'certificado';
  if (description.includes('basico') || description.includes('básico')) plan = 'basico';

  // ── 2. Buscar el negocio en Supabase por email del pagador ─────────────────
  let negocio = null;
  try {
    let rows = [];
    if (payerEmail) {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/businesses?email=eq.' + encodeURIComponent(payerEmail) +
        '&order=created_at.desc&select=*&limit=1',
        { headers: sbHeaders() }
      );
      rows = res.ok ? await res.json() : [];
    }

    if (rows.length) negocio = rows[0];
  } catch (err) {
    console.error('Supabase lookup error:', err.message);
  }

  if (!negocio) {
    console.warn('No encontramos negocio para pago', paymentId, payerEmail);
    // Notificar al admin igual para que lo gestione manualmente
    if (RESEND_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL, to: [ADMIN_EMAIL],
          subject: '⚠️ Pago MP sin negocio asociado — ID ' + paymentId,
          html: '<p>Pago aprobado <strong>' + paymentId + '</strong> de <strong>' + payerEmail + '</strong> ($' + payment.transaction_amount + ' UYU) pero no encontramos el negocio en Supabase. Activarlo manualmente.</p>',
        }),
      }).catch(() => {});
    }
    return { statusCode: 200, body: 'OK' };
  }

  // ── 3. Activar el negocio ──────────────────────────────────────────────────
  try {
    await fetch(
      SUPABASE_URL + '/rest/v1/businesses?id=eq.' + negocio.id,
      {
        method: 'PATCH',
        headers: sbHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({
          status: 'active',
          plan:   plan,
        }),
      }
    );
    console.log('Negocio activado:', negocio.nombre, 'plan:', plan);
  } catch (err) {
    console.error('Supabase activate error:', err.message);
  }

  // ── 4. Enviar email de bienvenida ──────────────────────────────────────────
  if (RESEND_KEY && negocio.email) {
    try {
      const html = await buildWelcomeEmail({ ...negocio, plan });
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          reply_to: ADMIN_EMAIL,
          to: [negocio.email],
          subject: '¡' + negocio.nombre + ' ya está activo en GlutenGo! 🎉',
          html,
        }),
      });
      // Notificar al admin
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL, to: [ADMIN_EMAIL],
          subject: '✅ Pago confirmado: ' + negocio.nombre + ' (' + (PLAN_LABELS[plan] || plan) + ')',
          html: '<p><strong>' + negocio.nombre + '</strong> pagó y fue activado automáticamente. Plan: <strong>' + (PLAN_LABELS[plan] || plan) + '</strong>. Payment ID: ' + paymentId + '</p>',
        }),
      });
    } catch (err) {
      console.error('Email error:', err.message);
    }
  }

  return { statusCode: 200, body: 'OK' };
};
