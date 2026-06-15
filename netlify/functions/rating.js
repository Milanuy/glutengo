/**
 * GlutenGo -- Netlify Function: rating
 * GET  /api/rating?slug=xxx
 * POST /api/rating { token, slug, score, comentario }
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // GET
  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'slug requerido' }) };
    }
    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) + '&select=score,comentario,created_at&order=created_at.desc',
        { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } }
      );
      if (!res.ok) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
      }
      const rows  = await res.json();
      const count = rows.length;
      if (count === 0) {
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
      }
      const avg    = rows.reduce(function(s, r) { return s + r.score; }, 0) / count;
      const score  = Math.round((avg - 1) * 25);
      const recent = rows.slice(0, 5).map(function(r) {
        return { score: r.score, comentario: r.comentario, fecha: r.created_at ? r.created_at.slice(0, 10) : null };
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ slug, count, avg: +avg.toFixed(2), score, recent }) };
    } catch (err) {
      console.error('rating GET error:', err.message);
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
    }
  }

  // POST
  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON invalido' }) };
    }

    const token = payload.token;
    const slug  = payload.slug;
    const score = payload.score;
    const comentario = payload.comentario;

    if (!token || !slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'token y slug son requeridos' }) };
    }
    const scoreNum = parseInt(score, 10);
    if (!scoreNum || scoreNum < 1 || scoreNum > 5) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'score debe ser 1-5' }) };
    }

    // Verify JWT
    let userEmail;
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
      userEmail = userData.email;
    } catch (err) {
      console.error('Auth check error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al verificar identidad' }) };
    }

    // Upsert rating
    try {
      const ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          email: userEmail,
          slug: slug,
          score: scoreNum,
          comentario: comentario ? comentario.trim().slice(0, 500) : null
        })
      });

      if (!ratingRes.ok) {
        const errText = await ratingRes.text();
        console.error('Rating upsert error:', ratingRes.status, errText);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'No se pudo guardar la valoracion' }) };
      }

      // Recalculate score
      const allRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) + '&select=score',
        { headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } }
      );
      const allRows  = allRes.ok ? await allRes.json() : [];
      const count    = allRows.length;
      const avg      = count > 0 ? allRows.reduce(function(s, r) { return s + r.score; }, 0) / count : 0;
      const newScore = count > 0 ? Math.round((avg - 1) * 25) : null;

      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true, count: count, avg: +avg.toFixed(2), score: newScore }) };
    } catch (err) {
      console.error('Rating save error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error interno' }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
