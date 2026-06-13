/**
 * GlutenGo — Netlify Function: rating
 *
 * GET  /api/rating?slug=xxx         → devuelve score promedio y cantidad de valoraciones
 * POST /api/rating { token, slug, score, comentario }  → guarda la valoración
 *
 * Score: 1–5 estrellas → GlutenGo Score = (avg - 1) * 25  (rango 0–100)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // ─────────────────────────────────────────────────────────────
  // GET — Score de un lugar
  // ─────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'slug requerido' }) };
    }

    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) + '&select=score',
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + SUPABASE_KEY,
          },
        }
      );

      if (!res.ok) throw new Error('Supabase GET failed: ' + res.status);

      const rows = await res.json();
      const count = rows.length;

      if (count === 0) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ slug, count: 0, avg: null, score: null }),
        };
      }

      const avg = rows.reduce((s, r) => s + r.score, 0) / count;
      const score = Math.round((avg - 1) * 25); // 1→0, 3→50, 5→100

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ slug, count, avg: +avg.toFixed(2), score }),
      };
    } catch (err) {
      console.error('rating GET error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error interno' }) };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST — Guardar valoración
  // ─────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    const { token, slug, score, comentario } = payload;

    // Validaciones
    if (!token || !slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'token y slug son requeridos' }) };
    }
    const scoreNum = parseInt(score, 10);
    if (!scoreNum || scoreNum < 1 || scoreNum > 5) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'score debe ser 1–5' }) };
    }

    // ── Verificar que el token existe y obtener el email
    let userEmail;
    try {
      const userRes = await fetch(
        SUPABASE_URL + '/rest/v1/waitlist?token=eq.' + encodeURIComponent(token) + '&select=email',
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + SUPABASE_KEY,
          },
        }
      );

      if (!userRes.ok) throw new Error('Supabase user lookup failed');
      const users = await userRes.json();

      if (!users || users.length === 0) {
        return {
          statusCode: 401,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Token inválido. Registrate primero.' }),
        };
      }
      userEmail = users[0].email;
    } catch (err) {
      console.error('Token lookup error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al verificar token' }) };
    }

    // ── Insertar/actualizar valoración (UPSERT por email+slug)
    try {
      const ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          email: userEmail,
          slug,
          score: scoreNum,
          comentario: (comentario || '').trim().slice(0, 500) || null,
        }),
      });

      if (!ratingRes.ok && ratingRes.status !== 409) {
        const errText = await ratingRes.text();
        console.error('Rating insert error:', errText);
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'No se pudo guardar la valoración' }) };
      }

      // Recalcular score del lugar
      const allRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) + '&select=score',
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + SUPABASE_KEY,
          },
        }
      );
      const allRows = allRes.ok ? await allRes.json() : [];
      const count   = allRows.length;
      const avg     = count > 0 ? allRows.reduce((s, r) => s + r.score, 0) / count : 0;
      const newScore = count > 0 ? Math.round((avg - 1) * 25) : null;

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, count, avg: +avg.toFixed(2), score: newScore }),
      };
    } catch (err) {
      console.error('Rating save error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error interno' }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
