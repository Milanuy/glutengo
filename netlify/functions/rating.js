/**
 * GlutenGo — Netlify Function: rating v2
 *
 * GET  /api/rating?slug=xxx         → score promedio, count, y ultimos 5 comentarios
 * POST /api/rating { token, slug, score, comentario }  → guarda valoracion (upsert)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function getInitials(email) {
  if (!email) return '?';
  var parts = email.split('@')[0].split(/[._\-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function formatDateShort(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.toLocaleDateString('es-UY', { day:'numeric', month:'short', year:'numeric' });
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // ─────────────────────────────────────────────────────────────
  // GET — Score + comentarios recientes de un lugar
  // ─────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const slug = (event.queryStringParameters || {}).slug;
    if (!slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'slug requerido' }) };
    }

    try {
      const res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
        '&select=score,comentario,email,created_at&order=created_at.desc',
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
          body: JSON.stringify({ slug, count: 0, avg: null, score: null, recent: [] }),
        };
      }

      const avg = rows.reduce((s, r) => s + r.score, 0) / count;
      const score = Math.round((avg - 1) * 25);

      // Ultimos 5 comentarios (con o sin texto)
      const recent = rows.slice(0, 8).map(function(r) {
        return {
          score: r.score,
          comentario: r.comentario || null,
          date: formatDateShort(r.created_at),
          initials: getInitials(r.email),
        };
      });

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ slug, count, avg: +avg.toFixed(2), score, recent }),
      };
    } catch (err) {
      console.error('rating GET error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error interno' }) };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // POST — Guardar valoracion
  // ─────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let payload;
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (_) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'JSON invalido' }) };
    }

    const { token, slug, score, comentario } = payload;

    if (!token || !slug) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'token y slug son requeridos' }) };
    }
    const scoreNum = parseInt(score, 10);
    if (!scoreNum || scoreNum < 1 || scoreNum > 5) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'score debe ser 1-5' }) };
    }

    // Verificar JWT de Supabase (Google OAuth)
    let userEmail;
    try {
      const authRes = await fetch(SUPABASE_URL + '/auth/v1/user', {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + token,
        },
      });

      if (authRes.ok) {
        const userData = await authRes.json();
        if (userData && userData.email) {
          userEmail = userData.email;
        }
      }

      // Fallback: buscar en waitlist como token magico
      if (!userEmail) {
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
            body: JSON.stringify({ error: 'Token invalido. Iniciá sesion primero.' }),
          };
        }
        userEmail = users[0].email;
      }
    } catch (err) {
      console.error('Token lookup error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al verificar token' }) };
    }

    // Insertar/actualizar (UPSERT por email+slug)
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
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'No se pudo guardar la valoracion' }) };
      }

      // Recalcular score
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
      const count = allRows.length;
      const av = count > 0 ? allRows.reduce((s, r) => s + r.score, 0) / count : scoreNum;
      const newScore = Math.round((av - 1) * 25);

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ ok: true, score: newScore, count, avg: +av.toFixed(2) }),
      };
    } catch (err) {
      console.error('Rating POST error:', err.message);
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Error al guardar' }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
