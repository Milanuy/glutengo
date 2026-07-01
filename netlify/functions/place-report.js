/**
 * GlutenGo — reportes comunitarios de fichas
 *
 * POST  /api/place-report { token, slug, placeName, issueType, message }
 * GET   /api/place-report        admin: lista reportes pendientes
 * PATCH /api/place-report { id, action, note } admin: marca revisado/rechazado
 *
 * Se guarda en analytics_events con event_type "cta_click" y metadata.kind
 * "place_report" para evitar otra tabla en el lanzamiento.
 */

const { createHash } = require('crypto');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'glutengo2026';

const ISSUE_LABELS = {
  cerrado: 'El local cerró o no existe',
  ubicacion: 'Ubicación o dirección incorrecta',
  menu: 'Menú u opciones sin gluten incorrectas',
  horarios: 'Horarios incorrectos',
  contacto: 'Contacto incorrecto',
  seguridad: 'Duda de protocolo o contaminación cruzada',
  otro: 'Otro dato a revisar',
};

const MAX_REPORTS_PER_DAY = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body || {}) };
}

function text(value, limit) {
  return String(value == null ? '' : value).trim().slice(0, limit || 220);
}

function serviceHeaders(extra) {
  return Object.assign({
    apikey: SERVICE_KEY,
    Authorization: 'Bearer ' + SERVICE_KEY,
    'Content-Type': 'application/json',
  }, extra || {});
}

function userKeyFromEmail(email) {
  return 'sha256:' + createHash('sha256')
    .update(String(email || '').trim().toLowerCase())
    .digest('hex');
}

async function currentUser(token) {
  if (!token || !ANON_KEY) return null;
  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user && user.email ? user : null;
}

async function recentReportCount(userKey) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = SUPABASE_URL + '/rest/v1/analytics_events' +
    '?select=id,metadata' +
    '&event_type=eq.cta_click' +
    '&created_at=gte.' + encodeURIComponent(since) +
    '&order=created_at.desc&limit=300';
  const res = await fetch(url, { headers: serviceHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const meta = row.metadata || {};
    return meta.kind === 'place_report' && meta.reporter_key === userKey;
  }).length;
}

function reportFromRow(row) {
  const meta = row.metadata || {};
  return {
    id: row.id,
    slug: row.slug || '',
    placeName: meta.place_name || row.slug || '',
    issueType: meta.issue_type || 'otro',
    issueLabel: meta.issue_label || ISSUE_LABELS[meta.issue_type] || ISSUE_LABELS.otro,
    message: meta.message || '',
    status: meta.report_status || 'pending',
    adminNote: meta.admin_note || '',
    created_at: row.created_at,
  };
}

async function listReports(status) {
  const url = SUPABASE_URL + '/rest/v1/analytics_events' +
    '?select=id,event_type,page,path,slug,created_at,metadata' +
    '&event_type=eq.cta_click' +
    '&order=created_at.desc&limit=500';
  const res = await fetch(url, { headers: serviceHeaders() });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  const wanted = status || 'pending';
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row.metadata && row.metadata.kind === 'place_report')
    .map(reportFromRow)
    .filter((row) => wanted === 'all' || row.status === wanted)
    .slice(0, 120);
}

async function fetchReportEvent(id) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/analytics_events?select=id,metadata&event_type=eq.cta_click&id=eq.' + encodeURIComponent(id) + '&limit=1',
    { headers: serviceHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

async function patchReport(id, patch) {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/analytics_events?id=eq.' + encodeURIComponent(id),
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

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: corsHeaders, body: '' };
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Supabase no configurado' });

  if (event.httpMethod === 'GET') {
    const token = event.headers['x-admin-token'] || '';
    if (token !== ADMIN_PASS) return json(401, { error: 'No autorizado' });
    const status = text((event.queryStringParameters || {}).status || 'pending', 20);
    try {
      return json(200, await listReports(['pending', 'reviewed', 'rejected', 'all'].includes(status) ? status : 'pending'));
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return json(400, { error: 'JSON inválido' });
    }

    const token = text(body.token, 3000);
    const user = await currentUser(token);
    if (!user) return json(401, { error: 'Necesitás entrar con Google para enviar el reporte.' });

    const slug = text(body.slug, 120);
    const placeName = text(body.placeName, 180);
    const issueType = ISSUE_LABELS[text(body.issueType, 30)] ? text(body.issueType, 30) : 'otro';
    const message = text(body.message, 700);
    if (!slug) return json(400, { error: 'Falta identificar el local.' });
    if (message.length < 6) return json(400, { error: 'Contanos brevemente qué dato hay que revisar.' });

    const reporterKey = userKeyFromEmail(user.email);
    try {
      const count = await recentReportCount(reporterKey);
      if (count >= MAX_REPORTS_PER_DAY) {
        return json(429, { error: 'Llegaste al máximo de reportes por hoy. Gracias por ayudar a cuidar la guía.' });
      }
    } catch (err) {
      return json(500, { error: 'No pudimos validar el reporte. Intentá de nuevo en unos minutos.' });
    }

    const row = {
      event_type: 'cta_click',
      page: 'place',
      path: '/lugar.html',
      slug,
      session_id: 'report:' + createHash('sha256').update(reporterKey).digest('hex').slice(0, 18),
      referrer: text(event.headers.referer || event.headers.referrer, 500),
      user_agent: text(event.headers['user-agent'], 400),
      metadata: {
        kind: 'place_report',
        report_status: 'pending',
        issue_type: issueType,
        issue_label: ISSUE_LABELS[issueType],
        message,
        place_name: placeName,
        reporter_key: reporterKey,
      },
    };

    const res = await fetch(SUPABASE_URL + '/rest/v1/analytics_events', {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(row),
    });
    if (!res.ok) return json(500, { error: (await res.text()).slice(0, 240) });
    return json(200, { ok: true });
  }

  if (event.httpMethod === 'PATCH') {
    const token = event.headers['x-admin-token'] || '';
    if (token !== ADMIN_PASS) return json(401, { error: 'No autorizado' });

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch (_) {
      return json(400, { error: 'JSON inválido' });
    }
    const id = text(body.id, 120);
    const action = text(body.action, 20);
    if (!id) return json(400, { error: 'id requerido' });
    if (!['reviewed', 'rejected'].includes(action)) return json(400, { error: 'acción inválida' });

    try {
      const row = await fetchReportEvent(id);
      if (!row || !row.metadata || row.metadata.kind !== 'place_report') {
        return json(404, { error: 'Reporte no encontrado' });
      }
      const metadata = Object.assign({}, row.metadata, {
        report_status: action,
        admin_note: text(body.note, 700),
        reviewed_at: new Date().toISOString(),
      });
      const updated = await patchReport(id, { metadata });
      return json(200, { ok: true, report: reportFromRow(updated) });
    } catch (err) {
      return json(500, { error: err.message });
    }
  }

  return json(405, { error: 'Method Not Allowed' });
};
