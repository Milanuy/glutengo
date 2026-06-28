/**
 * GlutenGo — Portal de locales
 *
 * GET  /api/owner-businesses
 * POST /api/owner-businesses
 *
 * El local se autentica con Google/Supabase. Solo ve negocios cuyo email
 * coincide con el email de su cuenta. Las ediciones quedan como solicitud
 * pendiente para aprobacion desde admin.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const ALLOWED_PUBLIC_FIELDS = new Set(['nombre', 'tipo', 'categoria', 'direccion', 'barrio', 'telefono']);
const ALLOWED_CONFIG_FIELDS = new Set(['slug', 'description', 'lat', 'lng', 'instagram', 'logoUrl', 'photoUrls']);

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

function text(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 220);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseNotes(notes) {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function parsePhotoUrls(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => text(item, 500))
    .filter((item) => /^https?:\/\//i.test(item) || item.startsWith('/assets/'))
    .slice(0, 12)
    .join('\n');
}

function publicBusiness(row) {
  const cfg = parseNotes(row.admin_notes || row.mensaje);
  return {
    id: row.id,
    nombre: row.nombre || '',
    tipo: row.tipo || 'mixto',
    categoria: cfg.category || row.categoria || 'restaurante',
    direccion: row.direccion || '',
    barrio: row.barrio || '',
    email: row.email || '',
    telefono: row.telefono || '',
    plan: row.plan || 'basico',
    status: row.status || 'pending',
    created_at: row.created_at,
    updated_at: row.updated_at,
    config: {
      slug: cfg.slug || slugify(row.nombre || row.id),
      description: cfg.description || '',
      lat: cfg.lat || '',
      lng: cfg.lng || '',
      instagram: cfg.instagram || '',
      logoUrl: cfg.logoUrl || '',
      photoUrls: cfg.photoUrls || '',
    },
  };
}

function sanitizePayload(body) {
  const rawPublic = body.public || {};
  const rawConfig = body.config || {};
  const publicFields = {};
  const configFields = {};

  Object.keys(rawPublic).forEach((key) => {
    if (!ALLOWED_PUBLIC_FIELDS.has(key)) return;
    let value = text(rawPublic[key], key === 'nombre' ? 140 : 220);
    if (key === 'tipo' && !['exclusivo', 'mixto'].includes(value)) value = 'mixto';
    if (key === 'categoria') value = text(value || 'restaurante', 80);
    publicFields[key] = value;
  });

  Object.keys(rawConfig).forEach((key) => {
    if (!ALLOWED_CONFIG_FIELDS.has(key)) return;
    if (key === 'slug') {
      configFields[key] = slugify(rawConfig[key]);
      return;
    }
    if (key === 'photoUrls') {
      configFields[key] = parsePhotoUrls(rawConfig[key]);
      return;
    }
    configFields[key] = text(rawConfig[key], key === 'description' ? 900 : 500);
  });

  return {
    public: publicFields,
    config: configFields,
    note: text(body.note, 900),
    submittedAt: new Date().toISOString(),
  };
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
      apikey: ANON_KEY || SERVICE_KEY,
      Authorization: 'Bearer ' + token,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? user : null;
}

async function ownerBusiness(id, email) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/businesses' +
      '?select=*&id=eq.' + encodeURIComponent(id) +
      '&email=eq.' + encodeURIComponent(email.toLowerCase()) +
      '&limit=1',
    { headers: serviceHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase no configurado' });

  const user = await currentUser(event);
  if (!user) return json(401, { error: 'Necesitás entrar con Google' });
  const email = String(user.email || '').trim().toLowerCase();

  if (event.httpMethod === 'GET') {
    const businessesRes = await fetch(
      SUPABASE_URL + '/rest/v1/businesses' +
        '?select=*&email=eq.' + encodeURIComponent(email) +
        '&order=created_at.desc',
      { headers: serviceHeaders() }
    );
    if (!businessesRes.ok) return json(500, { error: await businessesRes.text() });
    const businesses = await businessesRes.json();

    const requestsRes = await fetch(
      SUPABASE_URL + '/rest/v1/business_update_requests' +
        '?select=*&owner_email=eq.' + encodeURIComponent(email) +
        '&order=created_at.desc&limit=20',
      { headers: serviceHeaders() }
    );
    const requests = requestsRes.ok ? await requestsRes.json() : [];

    return json(200, {
      user: { email, name: user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name) || '' },
      businesses: businesses.map(publicBusiness),
      requests,
    });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return json(400, { error: 'JSON invalido' });
    }
    const businessId = text(body.business_id || body.businessId, 80);
    if (!businessId) return json(400, { error: 'business_id requerido' });

    const business = await ownerBusiness(businessId, email);
    if (!business) return json(403, { error: 'Este local no esta vinculado a tu email' });

    const payload = sanitizePayload(body);
    const res = await fetch(SUPABASE_URL + '/rest/v1/business_update_requests', {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify({
        business_id: businessId,
        owner_email: email,
        payload,
        status: 'pending',
      }),
    });
    if (!res.ok) return json(500, { error: await res.text() });
    const rows = await res.json();
    return json(200, { ok: true, request: rows[0] || null });
  }

  return json(405, { error: 'Method Not Allowed' });
};
