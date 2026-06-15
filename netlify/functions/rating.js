/**
 * GlutenGo — Netlify Function: rating
 *
 * GET  /api/rating?slug=xxx
 *      → { slug, count, avg, score, recent[] }
 *
 * POST /api/rating { token, slug, score, comentario }
 *      → verifica JWT Supabase o magic-token → upsert con service_role_key
 *
 * score: 1–5 estrellas → GlutenGo Score = (avg - 1) × 25  (rango 0–100)
 *
 * Env vars requeridas en Netlify:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY           ← GET (ya está)
 *   SUPABASE_SERVICE_ROLE_KEY   ← POST upsert (bypassa RLS; agregar en Netlify)
 */

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    // Verificar que el service_role_key está configurado
    if (!SERVICE_KEY) {
      console.error('SUPABASE_SERVICE_ROLE_KEY no configurada en Netlify');
      return { statusCode: 500, headers: corsHeaders,
        body: JSON.stringify({ error: 'Servicio temporalmente no disponible. Contactá al admin.' }) };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    const { token, slug, score, comentario } = payload;

    if (!token || !slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'token y slug son requeridos' }) };
    }
    const scoreNum = parseInt(score, 10);
    if (!scoreNum || scoreNum < 1 || scoreNum > 5) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'score debe ser 1–5' }) };
    }

    // ── Verificar identidad del usuario
    let userEmail;
    try {
      // Intento 1: JWT de Supabase (Google OAuth)
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: {
          apikey:        ANON_KEY,
          Authorization: 'Bearer ' + token,
        },
      });

      if (authRes.ok) {
        const userData = await authRes.json();
        if (userData && userData.email) userEmail = userData.email;
      }

      // Intento 2 (fallback): magic token en tabla waitlist
      if (!userEmail) {
        const userRes = await fetch(
          SUPABASE_URL + '/rest/v1/waitlist?token=eq.' + encodeURIComponent(token) + '&select=email',
          {
            headers: {
              apikey:        SERVICE_KEY,  // service_role para leer waitlist
              Authorization: 'Bearer ' + SERVICE_KEY,
            },
          }
        );

        if (userRes.ok) {
          const users = await userRes.json();
          if (users && users.length > 0) userEmail = users[0].email;
        }

        if (!userEmail) {
          return { statusCode: 401, headers: corsHeaders,
            body: JSON.stringify({ error: 'Token inválido. Iniciá sesión primero.' }) };
        }
      }
    } catch (err) {
      console.error('Token lookup error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al verificar identidad' }) };
    }

    // ── Upsert rating (service_role bypasa RLS — sin políticas SQL necesarias)
    try {
      const ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
        method: 'POST',
        headers: {
          apikey:        SERVICE_KEY,
          Authorization: 'Bearer ' + SERVICE_KEY,
    