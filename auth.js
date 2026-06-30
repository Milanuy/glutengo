// GlutenGo — auth.js v2
// Google OAuth via Supabase. Usa implicit flow para evitar PKCE/sessionStorage issues.

(function () {
  'use strict';

  var _sb = null;
  var _user = null;
  var _configCache = null;

  async function getConfig() {
    if (_configCache) return _configCache;
    try {
      var res = await fetch('/api/config');
      if (!res.ok) throw new Error('endpoint /api/config respondió ' + res.status);
      var contentType = res.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') === -1) {
        throw new Error('endpoint /api/config no devolvió JSON');
      }
      var data = await res.json();
      _configCache = {
        supabaseUrl: data.supabaseUrl || '',
        supabaseAnonKey: data.supabaseAnonKey || '',
      };
    } catch (e) {
      console.warn('GlutenGo auth: no se pudo cargar config pública:', e.message);
      _configCache = { supabaseUrl: '', supabaseAnonKey: '' };
    }
    return _configCache;
  }

  async function getSB() {
    if (_sb) return _sb;
    var cfg = await getConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.warn('GlutenGo auth: Supabase no configurado');
      return null;
    }
    var factory = window.supabase || window.Supabase;
    if (!factory) {
      console.error('GlutenGo auth: supabase-js no cargado');
      return null;
    }
    // flowType: 'implicit' — tokens en hash URL, sin PKCE, sin sessionStorage issues
    _sb = factory.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: 'implicit' }
    });
    return _sb;
  }

  async function signInWithGoogle() {
    var sb = await getSB();
    if (!sb) { alert('Error de configuracion. Contacta al equipo.'); return; }
    // localStorage es mas resiliente que sessionStorage en redirects cross-origin
    try { localStorage.setItem('glutengo_return_to', window.location.href); } catch (e) {}
    try {
      if (window.GlutenAnalytics && typeof window.GlutenAnalytics.track === 'function') {
        window.GlutenAnalytics.track('cta_click', {
          page: document.body && document.body.dataset ? document.body.dataset.page || '' : '',
          metadata: { target: 'google-login' }
        });
      }
    } catch (e) {}
    var result = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'openid email profile',
        queryParams: { prompt: 'select_account' },
      },
    });
    if (result.error) console.error('signInWithGoogle error:', result.error.message);
  }

  async function signOut() {
    var sb = await getSB();
    if (sb) await sb.auth.signOut();
    _user = null;
    updateAllAuthUI(null);
    if (typeof window.onGlutenAuthSignOut === 'function') {
      window.onGlutenAuthSignOut();
    }
  }

  async function getCurrentUser() {
    if (_user) return _user;
    var sb = await getSB();
    if (!sb) return null;
    var result = await sb.auth.getUser();
    _user = result.data.user;
    return _user;
  }

  async function getSession() {
    var sb = await getSB();
    if (!sb) return null;
    var result = await sb.auth.getSession();
    return result.data.session;
  }

  function updateAllAuthUI(user) {
    document.querySelectorAll('[data-auth="logged-in"]').forEach(function (el) {
      el.style.display = user ? '' : 'none';
    });
    document.querySelectorAll('[data-auth="logged-out"]').forEach(function (el) {
      el.style.display = user ? 'none' : '';
    });
    if (user) {
      var meta = user.user_metadata || {};
      var name = meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : '');
      var picture = meta.avatar_url || meta.picture || '';
      document.querySelectorAll('[data-auth-name]').forEach(function (el) {
        el.textContent = name;
      });
      document.querySelectorAll('[data-auth-email]').forEach(function (el) {
        el.textContent = user.email || '';
      });
      document.querySelectorAll('[data-auth-avatar]').forEach(function (el) {
        if (picture) { el.src = picture; el.style.display = ''; }
      });
    }
  }

  async function init() {
    var sb = await getSB();
    if (!sb) return;

    var sessionResult = await sb.auth.getSession();
    var session = sessionResult.data.session;
    _user = session ? session.user : null;
    updateAllAuthUI(_user);

    // Si ya tenemos sesion y hay URL de retorno → redirigir de inmediato
    if (_user) {
      try {
        var returnTo = localStorage.getItem('glutengo_return_to');
        if (returnTo && returnTo !== window.location.href) {
          localStorage.removeItem('glutengo_return_to');
          window.location.href = returnTo;
          return;
        }
      } catch (e) {}
      if (typeof window.onGlutenAuthSignIn === 'function') {
        window.onGlutenAuthSignIn(_user);
      }
    }

    sb.auth.onAuthStateChange(function (event, sess) {
      _user = sess ? sess.user : null;
      updateAllAuthUI(_user);

      if (event === 'SIGNED_IN') {
        try {
          var returnTo = localStorage.getItem('glutengo_return_to');
          if (returnTo && returnTo !== window.location.href) {
            localStorage.removeItem('glutengo_return_to');
            window.location.href = returnTo;
            return;
          }
        } catch (e) {}
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && typeof window.onGlutenAuthSignIn === 'function') {
        window.onGlutenAuthSignIn(_user);
      }

      if (event === 'SIGNED_OUT' && typeof window.onGlutenAuthSignOut === 'function') {
        window.onGlutenAuthSignOut();
      }
    });
  }

  window.GlutenAuth = {
    signInWithGoogle: signInWithGoogle,
    signOut: signOut,
    getCurrentUser: getCurrentUser,
    getSession: getSession,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
