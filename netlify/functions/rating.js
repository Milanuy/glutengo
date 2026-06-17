/**
 * GlutenGo -- Netlify Function: rating
 * GET  /api/rating?slug=xxx
 * POST /api/rating { token, slug, score, comentario }
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY para operaciones DB (bypass RLS).
 * La identidad del usuario siempre se verifica via JWT antes de escribir.
 * Para no guardar el Gmail en claro, ratings.email contiene un hash estable.
 */

const { createHash } = require('crypto');

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY   =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SERVICE_ROLE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

// DB headers con service role (bypassa RLS, solo server-side)
function serviceHeaders(extra) {
  return Object.assign({
    apikey:        SERVICE_KEY || ANON_KEY,
    Authorization: 'Bearer ' + (SERVICE_KEY || ANON_KEY),
    'Content-Type': 'application/json',
  }, extra || {});
}

function userKeyFromEmail(email) {
  return 'sha256:' + createHash('sha256')
    .update(String(email || '').trim().toLowerCase())
    .digest('hex');
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // ─── GET /api/rating?slug=xxx ───────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'slug requerido' }) };
    }
    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
        '&select=score,comentario,created_at&order=created_at.desc',
        { headers: serviceHeaders() }
      );
      if (!res.ok) {
        return { statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
      }
      const rows  = await res.json();
      const count = rows.length;
      if (count === 0) {
        return { statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
      }
      const avg    = rows.reduce(function(s, r) { return s + r.score; }, 0) / count;
      const score  = Math.round((avg - 1) * 25);
      const recent = rows.slice(0, 5).map(function(r) {
        return {
          score:      r.score,
          comentario: r.comentario,
          fecha:      r.created_at ? r.created_at.slice(0, 10) : null,
          autor:      'Miembro GlutenGo',
        };
      });
      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ slug, count, avg: +avg.toFixed(2), score, recent }) };
    } catch (err) {
      console.error('rating GET error:', err.message);
      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
    }
  }

  // ─── POST /api/rating { token, slug, score, comentario } ──────────────────
  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON invalido' }) };
    }

    const token      = payload.token;
    const slug       = payload.slug;
    const score      = payload.score;
    const comentario = payload.comentario;

    if (!token || !slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'token y slug son requeridos' }) };
    }
    const scoreNum = parseInt(score, 10);
    if (!scoreNum || scoreNum < 1 || scoreNum > 5) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'score debe ser 1-5' }) };
    }

    // ── 1. Verificar JWT del usuario
    let userKey;
    try {
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + token }
      });
      if (!authRes.ok) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Sesion invalida' }) };
      }
      const userData = await authRes.json();
      if (!userData || !userData.email) {
        return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'No se pudo identificar al usuario' }) };
      }
      userKey = userKeyFromEmail(userData.email);
    } catch (err) {
      console.error('Auth check error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al verificar identidad' }) };
    }

    // ── 2. Verificar si ya existe rating para este usuario+lugar
    let existingId = null;
    try {
      const checkRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?select=id&email=eq.' + encodeURIComponent(userKey) +
        '&slug=eq.' + encodeURIComponent(slug),
        { headers: serviceHeaders() }
      );
      if (checkRes.ok) {
        const rows = await checkRes.json();
        if (rows.length > 0) existingId = rows[0].id;
      }
    } catch (_) { /* continuar con insert */ }

    // ── 3. Upsert usando service role (bypassa RLS)
    const comentarioTrimmed = comentario ? String(comentario).trim().slice(0, 500) : null;
    let ratingRes;

    try {
      if (existingId) {
        // Actualizar valoración existente
        ratingRes = await fetch(
          SUPABASE_URL + '/rest/v1/ratings?id=eq.' + existingId,
          {
            method: 'PATCH',
            headers: serviceHeaders({ Prefer: 'return=minimal' }),
            body: JSON.stringify({ score: scoreNum, comentario: comentarioTrimmed }),
          }
        );
      } else {
        // Insertar nueva valoración
        ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
          method: 'POST',
          headers: serviceHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify({ email: userKey, slug, score: scoreNum, comentario: comentarioTrimmed }),
        });
      }

      if (!ratingRes.ok) {
        const errText = await ratingRes.text();
        console.error('Rating upsert error:', ratingRes.status, errText);
        return { statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: 'No se pudo guardar la valoracion' }) };
      }
    } catch (err) {
      console.error('Rating save error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error interno' }) };
    }

    // ── 4. Recalcular score del lugar
    try {
      const allRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) + '&select=score',
        { headers: serviceHeaders() }
      );
      const allRows  = allRes.ok ? await allRes.json() : [];
      const count    = allRows.length;
      const avg      = count > 0 ? allRows.reduce(function(s, r) { return s + r.score; }, 0) / count : 0;
      const newScore = count > 0 ? Math.round((avg - 1) * 25) : null;

      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ ok: true, count, avg: +avg.toFixed(2), score: newScore }) };
    } catch (_) {
      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ ok: true, count: 1, avg: scoreNum, score: Math.round((scoreNum - 1) * 25) }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
