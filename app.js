// GlutenGo — app.js v0.8
// Script principal de la home. Separado del HTML para evitar bloqueo de extensiones.

// ────────────────────────────────────────────────────
// ÍCONOS SVG POR CATEGORÍA (sin emojis)
// ────────────────────────────────────────────────────
var catSVG = {
  restaurante:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/>' +
      '<path d="M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>' +
    '</svg>',
  cafeteria:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M18 8h1a4 4 0 010 8h-1"/>' +
      '<path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/>' +
      '<line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>' +
    '</svg>',
  panaderia:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M17 8C17 11 13 13 12 14C11 13 7 11 7 8a5 5 0 0110 0z"/>' +
      '<path d="M9 14v7h6v-7"/>' +
      '<line x1="9" y1="17.5" x2="15" y2="17.5"/>' +
    '</svg>',
  heladeria:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<circle cx="12" cy="9" r="5"/>' +
      '<path d="M9.5 14l2.5 7 2.5-7"/>' +
    '</svg>',
  rotiseria:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/>' +
    '</svg>',
  hotel:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>' +
      '<polyline points="9 22 9 12 15 12 15 22"/>' +
    '</svg>',
  almacen:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>' +
      '<line x1="3" y1="6" x2="21" y2="6"/>' +
      '<path d="M16 10a4 4 0 01-8 0"/>' +
    '</svg>',
  otro:
    '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">' +
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>' +
      '<circle cx="12" cy="10" r="3"/>' +
    '</svg>',
};

function getCatSVG(category, color) {
  var svg = catSVG[category] || catSVG.otro;
  // Inyectar color de stroke para uso en cards (no markers)
  return color ? svg.replace('stroke="currentColor"', 'stroke="' + color + '"') : svg;
}

var dirFilter  = 'todos';
var searchTerm = '';

// ────────────────────────────────────────────────────
// MAPA LEAFLET — v0.8 markers SVG
// ────────────────────────────────────────────────────
var map, markers = [], mapFilter = 'todos';

function makeMarkerHtml(color, catKey, isExcl) {
  var pulse = isExcl ? '<span class="gg-pulse-ring"></span>' : '';
  // SVG icon blanco sobre fondo de color
  var svg = (catSVG[catKey] || catSVG.otro)
    .replace('stroke="currentColor"', 'stroke="#fff"')
    .replace(/width="16" height="16"/, 'width="18" height="18"');

  return (
    '<div style="position:relative;width:38px;height:50px">' +
      pulse +
      '<div style="' +
        'width:38px;height:38px;border-radius:50%;' +
        'background:' + color + ';' +
        'border:2.5px solid #fff;' +
        'box-shadow:0 3px 14px rgba(0,0,0,.38);' +
        'display:flex;align-items:center;justify-content:center;' +
        'cursor:pointer;transition:transform .15s;' +
      '">' +
        svg +
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

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>'
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  lugares.forEach(function(l){
    var isExcl = l.tipo === 'exclusivo';
    var color  = isExcl ? '#166534' : '#D97706';

    var icon = L.divIcon({
      className: '',
      html: makeMarkerHtml(color, l.category, isExcl),
      iconSize:    [38, 51],
      iconAnchor:  [19, 51],
      popupAnchor: [0, -56]
    });

    var badgeBg    = isExcl ? '#DCFCE7' : '#FEF3C7';
    var badgeColor = isExcl ? '#166534' : '#92400E';
    var badgeLabel = isExcl ? '100% Sin Gluten' : 'Con Opciones SG';

    var popupHtml =
      '<div style="font-family:DM Sans,sans-serif;min-width:210px;padding:.6rem .5rem .4rem">' +
        '<div style="font-weight:800;font-size:1rem;color:#111;margin-bottom:.2rem">' + l.name + '</div>' +
        '<div style="font-size:.78rem;color:#6B7280;margin-bottom:.4rem">' +
          l.address + ' &middot; <em>' + l.neighborhood + '</em>' +
        '</div>' +
        '<span style="' +
          'display:inline-flex;align-items:center;gap:.3rem;' +
          'font-size:.7rem;font-weight:700;' +
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
          'font-size:.82rem;font-weight:700;text-decoration:none">' +
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

    marker.on('popupopen', function(){
      var el = document.getElementById('pop-score-' + l.slug);
      if(!el || el.dataset.loaded) return;
      el.dataset.loaded = '1';
      fetch('/api/rating?slug=' + encodeURIComponent(l.slug))
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(!el) return;
          if(!d || d.count === 0){
            el.innerHTML = '<span style="color:#9CA3AF;font-style:italic">Sin valoraciones aún</span>';
          } else {
            var rounded = Math.round(d.avg);
            var stars = '';
            for(var i=1;i<=5;i++) stars += i <= rounded ? '★' : '☆';
            el.innerHTML = (
              '<span style="color:#F59E0B">' + stars + '</span> <strong>' + d.avg.toFixed(1) + '</strong>' +
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
  btn.textContent = 'Buscando…';
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
      }).addTo(map).bindPopup('Estás acá').openPopup();
      btn.innerHTML = prev; btn.disabled = false;
    },
    function(){
      btn.textContent = 'Sin permiso'; btn.disabled = false;
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
    var iconSvg = getCatSVG(l.category, '#166534');
    return '<a href="/lugar.html?slug='+l.slug+'" class="rail-card">' +
      '<div class="icon" style="display:flex;align-items:center;justify-content:center">' + iconSvg + '</div>' +
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
    var iconColor = l.tipo === 'exclusivo' ? '#166534' : '#D97706';
    var iconSvg   = getCatSVG(l.category, iconColor);
    return '<a href="/lugar.html?slug='+l.slug+'" class="dir-card '+l.tipo+'">' +
      '<div class="dc-header">' +
        '<span class="dc-name" style="display:flex;align-items:center;gap:.4rem">' +
          '<span style="flex-shrink:0">' + iconSvg + '</span>' + l.name +
        '</span>' +
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
// INIT
// ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function(){
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

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(function(){});
}
                       