/**
 * GlutenGo — Netlify Function: subscribe
 * POST /api/subscribe  { email }
 *
 * 1. Guarda el email en Supabase (tabla waitlist) y obtiene el token único
 * 2. Envía email de bienvenida con MAGIC LINK para activar la cuenta
 *
 * Variables de entorno (Netlify dashboard):
 *   NEXT_PUBLIC_SUPABASE_URL   — URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  — Clave de servicio (secreta)
 *   RESEND_API_KEY             — API key de resend.com
 *
 * Sender:
 *   Hoy: onboarding@resend.dev (dominio compartido de Resend, funciona SIN verificar)
 *   Cuando verifiques monvi.com.uy en Resend → cambia FROM_EMAIL a:
 *   'GlutenGo <hola@monvi.com.uy>'
 */

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ─── Cambiar a 'GlutenGo <hola@monvi.com.uy>' cuando verifiques el dominio
const FROM_EMAIL = 'GlutenGo <onboarding@resend.dev>';
const REPLY_TO   = 'anmaurano@gmail.com';
const BASE_URL   = 'https://glutengo.netlify.app';

// ─────────────────────────────────────────────────────────────────
// HTML del email de bienvenida con magic link
// ─────────────────────────────────────────────────────────────────
function buildWelcomeEmail(activationLink) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#FAF5EC;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:2rem 1rem">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">

        <!-- Header verde -->
        <tr>
          <td style="background:#0E3D22;padding:2rem;text-align:center">
            <h1 style="margin:0;font-size:2rem;font-weight:900;color:#fff;letter-spacing:-.02em">
              Gluten<span style="color:#E8A93C">Go</span>
            </h1>
            <p style="margin:.4rem 0 0;color:rgba(255,255,255,.7);font-size:.88rem">
              Guía celíaca de Uruguay
            </p>
          </td>
        </tr>

        <!-- Emoji hero -->
        <tr>
          <td style="padding:2rem 2.5rem 1rem;text-align:center">
            <div style="font-size:3rem;margin-bottom:.75rem">🌾</div>
            <h2 style="font-size:1.5rem;font-weight:900;color:#0E3D22;margin:0 0 .75rem">
              ¡Ya casi estás adentro!
            </h2>
            <p style="color:#374151;line-height:1.6;margin:0 0 1.5rem">
              Hacé click en el botón para <strong>activar tu cuenta</strong> y empezar
              a valorar lugares, guardar favoritos y ayudar a la comunidad celíaca.
            </p>

            <!-- CTA principal -->
            <a href="${activationLink}"
               style="display:inline-block;background:#166534;color:#fff;text-decoration:none;
                      padding:1rem 2.5rem;border-radius:14px;font-weight:700;font-size:1.05rem;
                      letter-spacing:-.01em;box-shadow:0 4px 12px rgba(22,101,52,.35)">
              Activar mi cuenta →
            </a>

            <p style="margin:1rem 0 0;font-size:.78rem;color:#9CA3AF">
              O copiá este link en tu navegador:<br>
              <a href="${activationLink}" style="color:#166534;word-break:break-all;font-size:.75rem">${activationLink}</a>
            </p>
          </td>
        </tr>

        <!-- Qué podés hacer -->
        <tr>
          <td style="padding:1.25rem 2.5rem">
            <div style="background:#F0FDF4;border-radius:12px;padding:1.25rem">
              <p style="font-weight:700;color:#0E3D22;margin:0 0 .75rem;font-size:.9rem">
                Con tu cuenta podés:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">⭐ Valorar lugares y subir el GlutenGo Score</td></tr>
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">🔖 Guardar tus favoritos</td></tr>
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">🔔 Recibir alertas de nuevos locales</td></tr>
                <tr><td style="padding:.3rem 0;color:#374151;font-size:.88rem">📊 Ver el Score en tiempo real actualizado por la comunidad</td></tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- Ver directorio ya -->
        <tr>
          <td style="padding:.5rem 2.5rem 1.5rem;text-align:center">
            <p style="color:#6B7280;font-size:.88rem;margin:0 0 .75rem">
              Mientras tanto, el directorio ya está online:
            </p>
            <a href="${BASE_URL}"
               style="display:inline-block;border:2px solid #166534;color:#166534;text-decoration:none;
                      padding:.65rem 1.5rem;border-radius:10px;font-weight:700;font-size:.9rem">
              Ver los 23 lugares →
            </a>
          </td>
        </tr>

        <!-- Footer compartir -->
        <tr>
          <td style="background:#DCFCE7;padding:1rem 2.5rem;text-align:center">
            <p style="color:#0E3D22;font-weight:700;margin:0 0 .25rem;font-size:.88rem">
              ¿Conocés otro celíaco?
            </p>
            <p style="color:#166534;font-size:.82rem;margin:0">
              Compartí <a href="${BASE_URL}" style="color:#166534;font-weight:700">${BASE_URL.replace('https://', '')}</a> 💚
            </p>
          </td>
        </tr>

        <!-- Footer legal -->
        <tr>
          <td style="padding:1rem 2.5rem;text-align:center;border-top:1px solid #F3F4F6">
            <p style="color:#9CA3AF;font-size:.75rem;margin:0">
              GlutenGo · Montevideo, Uruguay<br>
              Recibiste este email porque te registraste en
              <a href="${BASE_URL}" style="color:#166534">${BASE_URL.replace('https://', '')}</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ───────────────────────�