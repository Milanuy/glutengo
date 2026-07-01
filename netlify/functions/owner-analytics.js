/**
 * GlutenGo — Reporte para locales
 *
 * GET /api/owner-analytics?business_id=123&days=30
 *
 * El local entra con Google/Supabase y solo ve metricas de locales
 * vinculados a su email.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;
const APP_TIME_ZONE = 'America/Montevideo';
const LOCAL_OFFSET = '-03:00';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

function missingAnalyticsTable(raw) {
  return /analytics_events|PGRST205|42P01|does not exist|schema cache/i.test(String(raw || ''));
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

function businessPublic(row) {
  const cfg = parseNotes(row.admin_notes || row.mensaje);
  const slug = cfg.slug || slugify(row.nombre || row.id);
  return {
    id: row.id,
    name: row.nombre || 'Local sin nombre',
    slug,
    plan: row.plan || 'basico',
    status: row.status || 'pending',
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateKeyInAppTimeZone(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') byType[part.type] = part.value;
  });
  return byType.year + '-' + byType.month + '-' + byType.day;
}

function addDaysToDateKey(dateKey, amount) {
  const parts = String(dateKey || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return '';
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + amount, 12));
  return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
}

function dayKey(value) {
  return dateKeyInAppTimeZone(value);
}

function localStartFromDays(days) {
  const today = dateKeyInAppTimeZone(new Date());
  const start = addDaysToDateKey(today, -days + 1);
  return new Date(start + 'T00:00:00.000' + LOCAL_OFFSET);
}

function channelLabel(target) {
  return {
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
    'google-maps': 'Cómo llegar / mapa',
    menu: 'Ver menú',
    'open-place-card': 'Abrió ficha desde la guía',
    'ver-ficha': 'Abrió ficha desde mapa',
    share: 'Compartir',
  }[target] || target || 'Otro clic';
}

function addCount(map, key) {
  const safeKey = text(key, 120);
  if (!safeKey || safeKey === 'Todos' || safeKey === 'todos') return;
  map[safeKey] = (map[safeKey] || 0) + 1;
}

function topFromMap(map, limit) {
  return Object.keys(map)
    .map((key) => ({ label: key, count: map[key] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit || 8);
}

function collectListingContext(report, meta) {
  addCount(report.contexts, meta.zone_label || meta.zone_filter);
  addCount(report.contexts, meta.department_label || meta.department_filter);
  addCount(report.contexts, meta.category_label || meta.category_filter);
  addCount(report.contexts, meta.moment_label || meta.moment_filter);
  addCount(report.contexts, meta.offer_label || meta.offer_filter);
}

function newReport(business, days) {
  const daily = {};
  const today = dateKeyInAppTimeZone(new Date());
  const start = addDaysToDateKey(today, -days + 1);
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDaysToDateKey(start, days - 1 - i);
    daily[date] = { date, views: 0, clicks: 0 };
  }
  return {
    business,
    days,
    views: 0,
    listingClicks: 0,
    contactClicks: 0,
    intentClicks: 0,
    interestRate: 0,
    whatsapp: 0,
    instagram: 0,
    maps: 0,
    menu: 0,
    shares: 0,
    ratings: 0,
    channels: {},
    contexts: {},
    daily,
  };
}

function finalizeReport(report) {
  report.intentClicks = report.listingClicks + report.contactClicks + report.shares;
  report.interestRate = report.views ? report.intentClicks / report.views : 0;
  report.channels = Object.keys(report.channels)
    .map((key) => ({ label: channelLabel(key), count: report.channels[key] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  report.contexts = topFromMap(report.contexts, 8);
  report.daily = Object.keys(report.daily).sort().map((key) => report.daily[key]);
  return report;
}

function addChannel(report, target) {
  const key = target || 'otro';
  report.channels[key] = (report.channels[key] || 0) + 1;
}

function summarize(rows, businesses, days) {
  const bySlug = {};
  businesses.forEach((business) => {
    bySlug[business.slug] = newReport(business, days);
  });

  rows.forEach((row) => {
    const meta = row.metadata || {};
    const slug = row.slug || meta.slug || '';
    const report = bySlug[slug];
    if (!report) return;
    const date = dayKey(row.created_at);
    if (!report.daily[date]) report.daily[date] = { date, views: 0, clicks: 0 };

    if (row.event_type === 'place_view') {
      report.views += 1;
      report.daily[date].views += 1;
      return;
    }

    if (row.event_type === 'cta_click') {
      report.listingClicks += 1;
      report.daily[date].clicks += 1;
      addChannel(report, meta.target || 'open-place-card');
      collectListingContext(report, meta);
      return;
    }

    if (row.event_type === 'outbound_click') {
      report.contactClicks += 1;
      report.daily[date].clicks += 1;
      addChannel(report, meta.target || 'contacto');
      if (meta.target === 'whatsapp') report.whatsapp += 1;
      if (meta.target === 'instagram') report.instagram += 1;
      if (meta.target === 'google-maps') report.maps += 1;
      if (meta.target === 'menu') report.menu += 1;
      return;
    }

    if (row.event_type === 'share_click') {
      report.shares += 1;
      report.daily[date].clicks += 1;
      addChannel(report, 'share');
      return;
    }

    if (row.event_type === 'rating_submit') {
      report.ratings += 1;
    }
  });

  return Object.keys(bySlug).map((slug) => finalizeReport(bySlug[slug]));
}

async function ownerBusinesses(email, businessId) {
  let url = SUPABASE_URL + '/rest/v1/businesses' +
    '?select=*&email=eq.' + encodeURIComponent(email) +
    '&order=created_at.desc';
  if (businessId) url += '&id=eq.' + encodeURIComponent(businessId);
  const res = await fetch(url, { headers: serviceHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).map(businessPublic);
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase no configurado' });

  const user = await currentUser(event);
  if (!user) return json(401, { error: 'Necesitás entrar con Google' });
  const email = String(user.email || '').trim().toLowerCase();
  const query = event.queryStringParameters || {};
  const days = Math.max(1, Math.min(Number(query.days || 30), 90));
  const businessId = text(query.business_id || query.businessId, 80);

  try {
    const businesses = await ownerBusinesses(email, businessId);
    if (!businesses.length) return json(200, { days, reports: [], generatedAt: new Date().toISOString() });

    const since = localStartFromDays(days);
    const eventsUrl = SUPABASE_URL + '/rest/v1/analytics_events' +
      '?select=event_type,slug,created_at,metadata' +
      '&created_at=gte.' + encodeURIComponent(since.toISOString()) +
      '&order=created_at.desc&limit=5000';
    const eventsRes = await fetch(eventsUrl, { headers: serviceHeaders() });
    if (!eventsRes.ok) {
      const raw = await eventsRes.text();
      if (missingAnalyticsTable(raw)) {
        return json(200, { days, pendingMigration: true, reports: [], generatedAt: new Date().toISOString() });
      }
      return json(500, { error: raw });
    }

    const rows = await eventsRes.json();
    return json(200, {
      days,
      reports: summarize(Array.isArray(rows) ? rows : [], businesses, days),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};
