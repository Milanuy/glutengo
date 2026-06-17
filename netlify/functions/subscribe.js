/**
 * GlutenGo -- Netlify Function: subscribe
 *
 * El flujo de waitlist por email fue retirado. Los usuarios entran con
 * Google OAuth via Supabase; este endpoint queda solo como respuesta segura
 * para llamadas antiguas y no persiste datos.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  return {
    statusCode: 410,
    headers: corsHeaders,
    body: JSON.stringify({
      ok: false,
      error: 'El registro por email fue desactivado. Usá inicio de sesión con Google.',
    }),
  };
};
