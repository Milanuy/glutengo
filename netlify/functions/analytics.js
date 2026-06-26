/**
 * GlutenGo — First-party analytics
 *
 * POST /api/analytics stores anonymous product events.
 * GET  /api/analytics returns admin-only summaries.
 *
 * It intentionally does not store IP addresses, emails, names, or auth ids.
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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json',
};

const EVENTS = new Set([
  'page_view',
  'place_view',
  'outbound_click',
  'cta_click',
  'filter_use',
  'search_use',
  'map_interaction',
  'rating_start',
  'rating_submit',
  'business_form_submit',
  'mp_click',
  'share_click',
]);

function sbHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body || {}) };
}

function unauthorized() {
  return json(401, { error: 'No autorizado' });
}

function text(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 180);
}

function metadata(value) {
  const clean = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return clean;
  Object.keys(value).slice(0, 24).forEach((key) => {
    const safeKey = text(key, 60);
    if (!safeKey) return;
    const item = value[key];
    if (item == null) return;
    if (typeof item === 'number' || typeof item === 'boolean') {
      clean[safeKey] = item;
      return;
    }
    if (Array.isArray(item)) {
      clean[safeKey] = item.slice(0, 8).map((entry) => text(entry, 280));
      return;
    }
    clean[safeKey] = text(item, 280);
  });
  return clean;
}

function missingAnalyticsTable(raw) {
  return /analytics_events|PGRST205|42P01|does not exist|schema cache/i.test(String(raw || ''));
}

function dayKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addCount(map, key, amount) {
  const safeKey = key || 'sin dato';
  map[safeKey] = (map[safeKey] || 0) + (amount || 1);
}

function topFromMap(map, limit) {
  return Object.keys(map)
    .map((key) => ({ label: key, count: map[key] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit || 8);
}

function summarize(rows, days) {
  const sessions = new Set();
  const totals = {
    pageViews: 0,
    placeViews: 0,
    outboundClicks: 0,
    ctaClicks: 0,
    businessForms: 0,
    mpClicks: 0,
    ratingSubmits: 0,
    todayViews: 0,
    uniqueSessions: 0,
  };
  const topPlaces = {};
  const clicks = {};
  const filters = {};
  const daily = {};
  const today = new Date().toISOString().slice(0, 10);

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    daily[d.toISOString().slice(0, 10)] = { date: d.toISOString().slice(0, 10), pageViews: 0, placeViews: 0, clicks: 0 };
  }

  rows.forEach((row) => {
    const type = row.event_type || '';
    const meta = row.metadata || {};
    const date = dayKey(row.created_at);
    if (row.session_id) sessions.add(row.session_id);
    if (!daily[date]) daily[date] = { date, pageViews: 0, placeViews: 0, clicks: 0 };

    if (type === 'page_view') {
      totals.pageViews += 1;
      daily[date].pageViews += 1;
      if (date === today) totals.todayViews += 1;
    }
    if (type === 'place_view') {
      totals.placeViews += 1;
      daily[date].placeViews += 1;
      addCount(topPlaces, meta.name || row.slug || 'Ficha sin nombre');
    }
    if (type === 'outbound_click') {
      totals.outboundClicks += 1;
      daily[date].clicks += 1;
      addCount(clicks, meta.target || 'click externo');
    }
    if (type === 'cta_click') {
      totals.ctaClicks += 1;
      daily[date].clicks += 1;
      addCount(clicks, meta.target || 'cta');
    }
    if (type === 'business_form_submit') totals.businessForms += 1;
    if (type === 'mp_click') totals.mpClicks += 1;
    if (type === 'rating_submit') totals.ratingSubmits += 1;
    if (type === 'filter_use') addCount(filters, meta.label || meta.filter || 'filtro');
  });

  totals.uniqueSessions = sessions.size;

  return {
    days,
    totals,
    topPlaces: topFromMap(topPlaces, 10),
    clicks: topFromMap(clicks, 10),
    filters: topFromMap(filters, 10),
    daily: Object.keys(daily).sort().map((key) => daily[key]),
    generatedAt: new Date().toISOString(),
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Supabase service key no configurada en Netlify' });
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (_) {
      return json(400, { error: 'JSON inválido' });
    }

    const eventType = text(body.event_type || body.event, 60);
    if (!EVENTS.has(eventType)) return json(400, { error: 'evento inválido' });

    const row = {
      event_type: eventType,
      page: text(body.page, 80) || null,
      path: text(body.path, 160) || null,
      slug: text(body.slug, 120) || null,
      session_id: text(body.session_id || body.sessionId, 120) || null,
      referrer: text(body.referrer, 260) || null,
      user_agent: text(event.headers['user-agent'], 260) || null,
      metadata: metadata(body.metadata),
    };

    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/analytics_events', {
        method: 'POST',
        headers: sbHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        const raw = await res.text();
        if (missingAnalyticsTable(raw)) return json(200, { ok: false, pendingMigration: true });
        return json(500, { error: raw });
      }
      return { statusCode: 204, headers: corsHeaders, body: '' };
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'GET') {
    const token = event.headers['x-admin-token'] || '';
    if (token !== ADMIN_PASS) return unauthorized();
    const query = event.queryStringParameters || {};
    const days = Math.max(1, Math.min(Number(query.days || 7), 60));
    const since = new Date();
    since.setDate(since.getDate() - days + 1);
    since.setHours(0, 0, 0, 0);

    const url = SUPABASE_URL + '/rest/v1/analytics_events' +
      '?select=event_type,page,path,slug,session_id,created_at,metadata' +
      '&created_at=gte.' + encodeURIComponent(since.toISOString()) +
      '&order=created_at.desc&limit=5000';

    try {
      const res = await fetch(url, { headers: sbHeaders() });
      if (!res.ok) {
        const raw = await res.text();
        if (missingAnalyticsTable(raw)) return json(200, { pendingMigration: true, days, totals: {}, daily: [], topPlaces: [], clicks: [], filters: [] });
        return json(500, { error: raw });
      }
      const rows = await res.json();
      return json(200, summarize(Array.isArray(rows) ? rows : [], days));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method Not Allowed' });
};
