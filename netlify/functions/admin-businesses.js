/**
 * GlutenGo — Netlify Function: admin-businesses
 * GET  /api/admin-businesses          → lista todos los negocios
 * PATCH /api/admin-businesses         → actualiza status, plan, position y admin_notes
 *
 * Autenticación: header x-admin-token debe coincidir con ADMIN_PASSWORD env var.
 * Si Netlify todavía no tiene la variable, mantiene el token histórico del MVP.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;
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

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Supabase service key no configurada en Netlify' }),
    };
  }

  // ─── GET: listar todos los negocios ────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/businesses' +
        '?select=*&order=created_at.desc',
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

  // ─── PATCH: actualizar status ──────────────────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    const { id, status, plan, position, admin_notes } = body;
    if (!id) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'id requerido' }) };

    const patch = {};
    if (status !== undefined) patch.status = status;
    if (plan !== undefined) {
      if (!['basico', 'verificado', 'certificado'].includes(plan)) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'plan inválido' }) };
      }
      patch.plan = plan;
    }
    if (position !== undefined) {
      const parsedPosition = Number(position);
      if (!Number.isInteger(parsedPosition) || parsedPosition < 1 || parsedPosition > 999) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'posición inválida' }) };
      }
      patch.position = parsedPosition;
    }
    if (admin_notes !== undefined) patch.admin_notes = String(admin_notes).slice(0, 6000);
    if (status === 'active') patch.activated_at = new Date().toISOString();

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
