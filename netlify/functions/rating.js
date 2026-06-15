/**
 * GlutenGo — Netlify Function: rating v3
 *
 * GET  /api/rating?slug=xxx
 *   → { slug, count, avg, score, recent: [{score, comentario, date, initials}] }
 *
 * POST /api/rating { token, slug, score, comentario }
 *   → upsert con JWT del usuario (no service role key)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function getInitials(email) {
  if (!email) return '?';
  var parts = email.split('@')[0].split(/[._\-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.substring(0, 2).toUpperCase();
}

function formatDateShort(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors, body: '' };
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Config incompleta' }) };
  }

  // ─── GET ──────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'slug requerido' }) };

    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
        '&select=score,comentario,email,created_at&order=created_at.desc',
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
          },
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        console.error('Supabase GET error:', res.status, txt);
        throw new Error('Supabase GET failed: ' + res.status);
      }

      const rows = await res.json();
      const count = rows.length;

      if (count === 0) {
        return {
          statusCode: 200,
          headers: cors,
          body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }),
        };
      }

      const avg = rows.reduce((s, r) => s + r.score, 0) / count;
      const score = Math.round((avg - 1) * 25);

      const recent = rows.slice(0, 8).map(function (r) {
        return {
          score: r.score,
          comentario: r.comentario || null,
          date: formatDateShort(r.created_at),
          initials: getInitials(r.email),
        };
      });

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ slug, count, avg: +avg.toFixed(2), score, recent }),
      };
    } catch (err) {
      console.error('rating GET error:', err.message);
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Error interno' }) };
    }
  }

  // ─── POST ─────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'JSON inválido' }) };
    }

    const { token, slug, score, comentario } = payload;
    if (!token) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token requerido' }) };
    if (!slug)  return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'slug requerido' }) };
    if (!score || score < 1 || score > 5) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'score inválido (1-5)' }) };
    }

    // Verificar token y obtener email del usuario
    let email;
    try {
      const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + token,
        },
      });
      if (!userRes.ok) {
        const txt = await userRes.text();
        console.error('Auth verify error:', userRes.status, txt);
        return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Token inválido' }) };
      }
      const user = await userRes.json();
      email = user.email;
      if (!email) return { statusCode: 401, headers: cors, body: JSON.stringify({ error: 'Usuario sin email' }) };
    } catch (err) {
      console.error('Auth verify exception:', err.message);
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Error verificando sesión' }) };
    }

    // Upsert usando el JWT del usuario (RLS se encarga del resto)
    try {
      const upsertRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings',
        {
          method: 'POST',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify({
            slug,
            email,
            score: parseInt(score, 10),
            comentario: comentario ? String(comentario).trim().slice(0, 500) : null,
          }),
        }
      );

      if (!upsertRes.ok) {
        const txt = await upsertRes.text();
        console.error('Upsert error:', upsertRes.status, txt);
        // Si falla por RLS, intentar insert directo con anon key (sin RLS check)
        throw new Error('Upsert failed: ' + upsertRes.status + ' ' + txt);
      }

      // Re-fetch para retornar score actualizado
      const getRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
        '&select=score',
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
          },
        }
      );

      let newScore = null, newCount = 0, newAvg = null;
      if (getRes.ok) {
        const rows = await getRes.json();
        newCount = rows.length;
        if (newCount > 0) {
          newAvg = rows.reduce((s, r) => s + r.score, 0) / newCount;
          newScore = Math.round((newAvg - 1) * 25);
        }
      }

      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ ok: true, score: newScore, count: newCount }),
      };
    } catch (err) {
      console.error('rating POST error:', err.message);
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método no permitido' }) };
};
