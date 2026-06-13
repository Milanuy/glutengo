/**
 * GlutenGo — Netlify Function: subscribe
 * POST /api/subscribe  { email }
 *
 * 1. Guarda el email en Supabase (tabla waitlist)
 * 2. Envía email de confirmación via Resend
 *
 * Variables de entorno necesarias en Netlify:
 *   NEXT_PUBLIC_SUPABASE_URL      — ya la tenés
 *   SUPABASE_SERVICE_ROLE_KEY     — ya la tenés
 *   RESEND_API_KEY                — crear gratis en resend.com
 */

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Template del email de confirmación
function buildEmailHtml(email) {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#FAF5EC;font-family:DM Sans,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF5EC;padding:2rem 1rem">
    <tr><td align="center">
      <table width="560" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.08)">

        <!-- Header -->
        <tr>
          <td style="background:#0E3D22;padding:2rem;text-align:center">
            <h1 style="margin:0;font-family:Georgia,serif;font-size:1.8rem;font-weight:900;color:#fff">
              Gluten<span style="color:#E8A93C">Go</span>
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:2rem 2.5rem">
            <p style="font-size:2rem;text-align:center;margin:0 0 1rem">🌾</p>
            <h2 style="font-family:Georgia,serif;font-size:1.5rem;font-weight:900;color:#0E3D22;text-align:center;margin:0 0 1rem">
              ¡Ya estás en la lista!
            </h2>
            <p style="color:#374151;line-height:1.65;margin:0 0 1rem">
              Hola, gracias por unirte a GlutenGo. Sos parte de los primeros en apostar por
              una guía <strong>real y sin publicidad</strong> para celíacos en Uruguay.
            </p>
            <p style="color:#374151;line-height:1.65;margin:0 0 1.5rem">
              Cuando lancemos la app (próximamente), vas a poder:
            </p>
            <ul style="color:#374151;line-height:2;margin:0 0 1.5rem;padding-left:1.25rem">
              <li>✅ Reportar tus visitas y ayudar a la comunidad</li>
              <li>⭐ Guardar tus lugares favoritos</li>
              <li>🔔 Recibir alertas cuando abran nuevos lugares</li>
              <li>📊 Ver el GlutenGo Score en tiempo real</li>
            </ul>

            <div style="text-align:center;margin:1.5rem 0">
              <a href="https://glutengo.netlify.app" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:.85rem 2rem;border-radius:12px;font-weight:700;font-size:1rem">
                Ver el directorio ahora →
              </a>
            </div>
          </td>
        </tr>

        <!-- Compartir -->
        <tr>
          <td style="background:#DCFCE7;padding:1.25rem 2.5rem;text-align:center">
            <p style="color:#0E3D22;font-weight:700;margin:0 0 .4rem">¿Conocés otro celíaco?</p>
            <p style="color:#166534;font-size:.88rem;margin:0">
              Compartí <a href="https://glutengo.netlify.app" style="color:#166534;font-weight:700">glutengo.netlify.app</a> con quien lo necesite 💚
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:1.25rem 2.5rem;text-align:center;border-top:1px solid #E5E7EB">
            <p style="color:#9CA3AF;font-size:.78rem;margin:0">
              GlutenGo · Montevideo, Uruguay<br/>
              Recibiste este email porque te anotaste en
              <a href="https://glutengo.netlify.app" style="color:#166534">glutengo.netlify.app</a>
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
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // CORS (para llamadas desde el browser)
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let email;
  try {
    const body = JSON.parse(event.body || '{}');
    email = (body.email || '').toLowerCase().trim();
  } catch (_) {
    // Puede venir como form-encoded
    const params = new URLSearchParams(event.body || '');
    email = (params.get('email') || '').toLowerCase().trim();
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Email inválido' }),
    };
  }

  const results = { saved: false, emailed: false };

  // ── 1. Guardar en Supabase ──────────────────────────────────────
  try {
    const sbRes = await fetch(SUPABASE_URL + '/rest/v1/waitlist', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ email }),
    });
    results.saved = sbRes.ok || sbRes.status === 409; // 409 = ya existe, ok
  } catch (err) {
    console.error('Supabase error:', err.message);
  }

  // ── 2. Enviar email de confirmación (Resend) ────────────────────
  if (RESEND_API_KEY) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // onboarding@resend.dev funciona sin verificar dominio propio (MVP)
          // Cuando tengamos glutengo.uy verificado, cambiar a hola@glutengo.uy
          from: 'GlutenGo <onboarding@resend.dev>',
          to: [email],
          subject: '¡Ya estás en la lista de GlutenGo! 🌾',
          html: buildEmailHtml(email),
        }),
      });
      results.emailed = emailRes.ok;
    } catch (err) {
      console.error('Resend error:', err.message);
    }
  } else {
    console.warn('RESEND_API_KE