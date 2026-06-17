/**
 * GlutenGo — Netlify Function: public-businesses
 * GET /api/public-businesses
 *
 * Devuelve negocios activos aprobados desde admin, con solo campos seguros
 * para mezclar en el mapa, directorio y fichas públicas.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const CATEGORY_LABELS = new Set([
  'restaurante', 'cafeteria', 'panaderia', 'heladeria', 'rotiseria', 'almacen', 'hotel', 'otro',
]);

function sbHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
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

function cleanUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('/assets/')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return '';
}

function parsePhotos(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map(cleanUrl)
    .filter(Boolean)
    .slice(0, 8);
}

function parseNumber(value) {
  const n = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function defaultBenefits(plan) {
  const paid = plan === 'verificado' || plan === 'certificado';
  return {
    verifiedBadge: paid,
    certifiedBadge: plan === 'certificado',
    directContact: paid,
    logo: paid,
    priority: paid,
    homeFeature: false,
    sideBanner: false,
    megaBanner: false,
  };
}

function publicDescription(row, cfg) {
  const desc = String(cfg.description || '').trim();
  if (desc) return desc.slice(0, 900);
  if (row.tipo === 'exclusivo') {
    return 'Local registrado en GlutenGo como propuesta 100% sin gluten. Confirmá horarios y disponibilidad antes de ir.';
  }
  return 'Local registrado en GlutenGo con opciones sin gluten. Confirmá disponibilidad, horarios y protocolo antes de consumir.';
}

function toPublicPlace(row) {
  const cfg = parseNotes(row.admin_notes || row.mensaje);
  const plan = row.plan || 'basico';
  const benefits = Object.assign(defaultBenefits(plan), cfg.benefits || {});
  const parsedPosition = Number(cfg.position);
  const category = CATEGORY_LABELS.has(cfg.category) ? cfg.category
    : CATEGORY_LABELS.has(row.categoria) ? row.categoria
    : 'otro';
  const slug = slugify(cfg.slug || row.nombre || row.id);
  const lat = parseNumber(cfg.lat);
  const lng = parseNumber(cfg.lng);
  const directContact = Boolean(benefits.directContact);

  return {
    slug,
    name: String(row.nombre || '').trim(),
    category,
    tipo: row.tipo === 'exclusivo' ? 'exclusivo' : 'mixto',
    address: String(row.direccion || '').trim() || 'Dirección a confirmar',
    neighborhood: String(row.barrio || '').trim() || 'Zona a confirmar',
    phone: directContact ? String(row.telefono || '').trim() : '',
    desc: publicDescription(row, cfg),
    hours: null,
    lat,
    lng,
    hasCoordinates: lat !== null && lng !== null,
    instagram: directContact ? String(cfg.instagram || '').trim() : '',
    plan,
    position: Number.isInteger(parsedPosition) && parsedPosition >= 1 ? parsedPosition : 999,
    logoUrl: benefits.logo ? cleanUrl(cfg.logoUrl) : '',
    photoUrls: parsePhotos(cfg.photoUrls),
    featuredPlacement: String(cfg.featuredPlacement || 'none'),
    benefits,
    source: 'admin',
  };
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify([]) };
  }

  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/businesses' +
        '?select=*&status=eq.active&order=created_at.desc',
      { headers: sbHeaders() }
    );

    if (!res.ok) {
      console.error('public-businesses Supabase error:', res.status, await res.text());
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify([]) };
    }

    const rows = await res.json();
    const places = rows
      .map(toPublicPlace)
      .filter((place) => place.slug && place.name);

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(places) };
  } catch (err) {
    console.error('public-businesses error:', err.message);
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify([]) };
  }
};
