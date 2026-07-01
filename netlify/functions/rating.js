/**
 * GlutenGo -- Netlify Function: rating
 * GET  /api/rating?slug=xxx
 * POST /api/rating { token, slug, score, comentario, photo }
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
const PHOTO_BUCKET = 'rating-photos';
const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
const MAX_NEW_RATINGS_PER_DAY = 12;
const MAX_RATING_PHOTOS_PER_DAY = 3;
const RATING_EDIT_COOLDOWN_MS = 60 * 1000;
const PHOTO_TYPES = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

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

function publicStorageUrl(path) {
  return SUPABASE_URL + '/storage/v1/object/public/' + PHOTO_BUCKET + '/' + path
    .split('/')
    .map(encodeURIComponent)
    .join('/');
}

function parsePhotoPayload(photo) {
  if (!photo || !photo.dataUrl) return null;
  const match = String(photo.dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error('Formato de foto no soportado');
  const mime = match[1];
  if (!PHOTO_TYPES[mime]) throw new Error('Formato de foto no soportado');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return null;
  if (buffer.length > MAX_PHOTO_BYTES) throw new Error('La foto es demasiado pesada');
  return { mime, ext: PHOTO_TYPES[mime], buffer };
}

async function uploadRatingPhoto(photo, slug, userKey) {
  const parsed = parsePhotoPayload(photo);
  if (!parsed || !SERVICE_KEY) return null;
  const safeSlug = String(slug || 'lugar').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'lugar';
  const userHash = createHash('sha256').update(userKey).digest('hex').slice(0, 18);
  const fileHash = createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 12);
  const path = safeSlug + '/' + userHash + '-' + Date.now() + '-' + fileHash + '.' + parsed.ext;

  const res = await fetch(SUPABASE_URL + '/storage/v1/object/' + PHOTO_BUCKET + '/' + path, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': parsed.mime,
      'Cache-Control': '31536000',
      'x-upsert': 'true',
    },
    body: parsed.buffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('No se pudo subir la foto: ' + text.slice(0, 160));
  }
  return { path, url: publicStorageUrl(path) };
}

async function ratingPhotoColumnsReady() {
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/ratings?select=photo_url,photo_path,photo_status&limit=1',
    { headers: serviceHeaders() }
  );
  return res.ok;
}

async function recentRatingRows(userKey) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(
    SUPABASE_URL + '/rest/v1/ratings?select=id,slug,photo_url,updated_at' +
      '&email=eq.' + encodeURIComponent(userKey) +
      '&updated_at=gte.' + encodeURIComponent(since) +
      '&limit=25',
    { headers: serviceHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

function isRecentEdit(row) {
  if (!row || !row.updated_at) return false;
  const updated = Date.parse(row.updated_at);
  return Number.isFinite(updated) && Date.now() - updated < RATING_EDIT_COOLDOWN_MS;
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
      let res = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
        '&select=score,comentario,created_at,photo_url,photo_status&order=created_at.desc',
        { headers: serviceHeaders() }
      );
      let hasPhotoColumn = true;
      let hasPhotoStatus = true;
      if (!res.ok) {
        hasPhotoStatus = false;
        res = await fetch(
          SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
          '&select=score,comentario,created_at,photo_url&order=created_at.desc',
          { headers: serviceHeaders() }
        );
      }
      if (!res.ok) {
        hasPhotoColumn = false;
        res = await fetch(
          SUPABASE_URL + '/rest/v1/ratings?slug=eq.' + encodeURIComponent(slug) +
          '&select=score,comentario,created_at&order=created_at.desc',
          { headers: serviceHeaders() }
        );
      }
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
          photoUrl:    hasPhotoColumn && (!hasPhotoStatus || r.photo_status === 'approved') ? (r.photo_url || '') : '',
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
    const photo      = payload.photo;

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
    let existingRating = null;
    try {
      const checkRes = await fetch(
        SUPABASE_URL + '/rest/v1/ratings?select=id,updated_at,photo_url&email=eq.' + encodeURIComponent(userKey) +
        '&slug=eq.' + encodeURIComponent(slug),
        { headers: serviceHeaders() }
      );
      if (checkRes.ok) {
        const rows = await checkRes.json();
        if (rows.length > 0) {
          existingRating = rows[0];
          existingId = existingRating.id;
        }
      }
    } catch (_) { /* continuar con insert */ }

    try {
      const hasPhotoRequest = Boolean(photo && photo.dataUrl);
      const recentRows = await recentRatingRows(userKey);
      const otherRecentRows = recentRows.filter(function(row) {
        return String(row.id) !== String(existingId || '');
      });
      const photoRows = recentRows.filter(function(row) {
        return row.photo_url && String(row.id) !== String(existingId || '');
      });

      if (existingId && isRecentEdit(existingRating)) {
        return { statusCode: 429, headers: corsHeaders,
          body: JSON.stringify({ error: 'Esperá un minuto antes de volver a editar tu valoración.' }) };
      }
      if (!existingId && otherRecentRows.length >= MAX_NEW_RATINGS_PER_DAY) {
        return { statusCode: 429, headers: corsHeaders,
          body: JSON.stringify({ error: 'Llegaste al máximo de valoraciones por hoy. Probá de nuevo mañana.' }) };
      }
      if (hasPhotoRequest && photoRows.length >= MAX_RATING_PHOTOS_PER_DAY && !existingRating?.photo_url) {
        return { statusCode: 429, headers: corsHeaders,
          body: JSON.stringify({ error: 'Llegaste al máximo de fotos por hoy. Probá de nuevo mañana.' }) };
      }
    } catch (err) {
      console.error('Rating rate limit error:', err.message);
      return { statusCode: 500, headers: corsHeaders,
        body: JSON.stringify({ error: 'No pudimos validar la valoración. Intentá de nuevo en unos minutos.' }) };
    }

    // ── 3. Upsert usando service role (bypassa RLS)
    const comentarioTrimmed = comentario ? String(comentario).trim().slice(0, 500) : null;
    let uploadedPhoto = null;
    let photoWarning = '';
    if (photo && photo.dataUrl) {
      try {
        if (await ratingPhotoColumnsReady()) {
          uploadedPhoto = await uploadRatingPhoto(photo, slug, userKey);
        } else {
          photoWarning = 'La foto no se guardó porque falta aplicar la migración de fotos.';
        }
      } catch (err) {
        console.warn('Rating photo upload skipped:', err.message);
        photoWarning = 'No se pudo subir la foto, pero la valoración se guardó.';
      }
    }
    let ratingRes;

    try {
      const values = { score: scoreNum, comentario: comentarioTrimmed };
      if (uploadedPhoto) {
        values.photo_url = uploadedPhoto.url;
        values.photo_path = uploadedPhoto.path;
        values.photo_status = 'pending';
      }

      if (existingId) {
        // Actualizar valoración existente
        ratingRes = await fetch(
          SUPABASE_URL + '/rest/v1/ratings?id=eq.' + existingId,
          {
            method: 'PATCH',
            headers: serviceHeaders({ Prefer: 'return=minimal' }),
            body: JSON.stringify(values),
          }
        );
      } else {
        // Insertar nueva valoración
        const insertValues = Object.assign({ email: userKey, slug }, values);
        ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
          method: 'POST',
          headers: serviceHeaders({ Prefer: 'return=minimal' }),
          body: JSON.stringify(insertValues),
        });
      }

      if (!ratingRes.ok) {
        const errText = await ratingRes.text();
        if (uploadedPhoto && /photo_url|photo_path|schema cache|column/i.test(errText)) {
          photoWarning = 'La foto no se guardó porque falta aplicar la migración de fotos.';
          const fallbackValues = { score: scoreNum, comentario: comentarioTrimmed };
          if (existingId) {
            ratingRes = await fetch(
              SUPABASE_URL + '/rest/v1/ratings?id=eq.' + existingId,
              {
                method: 'PATCH',
                headers: serviceHeaders({ Prefer: 'return=minimal' }),
                body: JSON.stringify(fallbackValues),
              }
            );
          } else {
            ratingRes = await fetch(SUPABASE_URL + '/rest/v1/ratings', {
              method: 'POST',
              headers: serviceHeaders({ Prefer: 'return=minimal' }),
              body: JSON.stringify(Object.assign({ email: userKey, slug }, fallbackValues)),
            });
          }
        }
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
        body: JSON.stringify({ ok: true, count, avg: +avg.toFixed(2), score: newScore, photoWarning, photoStatus: uploadedPhoto ? 'pending' : '' }) };
    } catch (_) {
      return { statusCode: 200, headers: corsHeaders,
        body: JSON.stringify({ ok: true, count: 1, avg: scoreNum, score: Math.round((scoreNum - 1) * 25), photoWarning, photoStatus: uploadedPhoto ? 'pending' : '' }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};
