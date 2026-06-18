(function(){
  var DISMISS_KEY = 'glutengo_business_cta_dismissed_until';
  var SESSION_KEY = 'glutengo_business_cta_seen';
  var now = Date.now();

  if (location.pathname.indexOf('negocios.html') !== -1) return;

  try {
    var dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedUntil && dismissedUntil > now) return;
  } catch (_) {}

  if (document.getElementById('gg-business-cta')) return;

  var style = document.createElement('style');
  style.textContent = [
    '#gg-business-cta{position:fixed;right:18px;bottom:18px;z-index:320;width:min(330px,calc(100vw - 32px));background:#0E3D22;color:#fff;border:1px solid rgba(255,255,255,.16);border-radius:14px;box-shadow:0 18px 42px rgba(0,0,0,.24);padding:14px 14px 13px;font-family:DM Sans,system-ui,sans-serif;opacity:0;transform:translateY(16px);pointer-events:none;transition:opacity .22s ease,transform .22s ease}',
    '#gg-business-cta.gg-show{opacity:1;transform:translateY(0);pointer-events:auto}',
    '#gg-business-cta .gg-biz-kicker{display:block;color:#E8A93C;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}',
    '#gg-business-cta .gg-biz-title{font-family:Fraunces,Georgia,serif;font-weight:900;font-size:18px;line-height:1.12;margin:0 28px 5px 0;color:#fff}',
    '#gg-business-cta .gg-biz-copy{font-size:12px;line-height:1.45;color:rgba(255,255,255,.76);margin:0 0 10px}',
    '#gg-business-cta .gg-biz-actions{display:flex;align-items:center;gap:8px}',
    '#gg-business-cta .gg-biz-link{display:inline-flex;align-items:center;justify-content:center;background:#E8A93C;color:#0E3D22;text-decoration:none;font-size:12px;font-weight:800;border-radius:10px;padding:9px 22px;min-height:36px;min-width:150px}',
    '#gg-business-cta .gg-biz-muted{font-size:11px;color:rgba(255,255,255,.6)}',
    '#gg-business-cta .gg-biz-close{position:absolute;top:8px;right:8px;width:28px;height:28px;border:0;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
    '#gg-business-cta .gg-biz-close:hover{background:rgba(255,255,255,.18)}',
    '#gg-business-cta svg{width:15px;height:15px}',
    '@media(max-width:640px){#gg-business-cta{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));width:auto;border-radius:14px;padding:12px 46px 12px 14px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px}#gg-business-cta .gg-biz-kicker{display:none}#gg-business-cta .gg-biz-title{font-size:15px;line-height:1.08;margin:0;max-width:190px}#gg-business-cta .gg-biz-copy{display:none}#gg-business-cta .gg-biz-actions{justify-content:flex-end}#gg-business-cta .gg-biz-link{min-width:156px;min-height:44px;padding:10px 20px;border-radius:12px;font-size:13px}#gg-business-cta .gg-biz-muted{display:none}#gg-business-cta .gg-biz-close{top:50%;right:10px;transform:translateY(-50%)}}'
  ].join('');
  document.head.appendChild(style);

  var banner = document.createElement('aside');
  banner.id = 'gg-business-cta';
  banner.setAttribute('aria-label', 'Invitación para negocios');
  banner.innerHTML =
    '<button type="button" class="gg-biz-close" aria-label="Cerrar invitación">' +
      '<svg fill="none" stroke="currentColor" stroke-width="2.4" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
    '</button>' +
    '<span class="gg-biz-kicker">Espacio banner disponible</span>' +
    '<h2 class="gg-biz-title">¿Tu local tiene opciones sin gluten?</h2>' +
    '<p class="gg-biz-copy">Este espacio puede mostrar tu local a personas que ya están buscando dónde comer sin gluten.</p>' +
    '<div class="gg-biz-actions">' +
      '<a class="gg-biz-link" href="/negocios.html?ref=banner-disponible#visibilidad">Aparecer acá</a>' +
      '<span class="gg-biz-muted">Desde $590/semana</span>' +
    '</div>';

  function dismiss(days) {
    banner.classList.remove('gg-show');
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch (_) {}
  }

  banner.querySelector('.gg-biz-close').addEventListener('click', function(){
    dismiss(14);
  });

  banner.querySelector('.gg-biz-link').addEventListener('click', function(){
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (_) {}
  });

  function show() {
    if (!document.body || document.body.contains(banner)) return;
    document.body.appendChild(banner);
    requestAnimationFrame(function(){ banner.classList.add('gg-show'); });
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (_) {}
  }

  var hasSeen = false;
  try { hasSeen = sessionStorage.getItem(SESSION_KEY) === '1'; } catch (_) {}
  var delay = hasSeen ? 7500 : 4200;
  var timer = setTimeout(show, delay);

  function onScroll() {
    if (window.scrollY > 520) {
      clearTimeout(timer);
      show();
      window.removeEventListener('scroll', onScroll);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
