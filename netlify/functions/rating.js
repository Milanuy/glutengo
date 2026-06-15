/**
 * GlutenGo — Netlify Function: rating
 *
 * GET  /api/rating?slug=xxx
 *      → { slug, count, avg, score, recent[] }
 *
 * POST /api/rating { token, slug, score, comentario }
 *      → verifica JWT Supabase → upsert con ese mismo JWT (RLS permite auth users)
 *
 * score: 1–5 estrellas → GlutenGo Score = (avg - 1) × 25  (rango 0–100)
 *
 * Env vars requeridas en Netlify:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *
 * RLS policies en Supabase:
 *   - ratings_select_public  → SELECT USING (true)
 *   - ratings_insert_auth    → INSERT TO authenticated WITH CHECK (true)
 *   - ratings_update_own     → UPDATE TO authenticated USING (true)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY     = process.env.SUPABASE_ANON_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // ─────────────────────────────────────────────────────────────
  // GET — Score + ratings recientes de un lugar
  // ─────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'slug requerido' }) };
    }

    try {
      // Usamos anon_key — solo lectura pública; si falla, devolvemos vacío
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug)
          + '&select=score,comentario,created_at&order=created_at.desc',
        {
          headers: {
            apikey:        ANON_KEY,
            Authorization: 'Bearer ' + ANON_KEY,
          },
        }
      );

      if (!res.ok) {
        // Si falta la key o la tabla no existe, devolvemos vacío (no 500)
        return { statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
      }

      const rows  = await res.json();
      const count = rows.length;

      if (count === 0) {
        return { statusCode: 200, headers: corsHeaders,
          body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
      }

      const avg      = rows.reduce((s, r) => s + r.score, 0) / count;
      const score    = Math.round((avg - 1) * 25); // 1→0, 3→50, 5→100
      const recent   = rows.slice(0, 5).map(r => ({
        score: r.score,
        comentario: r.comentario,
        fecha: r.created_at ? r.created_at.slice(0, 10) : null,
      }));

      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ slug, count, avg: +avg.toFixed(2), score, recent }) };

    } catch (err) {
      console.error('rating GET error:', err.message);
      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }) };
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

    if (!token || !slug) {
      return { statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'token y slug son requeridos' }) };
    }
    const scoreNum = parseInt(score, 10);
    if (!scoreNum || scoreNum < 1 || scoreNum > 5) {
      return { statusCode: 400, headers: corsHeaders,
        body: JSON.stringify({ error: 'score debe ser 1–5' }) };
    }

    // ── Verificar JWT de Supabase y obtener email
    let userEmail;
    try {
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: {
          apikey:        ANON_KEY,
          Authorization: 'Bearer ' + token,
        },
      });

      if (!authRes.ok) {
        return { statusCode: 401, headers: corsHeaders,
          body: JSON.stringify({ error: 'Sesión inválida. Iniciá sesión con Google.' }) };
      }

      const userData = await authRes.json();
      if (!userData || !userData.email) {
        return { statusCode: 401, headers: corsHeaders,
          body: JSON.stringify({ error: 'No se pudo identificar al usuario.' }) };
      }
      userEmail = userData.email;
    } catch (err) {
      console.error('Auth check error:', err.message);
      return { statusCode: 500, headers: corsHeaders,
        body: JSON.stringify({ error: 'Error al verificar identidad' }) };
    }

    // ── Upsert rating usando el JWT del usuario (RLS: ratings_insert_auth + ratings_update_own)
    // UNIQUE (email, slug) → merge-duplicates actúa como ON CONFLICT DO UPDATE
    try {
      const ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
        method: 'POST',
        headers: {
          apikey:        ANON_KEY,
          Authorization: 'Bearer ' + token,   // JWT del usuario autenticado
          'Content-Type': 'application/json',
          Prefer:        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          email:      userEmail,
          slug,
          score:      scoreNum,
          comentario: (comentario || '').trim().slice(0, 500) || null,
        }),
      });

      if (!ratingRes.ok) {
        const errText = await ratingRes.text();
        console.error('Rating upsert error:', ratingRes.status, errText);
        return { statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: 'No se pudo guardar la valoración' }) };
      }

 