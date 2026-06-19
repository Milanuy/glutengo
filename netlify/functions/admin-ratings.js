/**
 * GlutenGo — Netlify Function: admin-ratings
 * GET   /api/admin-ratings        → lista calificaciones con foto
 * PATCH /api/admin-ratings { id, photo_status }
 *
 * Autenticación: header x-admin-token debe coincidir con ADMIN_PASSWORD.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'glutengo2026';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  'Content-Type': 'application/json',
};

function sbHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

function unauthorized() {
  return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const token = event.headers['x-admin-token'] || '';
  if (token !== ADMIN_PASS) return unauthorized();

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Supabase service key no configurada en Netlify' }),
    };
  }

  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings' +
        '?select=id,slug,score,comentario,photo_url,photo_status,created_at' +
        '&photo_url=not.is.null&order=created_at.desc&limit=100',
        { headers: sbHeaders() }
      );
      if (!res.ok) {
        const err = await res.text();
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err }) };
      }
      const rows = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(rows) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    const id = body.id;
    const photoStatus = body.photo_status;
    if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id requerido' }) };
    if (!['pending', 'approved', 'rejected'].includes(photoStatus)) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'estado de foto inválido' }) };
    }

    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?id=eq.' + encodeURIComponent(id),
        {
          method: 'PATCH',
          headers: sbHeaders({ Prefer: 'return=representation' }),
          body: JSON.stringify({
            photo_status: photoStatus,
            photo_reviewed_at: new Date().toISOString(),
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err }) };
      }
      const updated = await res.json();
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(updated[0] || {}) };
    } catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
