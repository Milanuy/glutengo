/**
 * GlutenGo — uploads del portal de locales
 *
 * POST /api/owner-assets { business_id, kind, file: { dataUrl, name } }
 */

const { createHash } = require('crypto');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;

const BUCKET = 'business-assets';
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function text(value, limit) {
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
      apikey: ANON_KEY || SERVICE_KEY,
      Authorization: 'Bearer ' + token,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? user : null;
}

async function ownsBusiness(id, email) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/businesses' +
      '?select=id&id=eq.' + encodeURIComponent(id) +
      '&email=eq.' + encodeURIComponent(email.toLowerCase()) +
      '&limit=1',
    { headers: serviceHeaders() }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return Boolean(rows[0]);
}

function parseDataUrl(file) {
  const dataUrl = String(file && file.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|svg\+xml));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match || !TYPES[match[1]]) throw new Error('Formato no soportado');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new Error('Archivo vacio');
  if (buffer.length > MAX_BYTES) throw new Error('Archivo demasiado pesado');
  return { mime: match[1], ext: TYPES[match[1]], buffer };
}

function publicUrl(path) {
  return SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase no configurado' });

  const user = await currentUser(event);
  if (!user) return json(401, { error: 'Necesitás entrar con Google' });
  const email = String(user.email || '').trim().toLowerCase();

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) {
    return json(400, { error: 'JSON invalido' });
  }

  const businessId = text(body.business_id || body.businessId, 90);
  const kind = text(body.kind, 20) === 'logo' ? 'logo' : 'photo';
  if (!businessId) return json(400, { error: 'business_id requerido' });
  if (!(await ownsBusiness(businessId, email))) return json(403, { error: 'Este local no esta vinculado a tu email' });

  let parsed;
  try { parsed = parseDataUrl(body.file); } catch (err) {
    return json(400, { error: err.message });
  }

  const ownerHash = createHash('sha256').update(email).digest('hex').slice(0, 12);
  const fileHash = createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 14);
  const path = businessId + '/' + kind + '/' + ownerHash + '-' + Date.now() + '-' + fileHash + '.' + parsed.ext;

  const upload = await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': parsed.mime,
      'Cache-Control': '31536000',
      'x-upsert': 'true',
    },
    body: parsed.buffer,
  });
  if (!upload.ok) return json(500, { error: (await upload.text()).slice(0, 200) });

  return json(200, { ok: true, url: publicUrl(path), path, kind });
};
