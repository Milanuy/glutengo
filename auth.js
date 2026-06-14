// GlutenGo — auth.js
// Google OAuth via Supabase. Cargado en todas las páginas que necesiten auth.
// Requiere: @supabase/supabase-js cargado antes de este script.

(function () {
  'use strict';

  var _sb = null;       // Supabase client (lazy init)
  var _user = null;     // Usuario actual
  var _configCache = null;

  // ────────────────────────────────────────────────────
  // CONFIG — obtiene URL + anon key del servidor
  // ────────────────────────────────────────────────────
  async function getConfig() {
    if (_configCache) return _configCache;
    try {
      const res = await fetch('/api/config');
      _configCache = await res.json();
    } catch (e) {
      console.error('GlutenGo auth: error cargando config', e);
      _configCache = { supabaseUrl: '', supabaseAnonKey: '' };
    }
    return _configCache;
  }

  // ────────────────────────────────────────────────────
  // SUPABASE CLIENT — singleton lazy
  // ────────────────────────────────────────────────────
  async function getSB() {
    if (_sb) return _sb;
    const { supabaseUrl, supabaseAnonKey } = await getConfig();
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('GlutenGo auth: Supabase no configurado (faltan env vars)');
      return null;
    }
    // supabase-js expone `supabase.createClient` o `window.supabase.createClient`
    const factory = window.supabase || window.Supabase;
    if (!factory) {
      console.error('GlutenGo auth: supabase-js no cargado');
      return null;
    }
    _sb = factory.createClient(supabaseUrl, supabaseAnonKey);
    return _sb;
  }

  // ────────────────────────────────────────────────────
  // AUTH FUNCTIONS — expuestas como window.GlutenAuth
  // ────────────────────────────────────────────────────

  /** Inicia Google OAuth. Redirige a Google y vuelve al origen. */
  async function signInWithGoogle() {
    const sb = await getSB();
    if (!sb) { alert('Error de configuración. Contactá al equipo.'); return; }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (error) console.error('signInWithGoogle error:', error.message);
  }

  /** Cierra sesión */
  async function signOut() {
    const sb = await getSB();
    if (sb) await sb.auth.signOut();
    _user = null;
    updateAllAuthUI(null);
  }

  /** Devuelve usuario actual (null si no autenticado) */
  async function getCurrentUser() {
    if (_user) return _user;
    const sb = await getSB();
    if (!sb) return null;
    const { data: { user } } = await sb.auth.getUser();
    _user = user;
    return user;
  }

  /** Devuelve la sesión completa (incluye access_token para llamadas a la API) */
  async function getSession() {
    const sb = await getSB();
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session;
  }

  // ────────────────────────────────────────────────────
  // UI HELPERS — actualiza todos los elementos auth de la página
  // ────────────────────────────────────────────────────

  function updateAllAuthUI(user) {
    // Elementos que se muestran solo si está logueado
    document.querySelectorAll('[data-auth="logged-in"]').forEach(function (el) {
      el.style.display = user ? '' : 'none';
    });
    // Elementos que se muestran solo si NO está logueado
    document.querySelectorAll('[data-auth="logged-out"]').forEach(function (el) {
      el.style.display = user ? 'none' : '';
    });
    // Nombre del usuario
    if (user) {
      var name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '';
      var picture = user.user_metadata?.avatar_url || user.user_metadata?.picture || '';
      document.querySelectorAll('[data-auth-name]').forEach(function (el) {
        el.textContent = name;
      });
      document.querySelectorAll('[data-auth-avatar]').forEach(function (el) {
        if (picture) { el.src = picture; el.style.display = ''; }
      });
    }
  }

  // ────────────────────────────────────────────────────
  // INIT — corre en DOMContentLoaded
  // ────────────────────────────────────────────────────
  async function init() {
    const sb = await getSB();
    if (!sb) return;

    // Sesión actual
    const { data: { session } } = await sb.auth.getSession();
    _user = session?.user || null;
    updateAllAuthUI(_user);

    // Escucha cambios de auth (callback post-OAuth redirect)
    sb.auth.onAuthStateChange(function (event, session) {
      _user = session?.user || null;
      updateAllAuthUI(_user);
      // Si volvió de Google OAuth, ejecuta callback de la página si existe
      if (event === 'SIGNED_IN' && typeof window.onGlutenAuthSignIn === 'function') {
        window.onGlutenAuthSignIn(_user);
      }
    });
  }

  // Exponer API global
  window.GlutenAuth = {
    signInWithGoogle