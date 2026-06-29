/**
 * GlutenGo — aprobacion de cambios enviados por locales
 *
 * GET   /api/admin-owner-requests
 * PATCH /api/admin-owner-requests { id, action: "approve" | "reject", note }
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
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body || {}) };
}

function serviceHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

function unauthorized() {
  return json(401, { error: 'No autorizado' });
}

function text(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 220);
}

function parseNotes(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return { internal: String(notes || '').slice(0, 1200) };
  }
}

function sanitizeCfgValue(key, value) {
  if (key === 'photoUrls') return text(value, 4000);
  if (key === 'description') return text(value, 900);
  if (key === 'menuHighlights') return text(value, 1800);
  if (key === 'menuUrl') return text(value, 700);
  return text(value, 500);
}

function requestSummary(req, business) {
  return {
    id: req.id,
    business_id: req.business_id,
    owner_email: req.owner_email,
    payload: req.payload || {},
    status: req.status,
    created_at: req.created_at,
    reviewed_at: req.reviewed_at,
    business: business ? {
      id: business.id,
      nombre: business.nombre,
      email: business.email,
      plan: business.plan,
      status: business.status,
      direccion: business.direccion,
      barrio: business.barrio,
      telefono: business.telefono,
    } : null,
  };
}

async function fetchBusiness(id) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/businesses?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1',
    { headers: serviceHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

async function fetchRequest(id) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/business_update_requests?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1',
    { headers: serviceHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

async function patchRequest(id, patch) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/business_update_requests?id=eq.' + encodeURIComponent(id),
    {
      method: 'PATCH',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

async function approveRequest(req, note) {
  const business = await fetchBusiness(req.business_id);
  if (!business) throw new Error('Negocio no encontrado');
  const payload = req.payload || {};
  const publicFields = payload.public || {};
  const configFields = payload.config || {};
  const cfg = parseNotes(business.admin_notes || business.mensaje);

  Object.keys(configFields).forEach((key) => {
    cfg[key] = sanitizeCfgValue(key, configFields[key]);
  });
  const line = 'Cambio aprobado desde portal local el ' +
    new Date().toLocaleDateString('es-UY') +
    ' para ' + req.owner_email + '.';
  cfg.internal = [cfg.internal, line, note ? 'Nota admin: ' + text(note, 700) : '']
    .filter(Boolean)
    .join('\n');

  const patch = {};
  if (publicFields.nombre !== undefined) patch.nombre = text(publicFields.nombre, 140);
  if (publicFields.tipo !== undefined && ['exclusivo', 'mixto'].includes(publicFields.tipo)) patch.tipo = publicFields.tipo;
  if (publicFields.categoria !== undefined) {
    patch.categoria = text(publicFields.categoria, 80);
    cfg.category = patch.categoria;
  }
  if (publicFields.direccion !== undefined) patch.direccion = text(publicFields.direccion, 220);
  if (publicFields.barrio !== undefined) patch.barrio = text(publicFields.barrio, 120);
  if (publicFields.telefono !== undefined) patch.telefono = text(publicFields.telefono, 60);
  patch.mensaje = JSON.stringify(cfg);
  patch.admin_notes = JSON.stringify(cfg);

  const updateBusiness = await fetch(
    SUPABASE_URL + '/rest/v1/businesses?id=eq.' + encodeURIComponent(req.business_id),
    {
      method: 'PATCH',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(patch),
    }
  );
  if (!updateBusiness.ok) throw new Error(await updateBusiness.text());
  const updatedRows = await updateBusiness.json();

  const updatedReq = await patchRequest(req.id, {
    status: 'approved',
    admin_notes: text(note, 900),
    reviewed_at: new Date().toISOString(),
    reviewed_by: 'admin',
  });

  return { request: updatedReq, business: updatedRows[0] || null };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  const token = event.headers['x-admin-token'] || '';
  if (token !== ADMIN_PASS) return unauthorized();
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase no configurado' });

  if (event.httpMethod === 'GET') {
    const status = text((event.queryStringParameters || {}).status || 'pending', 20);
    const filter = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
    const reqRes = await fetch(
      SUPABASE_URL + '/rest/v1/business_update_requests' +
        '?select=*&status=eq.' + encodeURIComponent(filter) +
        '&order=created_at.desc&limit=80',
      { headers: serviceHeaders() }
    );
    if (!reqRes.ok) return json(500, { error: await reqRes.text() });
    const requests = await reqRes.json();
    const ids = Array.from(new Set(requests.map((r) => r.business_id).filter(Boolean)));
    let businesses = [];
    if (ids.length) {
      const inList = '(' + ids.map((id) => String(id).replace(/[^0-9]/g, '')).filter(Boolean).join(',') + ')';
      const bizRes = await fetch(
        SUPABASE_URL + '/rest/v1/businesses?select=*&id=in.' + encodeURIComponent(inList),
        { headers: serviceHeaders() }
      );
      if (bizRes.ok) businesses = await bizRes.json();
    }
    const byId = {};
    businesses.forEach((b) => { byId[b.id] = b; });
    return json(200, requests.map((req) => requestSummary(req, byId[req.business_id])));
  }

  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return json(400, { error: 'JSON invalido' });
    }
    const id = text(body.id, 90);
    const action = text(body.action, 20);
    if (!id) return json(400, { error: 'id requerido' });
    if (!['approve', 'reject'].includes(action)) return json(400, { error: 'accion invalida' });

    try {
      const req = await fetchRequest(id);
      if (!req) return json(404, { error: 'Solicitud no encontrada' });
      if (req.status !== 'pending') return json(400, { error: 'La solicitud ya fue revisada' });
      if (action === 'reject') {
        const updated = await patchRequest(id, {
          status: 'rejected',
          admin_notes: text(body.note, 900),
          reviewed_at: new Date().toISOString(),
          reviewed_by: 'admin',
        });
        return json(200, { ok: true, request: updated });
      }
      return json(200, Object.assign({ ok: true }, await approveRequest(req, body.note)));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method Not Allowed' });
};
