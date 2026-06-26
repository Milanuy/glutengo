(function() {
  var ENDPOINT = '/api/analytics';
  var SESSION_KEY = 'glutengo_analytics_session_v1';
  var MAX_META_KEYS = 24;
  var MAX_META_VALUE = 280;

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
    send({
      event_type: cleanText(eventType, 60),
      page: cleanText(options.page || '', 80),
      path: cleanText(options.path || location.pathname, 160),
      slug: cleanText(options.slug || '', 120),
      referrer: cleanText(options.referrer || document.referrer || '', 260),
      metadata: cleanMetadata(options.metadata)
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
