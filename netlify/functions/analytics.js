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

function hostFromReferrer(referrer) {
  if (!referrer) return '';
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

function sourceTypeLabel(type) {
  const labels = {
    campaign: 'Campañas UTM',
    social: 'Redes sociales',
    search: 'Buscadores',
    referral: 'Sitios externos',
    direct: 'Directo / sin referencia',
    internal: 'Navegación interna',
  };
  return labels[type] || type || 'Sin dato';
}

function sourceFromRow(row, meta) {
  const utmSource = text(meta.utm_source, 80);
  const utmMedium = text(meta.utm_medium, 80);
  const sourceName = text(meta.source_name, 120);
  const sourceType = text(meta.source_type, 80);
  const refHost = text(meta.referrer_host, 120) || hostFromReferrer(row.referrer || '');

  if (utmSource) {
    return {
      type: utmMedium || 'campaign',
      label: utmSource + (utmMedium ? ' / ' + utmMedium : ''),
    };
  }
  if (sourceName && sourceName !== 'Directo' && sourceName !== 'GlutenGo') {
    return { type: sourceType || 'referral', label: sourceName };
  }
  if (refHost) {
    if (/instagram|facebook|tiktok|linkedin|twitter|x\.com/.test(refHost)) return { type: 'social', label: refHost };
    if (/google|bing|yahoo|duckduckgo/.test(refHost)) return { type: 'search', label: refHost };
    if (/glutengo\.com\.uy|glutengo\.netlify\.app/.test(refHost)) return { type: 'internal', label: 'GlutenGo' };
    return { type: 'referral', label: refHost };
  }
  return { type: 'direct', label: 'Directo / sin referencia' };
}

function campaignFromMeta(meta) {
  const campaign = text(meta.utm_campaign, 120);
  if (!campaign) return '';
  const source = text(meta.utm_source, 80);
  const medium = text(meta.utm_medium, 80);
  return campaign + (source ? ' · ' + source : '') + (medium ? ' / ' + medium : '');
}

function placeKey(row, meta) {
  return row.slug || meta.slug || meta.local || meta.name || '';
}

function ensurePlace(stats, row, meta) {
  const key = placeKey(row, meta);
  if (!key) return null;
  if (!stats[key]) {
    stats[key] = {
      slug: row.slug || '',
      label: meta.name || meta.local || row.slug || 'Ficha sin nombre',
      views: 0,
      contactClicks: 0,
      listingClicks: 0,
      shares: 0,
      ratings: 0,
      whatsapp: 0,
      instagram: 0,
      maps: 0,
    };
  }
  if ((meta.name || meta.local) && stats[key].label === (row.slug || 'Ficha sin nombre')) {
    stats[key].label = meta.name || meta.local;
  }
  if (row.slug && !stats[key].slug) stats[key].slug = row.slug;
  return stats[key];
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
  const placeStats = {};
  const clicks = {};
  const filters = {};
  const trafficSources = {};
  const sourceTypes = {};
  const campaigns = {};
  const countedSourceSessions = new Set();
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

      const source = sourceFromRow(row, meta);
      const sessionKey = row.session_id || ('event-' + (row.id || row.created_at || Math.random()));
      if (!countedSourceSessions.has(sessionKey)) {
        countedSourceSessions.add(sessionKey);
        addCount(trafficSources, source.label);
        addCount(sourceTypes, sourceTypeLabel(source.type));
      }
      const campaign = campaignFromMeta(meta);
      if (campaign) addCount(campaigns, campaign);
    }
    if (type === 'place_view') {
      totals.placeViews += 1;
      daily[date].placeViews += 1;
      addCount(topPlaces, meta.name || row.slug || 'Ficha sin nombre');
      const place = ensurePlace(placeStats, row, meta);
      if (place) place.views += 1;
    }
    if (type === 'outbound_click') {
      totals.outboundClicks += 1;
      daily[date].clicks += 1;
      addCount(clicks, meta.target || 'click externo');
      const place = ensurePlace(placeStats, row, meta);
      if (place) {
        place.contactClicks += 1;
        if (meta.target === 'whatsapp') place.whatsapp += 1;
        if (meta.target === 'instagram') place.instagram += 1;
        if (meta.target === 'google-maps') place.maps += 1;
      }
    }
    if (type === 'cta_click') {
      totals.ctaClicks += 1;
      daily[date].clicks += 1;
      addCount(clicks, meta.target || 'cta');
      const place = ensurePlace(placeStats, row, meta);
      if (place && row.slug) place.listingClicks += 1;
    }
    if (type === 'business_form_submit') totals.businessForms += 1;
    if (type === 'mp_click') totals.mpClicks += 1;
    if (type === 'rating_submit') {
      totals.ratingSubmits += 1;
      const place = ensurePlace(placeStats, row, meta);
      if (place) place.ratings += 1;
    }
    if (type === 'share_click') {
      const place = ensurePlace(placeStats, row, meta);
      if (place) place.shares += 1;
    }
    if (type === 'filter_use') addCount(filters, meta.label || meta.filter || 'filtro');
  });

  totals.uniqueSessions = sessions.size;

  return {
    days,
    totals,
    topPlaces: topFromMap(topPlaces, 10),
    placeStats: Object.keys(placeStats)
      .map((key) => placeStats[key])
      .sort((a, b) =>
        (b.views - a.views) ||
        (b.contactClicks - a.contactClicks) ||
        (b.listingClicks - a.listingClicks) ||
        a.label.localeCompare(b.label)
      ),
    clicks: topFromMap(clicks, 10),
    filters: topFromMap(filters, 10),
    trafficSources: topFromMap(trafficSources, 10),
    sourceTypes: topFromMap(sourceTypes, 8),
    campaigns: topFromMap(campaigns, 8),
    audience: {
      demographicsAvailable: false,
      message: 'Google login básico entrega identidad de acceso (nombre, email y foto si el usuario lo permite), no edad ni género confiables. Para medir edad/género hay que pedirlo como dato opcional con consentimiento o usar una fuente externa.',
    },
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
      '?select=id,event_type,page,path,slug,session_id,referrer,created_at,metadata' +
      '&created_at=gte.' + encodeURIComponent(since.toISOString()) +
      '&order=created_at.desc&limit=5000';

    try {
      const res = await fetch(url, { headers: sbHeaders() });
      if (!res.ok) {
        const raw = await res.text();
        if (missingAnalyticsTable(raw)) return json(200, { pendingMigration: true, days, totals: {}, daily: [], topPlaces: [], placeStats: [], clicks: [], filters: [], trafficSources: [], sourceTypes: [], campaigns: [] });
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
