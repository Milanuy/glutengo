(function(){
  var REGISTER_DISMISS_KEY = 'glutengo_register_cta_dismissed_until_v1';
  var REGISTER_SESSION_KEY = 'glutengo_register_cta_seen_v1';
  var VISIBILITY_DISMISS_KEY = 'glutengo_visibility_cta_dismissed_until_v1';
  var VISIBILITY_SESSION_KEY = 'glutengo_visibility_cta_seen_v1';

  if (location.pathname.indexOf('negocios.html') !== -1) return;

  function read(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function readSession(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function writeSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  function isDismissed(key) {
    var dismissedUntil = Number(read(key) || 0);
    return dismissedUntil && dismissedUntil > Date.now();
  }

  function dismiss(key, card, days) {
    card.classList.remove('gg-show');
    write(key, String(Date.now() + days * 24 * 60 * 60 * 1000));
  }

  function trackCta(target, action) {
    try {
      if (window.GlutenAnalytics && typeof window.GlutenAnalytics.track === 'function') {
        window.GlutenAnalytics.track('cta_click', {
          page: location.pathname.indexOf('lugar.html') !== -1 ? 'place' : 'home',
          metadata: { target: target, action: action || 'click' }
        });
      }
    } catch (_) {}
  }

  if (document.getElementById('gg-business-cta') || document.getElementById('gg-visibility-cta')) return;

  var style = document.createElement('style');
  style.textContent = [
    '.gg-float-card{position:fixed;z-index:320;font-family:DM Sans,system-ui,sans-serif;opacity:0;transform:translateY(16px);pointer-events:none;transition:opacity .22s ease,transform .22s ease}',
    '.gg-float-card.gg-show{opacity:1;transform:translateY(0);pointer-events:auto}',
    '.gg-float-kicker{display:block;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}',
    '.gg-float-title{font-weight:900;line-height:1.12;margin:0 28px 5px 0}',
    '.gg-float-copy{font-size:12px;line-height:1.45;margin:0 0 10px}',
    '.gg-float-actions{display:flex;align-items:center;gap:8px}',
    '.gg-float-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-size:12px;font-weight:800;border-radius:10px;min-height:36px}',
    '.gg-float-muted{font-size:11px}',
    '.gg-float-close{position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '.gg-float-close svg{width:15px;height:15px}',
    '#gg-business-cta{right:18px;bottom:18px;width:min(330px,calc(100vw - 32px));background:#0E3D22;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:14px;box-shadow:0 18px 42px rgba(0,0,0,.24);padding:14px 14px 13px}',
    '#gg-business-cta .gg-float-kicker{color:#E8A93C}',
    '#gg-business-cta .gg-float-title{font-family:Fraunces,Georgia,serif;font-size:18px;color:#fff}',
    '#gg-business-cta .gg-float-copy{color:rgba(255,255,255,.76)}',
    '#gg-business-cta .gg-float-link{background:#E8A93C;color:#0E3D22;padding:9px 22px;min-width:150px}',
    '#gg-business-cta .gg-float-muted{color:rgba(255,255,255,.6)}',
    '#gg-business-cta .gg-float-close{background:rgba(255,255,255,.1);color:#fff}',
    '#gg-business-cta .gg-float-close:hover{background:rgba(255,255,255,.18)}',
    '#gg-visibility-cta{left:18px;bottom:18px;width:min(360px,calc(100vw - 32px));background:#FFF9EA;color:#0E3D22;border:1px solid rgba(14,61,34,.16);border-radius:14px;box-shadow:0 16px 34px rgba(14,61,34,.18);padding:13px 14px 12px}',
    '#gg-visibility-cta .gg-float-kicker{color:#B7791F}',
    '#gg-visibility-cta .gg-float-title{font-size:17px;color:#0E3D22}',
    '#gg-visibility-cta .gg-float-copy{color:rgba(14,61,34,.72)}',
    '#gg-visibility-cta .gg-float-link{background:#0E3D22;color:#fff;padding:9px 18px;min-width:128px}',
    '#gg-visibility-cta .gg-float-muted{color:rgba(14,61,34,.58)}',
    '#gg-visibility-cta .gg-float-close{background:rgba(14,61,34,.08);color:#0E3D22}',
    '#gg-visibility-cta .gg-float-close:hover{background:rgba(14,61,34,.14)}',
    '@media(max-width:640px){#gg-business-cta,#gg-visibility-cta{left:12px;right:12px;width:auto;border-radius:13px;padding:10px 44px 10px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}#gg-business-cta{bottom:calc(12px + env(safe-area-inset-bottom));z-index:322}#gg-visibility-cta{bottom:calc(82px + env(safe-area-inset-bottom));z-index:321}#gg-business-cta .gg-float-kicker,#gg-business-cta .gg-float-copy,#gg-business-cta .gg-float-muted,#gg-visibility-cta .gg-float-kicker,#gg-visibility-cta .gg-float-copy,#gg-visibility-cta .gg-float-muted{display:none}#gg-business-cta .gg-float-title,#gg-visibility-cta .gg-float-title{font-family:DM Sans,system-ui,sans-serif;font-size:13px;line-height:1.15;margin:0;max-width:180px}#gg-business-cta .gg-float-actions,#gg-visibility-cta .gg-float-actions{justify-content:flex-end}#gg-business-cta .gg-float-link,#gg-visibility-cta .gg-float-link{min-width:132px;min-height:40px;padding:9px 14px;border-radius:11px;font-size:12px}#gg-business-cta .gg-float-close,#gg-visibility-cta .gg-float-close{top:50%;right:8px;transform:translateY(-50%);width:26px;height:26px}}'
  ].join('');
  document.head.appendChild(style);

  function closeIcon(label) {
    return '<button type="button" class="gg-float-close" aria-label="' + label + '">' +
      '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
    '</button>';
  }

  function createRegisterCard() {
    var card = document.createElement('aside');
    card.id = 'gg-business-cta';
    card.className = 'gg-float-card';
    card.setAttribute('aria-label', 'Invitación para registrar un negocio');
    card.innerHTML =
      closeIcon('Cerrar invitación') +
      '<span class="gg-float-kicker">Para negocios</span>' +
      '<h2 class="gg-float-title">¿Tu local tiene opciones sin gluten?</h2>' +
      '<p class="gg-float-copy">Registrá tu ficha gratis y aparecé donde la comunidad celíaca busca lugares para comer.</p>' +
      '<div class="gg-float-actions">' +
        '<a class="gg-float-link" href="/negocios.html?ref=registro-flotante#form-registro">Registrar mi local</a>' +
        '<span class="gg-float-muted">Básico gratis</span>' +
      '</div>';
    return card;
  }

  function createVisibilityCard() {
    var card = document.createElement('aside');
    card.id = 'gg-visibility-cta';
    card.className = 'gg-float-card';
    card.setAttribute('aria-label', 'Banner flotante disponible');
    card.innerHTML =
      closeIcon('Cerrar banner disponible') +
      '<span class="gg-float-kicker">Banner flotante disponible</span>' +
      '<h2 class="gg-float-title">Tu local puede aparecer acá</h2>' +
      '<p class="gg-float-copy">Un espacio discreto para destacar una promo, lanzamiento o semana fuerte dentro de GlutenGo.</p>' +
      '<div class="gg-float-actions">' +
        '<a class="gg-float-link" href="/negocios.html?ref=banner-flotante-disponible#visibilidad">Aparecer acá</a>' +
        '<span class="gg-float-muted">Extra semanal</span>' +
      '</div>';
    return card;
  }

  var isCompact = false;
  try { isCompact = window.matchMedia('(max-width: 640px)').matches; } catch (_) {}

  function wireCard(options) {
    if (isDismissed(options.dismissKey)) return null;
    var card = options.create();
    card.querySelector('.gg-float-close').addEventListener('click', function(){
      trackCta(options.analyticsTarget, 'close');
      dismiss(options.dismissKey, card, 14);
    });
    card.querySelector('.gg-float-link').addEventListener('click', function(){
      trackCta(options.analyticsTarget, 'open');
      writeSession(options.sessionKey, '1');
    });

    function show() {
      if (!document.body || document.body.contains(card)) return;
      document.body.appendChild(card);
      requestAnimationFrame(function(){ card.classList.add('gg-show'); });
      setTimeout(function(){ card.classList.add('gg-show'); }, 30);
      setTimeout(function(){
        card.classList.add('gg-show');
        card.style.transition = 'none';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        card.style.pointerEvents = 'auto';
      }, 360);
      writeSession(options.sessionKey, '1');
    }

    var hasSeen = readSession(options.sessionKey) === '1';
    var delay = isCompact ? (hasSeen ? options.compactSeenDelay : options.compactDelay) : (hasSeen ? options.seenDelay : options.delay);
    var timer = setTimeout(show, delay);

    function onScroll() {
      if (window.scrollY > (isCompact ? options.compactScrollY : options.scrollY)) {
        clearTimeout(timer);
        show();
        window.removeEventListener('scroll', onScroll);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return card;
  }

  wireCard({
    create: createRegisterCard,
    dismissKey: REGISTER_DISMISS_KEY,
    sessionKey: REGISTER_SESSION_KEY,
    delay: 4200,
    seenDelay: 7500,
    compactDelay: 1200,
    compactSeenDelay: 2400,
    scrollY: 520,
    compactScrollY: 220,
    analyticsTarget: 'registrar-local-flotante'
  });

  wireCard({
    create: createVisibilityCard,
    dismissKey: VISIBILITY_DISMISS_KEY,
    sessionKey: VISIBILITY_SESSION_KEY,
    delay: 6200,
    seenDelay: 9000,
    compactDelay: 3400,
    compactSeenDelay: 5200,
    scrollY: 760,
    compactScrollY: 420,
    analyticsTarget: 'banner-flotante-disponible'
  });
})();
