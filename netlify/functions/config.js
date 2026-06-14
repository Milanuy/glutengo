/**
 * GlutenGo — Netlify Function: config
 * GET /api/config
 *
 * Expone configuración pública (Supabase anon key, URL) al frontend.
 * El anon key es seguro de exponer: está diseñado para uso client-side
 * y Supabase lo protege con Row Level Security.
 */
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
    body: JSON.stringify({
      supabaseUrl:     process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    }),
  };
};
