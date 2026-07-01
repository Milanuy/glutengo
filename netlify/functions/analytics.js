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
const APP_TIME_ZONE = 'America/Montevideo';
const LOCAL_OFFSET = '-03:00';

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
  Object.keys(value).slice(0, 40).forEach((key) => {
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

function headerValue(headers, names) {
  const source = headers || {};
  for (const name of names) {
    const lower = name.toLowerCase();
    const value = source[name] || source[lower];
    if (value) return text(decodeURIComponent(String(value)), 120);
  }
  return '';
}

function parseGeoJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function geoFromHeaders(headers) {
  const geoRaw = headerValue(headers, ['x-nf-geo', 'x-geo', 'x-netlify-geo']);
  const parsed = parseGeoJson(geoRaw);
  const city = headerValue(headers, ['x-city', 'x-nf-city', 'x-vercel-ip-city']) ||
    text(parsed.city || parsed.cityName, 80);
  const region = headerValue(headers, ['x-region', 'x-nf-region', 'x-vercel-ip-country-region']) ||
    text(parsed.region || parsed.regionName || parsed.subdivision, 80);
  const country = headerValue(headers, ['x-country', 'x-nf-country', 'x-vercel-ip-country', 'cf-ipcountry']) ||
    text(parsed.country || parsed.countryCode || parsed.countryName, 80);
  const parts = [city, region, country].filter(Boolean);
  return {
    geo_city: city,
    geo_region: region,
    geo_country: country,
    geo_label: parts.join(', '),
  };
}

function missingAnalyticsTable(raw) {
  return /analytics_events|PGRST205|42P01|does not exist|schema cache/i.test(String(raw || ''));
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

function daysBetweenDateKeys(from, to) {
  const a = String(from || '').split('-').map(Number);
  const b = String(to || '').split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some((part) => !Number.isFinite(part)) || b.some((part) => !Number.isFinite(part))) return 1;
  const start = Date.UTC(a[0], a[1] - 1, a[2]);
  const end = Date.UTC(b[0], b[1] - 1, b[2]);
  return Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

function dayKey(value) {
  return dateKeyInAppTimeZone(value);
}

function dateOnly(value) {
  const raw = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function monthOnly(value) {
  const raw = text(value, 12);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function localStart(date) {
  return new Date(date + 'T00:00:00.000' + LOCAL_OFFSET);
}

function localEnd(date) {
  return new Date(date + 'T23:59:59.999' + LOCAL_OFFSET);
}

function parseDateRange(query) {
  const month = monthOnly(query.month);
  const day = dateOnly(query.day);
  const from = dateOnly(query.from || query.start);
  const to = dateOnly(query.to || query.end);

  let start;
  let end;
  let mode = 'days';
  let label = '';
  let fromDate = '';
  let toDate = '';

  if (month) {
    const parts = month.split('-').map(Number);
    fromDate = month + '-01';
    const endDay = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
    toDate = month + '-' + pad2(endDay);
    mode = 'month';
    label = month;
  } else if (day) {
    fromDate = day;
    toDate = day;
    mode = 'day';
    label = day;
  } else if (from || to) {
    fromDate = from || to;
    toDate = to || from;
    if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
    mode = 'range';
    label = fromDate + ' / ' + toDate;
  } else {
    const days = Math.max(1, Math.min(Number(query.days || 7), 90));
    toDate = dateKeyInAppTimeZone(new Date());
    fromDate = addDaysToDateKey(toDate, -days + 1);
    mode = 'days';
    label = String(days);
  }

  if (daysBetweenDateKeys(fromDate, toDate) > 90) {
    toDate = addDaysToDateKey(fromDate, 89);
  }

  start = localStart(fromDate);
  end = localEnd(toDate);

  const days = daysBetweenDateKeys(fromDate, toDate);
  return { start, end, days, mode, label, from: fromDate, to: toDate, timeZone: APP_TIME_ZONE };
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

function cleanInterestLabel(value) {
  const label = text(value, 120);
  if (!label || label === 'Todos' || label === 'todos') return '';
  return label;
}

function collectFilterInterest(meta, buckets) {
  const kind = text(meta.interest_kind || meta.group, 40);
  const label = cleanInterestLabel(meta.interest_label || meta.label || meta.filter);
  if (!label) return;
  if (kind === 'zone') addCount(buckets.zones, label);
  if (kind === 'department') addCount(buckets.departments, label);
  if (kind === 'category') addCount(buckets.categories, label);
  if (kind === 'moment') addCount(buckets.moments, label);
  if (kind === 'offer') addCount(buckets.offers, label);
}

function collectPlaceContext(meta, buckets) {
  const zone = cleanInterestLabel(meta.zone_label || meta.zone_filter);
  const department = cleanInterestLabel(meta.department_label || meta.department_filter);
  const category = cleanInterestLabel(meta.category_label || meta.category_filter);
  const moment = cleanInterestLabel(meta.moment_label || meta.moment_filter);
  const offer = cleanInterestLabel(meta.offer_label || meta.offer_filter);
  if (zone) addCount(buckets.zones, zone);
  if (department) addCount(buckets.departments, department);
  if (category) addCount(buckets.categories, category);
  if (moment) addCount(buckets.moments, moment);
  if (offer) addCount(buckets.offers, offer);
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

function locationFromMeta(meta) {
  const city = text(meta.geo_city, 80);
  const region = text(meta.geo_region, 80);
  const country = text(meta.geo_country, 80);
  if (city) return [city, region, country].filter(Boolean).join(', ');
  if (region) return region;
  return '';
}

function campaignFromMeta(meta) {
  const campaign = text(meta.utm_campaign, 120);
  if (!campaign) return '';
  const source = text(meta.utm_source, 80);
  const medium = text(meta.utm_medium, 80);
  return campaign + (source ? ' · ' + source : '') + (medium ? ' / ' + medium : '');
}

function pathLabel(row, meta) {
  const path = row.path || '';
  if (row.slug || meta.name || meta.local) return 'Ficha: ' + (meta.name || meta.local || row.slug);
  if (path === '/' || path === '/index.html') return 'Home / mapa';
  if (path === '/negocios.html') return 'Página para locales';
  if (path === '/local.html') return 'Portal Mi local';
  if (path === '/admin.html') return 'Admin';
  if (path === '/lugar.html') return 'Ficha de local';
  if (path === '/gracias.html') return 'Gracias / registro enviado';
  if (path === '/bienvenido.html') return 'Bienvenida';
  return path || row.page || 'Sin dato';
}

function navigationKey(row, meta) {
  const slug = row.slug || meta.slug || '';
  if (slug) return 'slug:' + slug;
  if (row.path) return 'path:' + row.path;
  if (row.page) return 'page:' + row.page;
  return 'unknown';
}

function addNavigation(map, row, meta) {
  const key = navigationKey(row, meta);
  if (!map[key]) {
    map[key] = {
      label: pathLabel(row, meta),
      count: 0,
      path: row.path || '',
      page: row.page || '',
      slug: row.slug || meta.slug || '',
      value: key,
    };
  }
  map[key].count += 1;
}

function topNavigation(map, limit) {
  return Object.keys(map)
    .map((key) => map[key])
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit || 12);
}

function matchesNavigationFilter(row, meta, filters) {
  if (filters.path && row.path !== filters.path) return false;
  if (filters.page && row.page !== filters.page) return false;
  if (filters.slug && row.slug !== filters.slug && meta.slug !== filters.slug) return false;
  return true;
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

function summarize(rows, range, filters) {
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
  const filterStats = {};
  const trafficSources = {};
  const sourceTypes = {};
  const campaigns = {};
  const locations = {};
  const interestZones = {};
  const interestDepartments = {};
  const interestCategories = {};
  const interestMoments = {};
  const interestOffers = {};
  const placeZones = {};
  const placeCategories = {};
  const navigationPaths = {};
  const navigationEvents = {};
  const countedSourceSessions = new Set();
  const countedLocationSessions = new Set();
  const daily = {};
  const today = dateKeyInAppTimeZone(new Date());

  for (let i = 0; i < range.days; i += 1) {
    const date = addDaysToDateKey(range.from, i);
    daily[date] = { date, pageViews: 0, placeViews: 0, clicks: 0 };
  }

  rows.forEach((row) => {
    const type = row.event_type || '';
    const meta = row.metadata || {};
    if (!matchesNavigationFilter(row, meta, filters || {})) return;
    const date = dayKey(row.created_at);
    if (row.session_id) sessions.add(row.session_id);
    if (!daily[date]) daily[date] = { date, pageViews: 0, placeViews: 0, clicks: 0 };
    addCount(navigationEvents, pathLabel(row, meta));
    addNavigation(navigationPaths, row, meta);

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
      if (!countedLocationSessions.has(sessionKey)) {
        countedLocationSessions.add(sessionKey);
        addCount(locations, locationFromMeta(meta) || 'Ciudad no disponible');
      }
      const campaign = campaignFromMeta(meta);
      if (campaign) addCount(campaigns, campaign);
    }
    if (type === 'place_view') {
      totals.placeViews += 1;
      daily[date].placeViews += 1;
      addCount(topPlaces, meta.name || row.slug || 'Ficha sin nombre');
      if (meta.zone) addCount(placeZones, meta.zone);
      if (meta.category) addCount(placeCategories, meta.category);
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
    if (type === 'filter_use') {
      addCount(filterStats, meta.label || meta.filter || 'filtro');
      collectFilterInterest(meta, {
        zones: interestZones,
        departments: interestDepartments,
        categories: interestCategories,
        moments: interestMoments,
        offers: interestOffers,
      });
    }
    if (type === 'cta_click' && row.slug) {
      collectPlaceContext(meta, {
        zones: interestZones,
        departments: interestDepartments,
        categories: interestCategories,
        moments: interestMoments,
        offers: interestOffers,
      });
    }
  });

  totals.uniqueSessions = sessions.size;

  return {
    days: range.days,
    range: {
      mode: range.mode,
      label: range.label,
      from: range.from,
      to: range.to,
      timeZone: range.timeZone,
      navigation: filters || {},
    },
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
    filters: topFromMap(filterStats, 10),
    trafficSources: topFromMap(trafficSources, 10),
    sourceTypes: topFromMap(sourceTypes, 8),
    campaigns: topFromMap(campaigns, 8),
    locations: topFromMap(locations, 10),
    interestZones: topFromMap(interestZones, 10),
    interestDepartments: topFromMap(interestDepartments, 10),
    interestCategories: topFromMap(interestCategories, 8),
    interestMoments: topFromMap(interestMoments, 8),
    interestOffers: topFromMap(interestOffers, 5),
    placeZones: topFromMap(placeZones, 10),
    placeCategories: topFromMap(placeCategories, 8),
    navigationPaths: topNavigation(navigationPaths, 18),
    navigationEvents: topFromMap(navigationEvents, 12),
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
      metadata: Object.assign(metadata(body.metadata), geoFromHeaders(event.headers)),
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
    const range = parseDateRange(query);
    const filters = {
      path: text(query.path, 160),
      page: text(query.page, 80),
      slug: text(query.slug, 120),
    };

    const url = SUPABASE_URL + '/rest/v1/analytics_events' +
      '?select=id,event_type,page,path,slug,session_id,referrer,created_at,metadata' +
      '&created_at=gte.' + encodeURIComponent(range.start.toISOString()) +
      '&created_at=lte.' + encodeURIComponent(range.end.toISOString()) +
      '&order=created_at.desc&limit=5000';

    try {
      const res = await fetch(url, { headers: sbHeaders() });
      if (!res.ok) {
        const raw = await res.text();
        if (missingAnalyticsTable(raw)) return json(200, { pendingMigration: true, days: range.days, range, totals: {}, daily: [], topPlaces: [], placeStats: [], clicks: [], filters: [], trafficSources: [], sourceTypes: [], campaigns: [], locations: [], interestZones: [], interestDepartments: [], interestCategories: [], interestMoments: [], interestOffers: [], placeZones: [], placeCategories: [], navigationPaths: [], navigationEvents: [] });
        return json(500, { error: raw });
      }
      const rows = await res.json();
      return json(200, summarize(Array.isArray(rows) ? rows : [], range, filters));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method Not Allowed' });
};
