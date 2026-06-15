// GlutenGo — app.js v0.7
// Script principal de la home. Separado del HTML para evitar bloqueo de extensiones.

// ────────────────────────────────────────────────────
// UTILIDADES
// ────────────────────────────────────────────────────
var catIcon = {
  restaurante:'🍽️', cafeteria:'☕', panaderia:'🥐',
  heladeria:'🍦', rotiseria:'🥡', hotel:'🏨', almacen:'🛒', otro:'📍'
};

var dirFilter  = 'todos';
var searchTerm = '';

// ────────────────────────────────────────────────────
// MAPA LEAFLET — v0.7 mapa premium
// ────────────────────────────────────────────────────
var map, markers = [], mapFilter = 'todos';

function makeMarkerHtml(color, emoji, isExcl) {
  var pulse = isExcl
    ? '<span class="gg-pulse-ring"></span>'
    : '';
  return (
    '<div style="position:relative;width:38px;height:50px">' +
      pulse +
      '<div style="' +
        'width:38px;height:38px;border-radius:50%;' +
        'background:' + color + ';' +
        'border:2.5px solid #fff;' +
        'box-shadow:0 3px 14px rgba(0,0,0,.38);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-size:18px;cursor:pointer;' +
        'transition:transform .15s;' +
      '">' +
        emoji +
      '</div>' +
      '<div style="' +
        'width:0;height:0;' +
        'border-left:7px solid transparent;' +
        'border-right:7px solid transparent;' +
        'border-top:13px solid ' + color + ';' +
        'margin:0 auto;' +
        'filter:drop-shadow(0 2px 2px rgba(0,0,0,.2));' +
      '"></div>' +
    '</div>'
  );
}

function initMap(){
  map = L.map('map', {
    center: [-34.9058, -56.1882],
    zoom: 13,
    zoomControl: false,
    attributionControl: true
  });

  // CartoDB Voyager — tiles modernos, coloridos, gratuitos
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>'
  }).addTo(map);

  // Zoom en esquina inferior derecha para no chocar con el header
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  lugares.forEach(function(l){
    var isExcl = l.tipo === 'exclusivo';
    var color  = isExcl ? '#166534' : '#D97706';
    var emoji  = catIcon[l.category] || '📍';

    var icon = L.divIcon({
      className: '',
      html: makeMarkerHtml(color, emoji, isExcl),
      iconSize:    [38, 51],
      iconAnchor:  [19, 51],
      popupAnchor: [0, -56]
    });

    var badgeBg    = isExcl ? '#DCFCE7' : '#FEF3C7';
    var badgeColor = isExcl ? '#166534' : '#92400E';
    var badgeLabel = isExcl ? '🌟 100% Sin Gluten' : '⚡ Con Opciones SG';

    var popupHtml =
      '<div style="font-family:DM Sans,sans-serif;min-width:210px;padding:.6rem .5rem .4rem">' +
        '<div style="font-weight:800;font-size:1rem;color:#111;margin-bottom:.2rem">' + l.name + '</div>' +
        '<div style="font-size:.78rem;color:#6B7280;margin-bottom:.4rem">' +
          l.address + ' &middot; <em>' + l.neighborhood + '</em>' +
        '</div>' +
        '<span style="' +
          'display:inline-block;font-size:.7rem;font-weight:700;' +
          'padding:.15rem .55rem;border-radius:20px;' +
          'background:' + badgeBg + ';color:' + badgeColor + ';' +
          'margin-bottom:.4rem' +
        '">' + badgeLabel + '</span>' +
        '<div id="pop-score-' + l.slug + '" style="font-size:.78rem;color:#6B7280;margin:.2rem 0 .5rem">' +
          '<span style="opacity:.5">Cargando valoración…</span>' +
        '</div>' +
        '<a href="/lugar.html?slug=' + l.slug + '" ' +
          'style="display:block;text-align:center;padding:.42rem .75rem;' +
          'background:#166534;color:#fff;border-radius:9px;' +
          'font-size:.82rem;font-weight:700;text-decoration:none;' +
          'transition:background .15s">' +
          'Ver ficha completa →' +
        '</a>' +
      '</div>';

    var popup = L.popup({ maxWidth: 250, className: 'gg-popup' })
      .setContent(popupHtml);

    var marker = L.marker([l.lat, l.lng], { icon: icon })
      .bindPopup(popup)
      .addTo(map);

    marker._lugartipo = l.tipo;
    marker._slug      = l.slug;
    markers.push(marker);

    // Cargar score cuando se abre el popup (lazy)
    marker.on('popupopen', function(){
      var el = document.getElementById('pop-score-' + l.slug);
      if(!el || el.dataset.loaded) return;
      el.dataset.loaded = '1';
      fetch('/api/rating?slug=' + encodeURIComponent(l.slug))
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(!el) return;
          if(!d || d.count === 0){
            el.innerHTML = '<span style="color:#9CA3AF;font-style:italic">Sin valoraciones aun. ¡Sé el primero!</span>';
          } else {
            var rounded = Math.round(d.avg);
            var stars = '';
            for(var i=1;i<=5;i++){
              stars += i <= rounded ? '⭐' : '☆';
            }
            el.innerHTML = (
              stars + ' <strong>' + d.avg.toFixed(1) + '</strong>' +
              '<span style="color:#9CA3AF"> (' + d.count + ' valoraci' +
              (d.count > 1 ? 'ones' : 'ón') + ')</span>'
            );
          }
        })
        .catch(function(){ if(el) el.innerHTML = ''; });
    });
  });
}

function setMapFilter(btn, filter){
  document.querySelectorAll('.map-chip').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  mapFilter = filter;
  markers.forEach(function(m){
    if(filter === 'todos' || m._lugartipo === filter){
      if(!map.hasLayer(m)) m.addTo(map);
    } else {
      if(map.hasLayer(m)) map.removeLayer(m);
    }
  });
}

function geolocateMe(){
  if(!navigator.geolocation){ alert('Tu navegador no soporta geolocalización.'); return; }
  var btn = document.querySelector('.map-chip-geo');
  var prev = btn.innerHTML;
  btn.innerHTML = '📍 Buscando…';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    function(pos){
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      L.circle([pos.coords.latitude, pos.coords.longitude], {
        radius: 200, color: '#3B82F6', fillColor: '#BFDBFE', fillOpacity: .4
      }).addTo(map);
      L.marker([pos.coords.latitude, pos.coords.longitude], {
        icon: L.divIcon({
          className:'',
          html:'<div style="background:#3B82F6;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>',
          iconSize:[16,16],iconAnchor:[8,8]
        })
      }).addTo(map).bindPopup('📍 Estás acá').openPopup();
      btn.innerHTML = prev; btn.disabled = false;
    },
    function(){
      btn.innerHTML = '⚠️ Sin permiso'; btn.disabled = false;
      setTimeout(function(){btn.innerHTML=prev;},2500);
    }
  );
}

// ────────────────────────────────────────────────────
// RAIL EXCLUSIVOS
// ────────────────────────────────────────────────────
function buildRail(){
  var rail = document.getElementById('rail-exclusivos');
  var excl = lugares.filter(function(l){ return l.tipo === 'exclusivo'; });
  rail.innerHTML = excl.map(function(l){
    return '<a href="/lugar.html?slug='+l.slug+'" class="rail-card">' +
      '<div class="icon">'+(catIcon[l.category]||'📍')+'</div>' +
      '<div class="rc-name">'+l.name+'</div>' +
      '<div class="rc-hood">'+l.neighborhood+'</div>' +
      '<span class="rc-tag">100% libre de gluten</span>' +
      '</a>';
  }).join('');
}

// ────────────────────────────────────────────────────
// DIRECTORIO
// ────────────────────────────────────────────────────
function buildDir(filter, q){
  var grid = document.getElementById('dir-grid');
  var filtered = lugares.filter(function(l){
    var matchFilter =
      filter === 'todos' ||
      l.tipo === filter ||
      l.neighborhood === filter;
    var matchQ = !q ||
      l.name.toLowerCase().indexOf(q) !== -1 ||
      l.neighborhood.toLowerCase().indexOf(q) !== -1 ||
      l.desc.toLowerCase().indexOf(q) !== -1;
    return matchFilter && matchQ;
  });

  if(!filtered.length){
    grid.innerHTML = '<div id="dir-empty"><p style="font-size:2rem">🤷</p><p>Ningún lugar encontrado para ese filtro.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(function(l){
    return '<a href="/lugar.html?slug='+l.slug+'" class="dir-card '+l.tipo+'">' +
      '<div class="dc-header">' +
        '<span class="dc-name">'+(catIcon[l.category]||'📍')+' '+l.name+'</span>' +
        '<span class="dc-badge '+l.tipo+'">'+(l.tipo==='exclusivo'?'100% GF':'Mixto')+'</span>' +
      '</div>' +
      '<div class="dc-meta"><span>'+l.neighborhood+'</span><span class="dc-sep">·</span><span>'+l.category+'</span></div>' +
      '<p class="dc-desc">'+l.desc+'</p>' +
      '<span class="dc-cta">Ver ficha <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></span>' +
    '</a>';
  }).join('');
}

function setDirFilter(btn, filter){
  document.querySelectorAll('.chip').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  dirFilter = filter;
  buildDir(dirFilter, searchTerm);
}

function filterDir(){
  searchTerm = document.getElementById('hero-search').value.toLowerCase().trim();
  buildDir(dirFilter, searchTerm);
}

function scrollToDir(e){
  if(e.key === 'Enter'){
    document.getElementById('directorio').scrollIntoView({behavior:'smooth'});
  }
}

// ────────────────────────────────────────────────────
// WAITLIST
// ────────────────────────────────────────────────────
function handleWaitlist(e){
  e.preventDefault();
  var form  = e.target;
  var email = form.querySelector('input[name="email"]').value.trim();
  var btn   = form.querySelector('button[type="submit"]');
  btn.disabled    = true;
  btn.textContent = 'Guardando…';
  fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email })
  })
  .then(function(){ window.location.href = '/gracias.html'; })
  .catch(function(){ window.location.href = '/gracias.html'; });
}

// ────────────────────────────────────────────────────
// INIT — AOS primero, luego datos
// ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
  // AOS siempre primero: sin esto los data-aos quedan opacity:0
  try { AOS.init({duration:600, once:true, offset:60}); } catch(e){}

  if(typeof lugares !== 'undefined' && lugares.length){
    try { initMap(); } catch(e){ console.error('Map error:', e); }
    try { buildRail(); } catch(e){ console.error('Rail error:', e); }
    try { buildDir('todos',''); } catch(e){ console.error('Dir error:', e); }
  } else {
    console.error('data.js no cargó o lugares está vacío');
    document.getElementById('dir-grid').innerHTML =
      '<div id="dir-empty"><p style="font-size:2rem">⚠️</p><p>No se pudieron cargar los lugares. Recargá la página.</p></div>';
  }
});

// Service Worker
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(function(){});
}
