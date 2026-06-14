// GlutenGo — auth.js
// Google OAuth via Supabase.

(function () {
  'use strict';

  var _sb = null;
  var _user = null;
  var _configCache = null;

  async function getConfig() {
    if (_configCache) return _configCache;
    try {
      var res = await fetch('/api/config');
      _configCache = await res.json();
    } catch (e) {
      console.error('GlutenGo auth: error cargando config', e);
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
    _sb = factory.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return _sb;
  }

  async function signInWithGoogle() {
    var sb = await getSB();
    if (!sb) { alert('Error de configuracion. Contacta al equipo.'); return; }
    try { sessionStorage.setItem('glutengo_return_to', window.location.href); } catch (e) {}
    var result = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (result.error) console.error('signInWithGoogle error:', result.error.message);
  }

  async function signOut() {
    var sb = await getSB();
    if (sb) await sb.auth.signOut();
    _user = null;
    updateAllAuthUI(null);
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

    if (_user && typeof window.onGlutenAuthSignIn === 'function') {
      window.onGlutenAuthSignIn(_user);
    }

    sb.auth.onAuthStateChange(function (event, session) {
      _user = session ? session.user : null;
      updateAllAuthUI(_user);

      if (event === 'SIGNED_IN') {
        try {
          var returnTo = sessionStorage.getItem('glutengo_return_to');
          if (returnTo && returnTo !== window.location.href) {
            sessionStorage.removeItem('glutengo_return_to');
            window.location.href = returnTo;
            return;
          }
        } catch (e) {}
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && typeof window.onGlutenAuthSignIn === 'function') {
        window.onGlutenAuthSignIn(_user);
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
