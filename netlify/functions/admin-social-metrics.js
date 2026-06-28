/**
 * GlutenGo — métricas sociales admin-only
 *
 * GET  /api/admin-social-metrics
 * POST /api/admin-social-metrics
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

const CHANNELS = new Set(['instagram', 'tiktok', 'facebook', 'otro']);

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body || {}) };
}

function unauthorized() {
  return json(401, { error: 'No autorizado' });
}

function sbHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

function text(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 220);
}

function intValue(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function dateValue(value) {
  const raw = text(value, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function missingSocialTable(raw) {
  return /social_metrics|PGRST205|42P01|does not exist|schema cache/i.test(String(raw || ''));
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };

  const token = event.headers['x-admin-token'] || '';
  if (token !== ADMIN_PASS) return unauthorized();
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase no configurado' });

  if (event.httpMethod === 'GET') {
    const query = event.queryStringParameters || {};
    const limit = Math.max(1, Math.min(Number(query.limit || 120), 300));
    const channel = text(query.channel, 30);
    const filter = CHANNELS.has(channel) ? '&channel=eq.' + encodeURIComponent(channel) : '';
    const url = SUPABASE_URL + '/rest/v1/social_metrics' +
      '?select=*&order=metric_date.desc,created_at.desc&limit=' + limit + filter;

    try {
      const res = await fetch(url, { headers: sbHeaders() });
      if (!res.ok) {
        const raw = await res.text();
        if (missingSocialTable(raw)) return json(200, { pendingMigration: true, rows: [] });
        return json(500, { error: raw });
      }
      const rows = await res.json();
      return json(200, Array.isArray(rows) ? rows : []);
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (_) {
      return json(400, { error: 'JSON invalido' });
    }

    const channel = CHANNELS.has(text(body.channel, 30)) ? text(body.channel, 30) : 'instagram';
    const row = {
      channel,
      metric_date: dateValue(body.metric_date),
      followers: intValue(body.followers),
      reach: intValue(body.reach),
      profile_visits: intValue(body.profile_visits),
      website_clicks: intValue(body.website_clicks),
      posts: intValue(body.posts),
      notes: text(body.notes, 1000) || null,
    };

    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/social_metrics', {
        method: 'POST',
        headers: sbHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        const raw = await res.text();
        if (missingSocialTable(raw)) return json(200, { pendingMigration: true });
        return json(500, { error: raw });
      }
      const rows = await res.json();
      return json(200, rows[0] || row);
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method Not Allowed' });
};
