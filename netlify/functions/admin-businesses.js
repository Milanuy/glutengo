/**
 * GlutenGo — Netlify Function: admin-businesses
 * GET  /api/admin-businesses          → lista todos los negocios
 * PATCH /api/admin-businesses         → actualiza status y/o position
 *
 * Autenticación: header x-admin-token debe coincidir con ADMIN_PASSWORD env var.
 * Si Netlify todavía no tiene la variable, mantiene el token histórico del MVP.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'glutengo2026';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  'Content-Type': 'application/json',
};

function sbHeaders(extra) {
  return Object.assign({
    apikey:        SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

function unauthorized() {
  return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No autorizado' }) };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Verificar token admin
  const token = event.headers['x-admin-token'] || '';
  if (token !== ADMIN_PASS) return unauthorized();

  // ─── GET: listar todos los negocios ────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/businesses' +
        '?select=*&order=position.asc,created_at.desc',
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

  // ─── PATCH: actualizar status y/o position ─────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    const { id, status, position, notes } = body;
    if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id requerido' }) };

    const patch = {};
    if (status   !== undefined) patch.status   = status;
    if (position !== undefined) patch.position  = parseInt(position, 10);
    if (notes    !== undefined) patch.admin_notes = notes;

    // Si se activa, registrar fecha de activación y vencimiento (30 días)
    if (status === 'active') {
      patch.activated_at = new Date().toISOString();
      const exp = new Date();
      exp.setDate(exp.getDate() + 30);
      patch.expires_at = exp.toISOString();
    }

    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/businesses?id=eq.' + encodeURIComponent(id),
        {
          method: 'PATCH',
          headers: sbHeaders({ Prefer: 'return=representation' }),
          body: JSON.stringify(patch),
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
