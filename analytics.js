(function() {
  var ENDPOINT = '/api/analytics';
  var SESSION_KEY = 'glutengo_analytics_session_v1';
  var FIRST_TOUCH_KEY = 'glutengo_analytics_first_touch_v1';
  var LAST_TOUCH_KEY = 'glutengo_analytics_last_touch_v1';
  var MAX_META_KEYS = 40;
  var MAX_META_VALUE = 280;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function shouldSkip() {
    return navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function sessionId() {
    try {
      var existing = localStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      var id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'sid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(SESSION_KEY, id);
      return id;
    } catch (_) {
      return 'sid-' + Math.random().toString(36).slice(2);
    }
  }

  function cleanText(value, limit) {
    return String(value == null ? '' : value).trim().slice(0, limit || 180);
  }

  function cleanMetadata(metadata) {
    var clean = {};
    if (!metadata || typeof metadata !== 'object') return clean;
    Object.keys(metadata).slice(0, MAX_META_KEYS).forEach(function(key) {
      var value = metadata[key];
      var safeKey = cleanText(key, 60);
      if (!safeKey) return;
      if (value == null) return;
      if (typeof value === 'number' || typeof value === 'boolean') {
        clean[safeKey] = value;
        return;
      }
      if (Array.isArray(value)) {
        clean[safeKey] = value.slice(0, 8).map(function(item) { return cleanText(item, MAX_META_VALUE); });
        return;
      }
      clean[safeKey] = cleanText(value, MAX_META_VALUE);
    });
    return clean;
  }

  function sameSite(host) {
    return !host || host === location.hostname || host.replace(/^www\./, '') === location.hostname.replace(/^www\./, '');
  }

  function referrerHost() {
    if (!document.referrer) return '';
    try {
      return new URL(document.referrer).hostname.replace(/^www\./, '');
    } catch (_) {
      return '';
    }
  }

  function sourceFromHost(host) {
    var clean = String(host || '').replace(/^www\./, '').toLowerCase();
    if (!clean) return { type: 'direct', name: 'Directo' };
    if (/instagram|facebook|tiktok|linkedin|twitter|x\.com/.test(clean)) return { type: 'social', name: clean };
    if (/google|bing|yahoo|duckduckgo/.test(clean)) return { type: 'search', name: clean };
    if (sameSite(clean)) return { type: 'internal', name: 'GlutenGo' };
    return { type: 'referral', name: clean };
  }

  function readStoredTouch(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null') || null;
    } catch (_) {
      return null;
    }
  }

  function writeStoredTouch(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function trafficTouch() {
    var params = new URLSearchParams(location.search || '');
    var utm = {};
    UTM_KEYS.forEach(function(key) {
      var value = cleanText(params.get(key) || '', 120);
      if (value) utm[key] = value;
    });
    var host = referrerHost();
    var hasUtm = Object.keys(utm).length > 0;
    var hasExternalReferrer = host && !sameSite(host);
    var source = hasUtm
      ? { type: utm.utm_medium || 'campaign', name: utm.utm_source || 'campaña' }
      : sourceFromHost(hasExternalReferrer ? host : '');

    var current = Object.assign({
      source_type: cleanText(source.type, 80),
      source_name: cleanText(source.name, 120),
      referrer_host: cleanText(host, 120),
      landing_path: cleanText(location.pathname + location.search, 220),
      captured_at: new Date().toISOString()
    }, utm);

    if (hasUtm || hasExternalReferrer) writeStoredTouch(LAST_TOUCH_KEY, current);
    var first = readStoredTouch(FIRST_TOUCH_KEY);
    if (!first) {
      writeStoredTouch(FIRST_TOUCH_KEY, current);
      first = current;
    }
    return {
      current: current,
      first: first,
      last: readStoredTouch(LAST_TOUCH_KEY) || first || current
    };
  }

  function trafficMetadata() {
    var touch = trafficTouch();
    var first = touch.first || {};
    var last = touch.last || {};
    return {
      source_type: first.source_type || touch.current.source_type || 'direct',
      source_name: first.source_name || touch.current.source_name || 'Directo',
      referrer_host: first.referrer_host || touch.current.referrer_host || '',
      landing_path: first.landing_path || touch.current.landing_path || '',
      utm_source: first.utm_source || last.utm_source || '',
      utm_medium: first.utm_medium || last.utm_medium || '',
      utm_campaign: first.utm_campaign || last.utm_campaign || '',
      utm_content: first.utm_content || last.utm_content || '',
      utm_term: first.utm_term || last.utm_term || ''
    };
  }

  function send(payload) {
    if (shouldSkip()) return;
    var body = JSON.stringify(Object.assign({
      page: document.body && document.body.dataset ? document.body.dataset.page || '' : '',
      path: location.pathname,
      referrer: document.referrer || '',
      session_id: sessionId()
    }, payload || {}));

    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        if (navigator.sendBeacon(ENDPOINT, blob)) return;
      }
    } catch (_) {}

    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(function(){});
    } catch (_) {}
  }

  function track(eventType, options) {
    options = options || {};
    var meta = Object.assign(trafficMetadata(), options.metadata || {});
    send({
      event_type: cleanText(eventType, 60),
      page: cleanText(options.page || '', 80),
      path: cleanText(options.path || location.pathname, 160),
      slug: cleanText(options.slug || '', 120),
      referrer: cleanText(options.referrer || document.referrer || '', 260),
      metadata: cleanMetadata(meta)
    });
  }

  window.GlutenAnalytics = {
    track: track,
    page: function(page, metadata) {
      track('page_view', { page: page || '', metadata: metadata || {} });
    },
    place: function(slug, metadata) {
      track('place_view', { page: 'place', slug: slug, metadata: metadata || {} });
    },
    click: function(target, metadata) {
      var meta = Object.assign({ target: target || '' }, metadata || {});
      track('cta_click', { metadata: meta });
    }
  };

  document.addEventListener('DOMContentLoaded', function() {
    if (document.documentElement.dataset.analyticsAuto === 'off') return;
    track('page_view', {
      page: document.body && document.body.dataset ? document.body.dataset.page || '' : '',
      metadata: { title: document.title || '' }
    });
  });
})();
