// GlutenGo — app.js v2
// Mapa moderno con CartoDB tiles, markers SVG, panel lateral.

var catIcon = {
  restaurante:'🍽️', cafeteria:'☕', panaderia:'🥐',
  heladeria:'🍦', rotiseria:'🥡', hotel:'🏨', almacen:'🛒', otro:'📍'
};

var dirFilter  = 'todos';
var searchTerm = '';

// ── MAPA ────────────────────────────────────────────────────────
var map, markers = [], mapFilter = 'todos';

function makePinSVG(color, size) {
  size = size || 32;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M16 0C9.373 0 4 5.373 4 12c0 8.5 12 28 12 28S28 20.5 28 12c0-6.627-5.373-12-12-12z" fill="' + color + '" stroke="white" stroke-width="2.5"/>' +
    '<circle cx="16" cy="12" r="5" fill="white" fill-opacity="0.9"/>' +
    '</svg>';
}

function initMap() {
  map = L.map('map', {
    center: [-34.9058, -56.1882],
    zoom: 13,
    zoomControl: true,
    attributionControl: true,
    tap: false,
  });

  // CartoDB Positron — tiles modernos, sin API key
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://openstreetmap.org">OSM</a> &copy; <a href="https://carto.com">CARTO</a>'
  }).addTo(map);

  lugares.forEach(function(l) {
    var isExclusivo = l.tipo === 'exclusivo';
    var color = isExclusivo ? '#166534' : '#D97706';

    var icon = L.divIcon({
      className: '',
      html: '<div class="map-pin" style="position:relative;cursor:pointer;filter:drop-shadow(0 3px 6px rgba(0,0,0,.35))">' + makePinSVG(color) + '</div>',
      iconSize: [32, 40],
      iconAnchor: [16, 40],
      popupAnchor: [0, -44],
    });

    var popup = L.popup({
      maxWidth: 260,
      minWidth: 200,
      className: 'gluten-popup',
    }).setContent(
      '<div style="font-family:DM Sans,system-ui,sans-serif;padding:.15rem .1rem">' +
      '<div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.4rem">' +
      '<span style="font-size:1.1rem">' + (catIcon[l.category] || '📍') + '</span>' +
      '<strong style="font-size:.95rem;line-height:1.2">' + l.name + '</strong>' +
      '</div>' +
      '<p style="font-size:.78rem;color:#6B7280;margin-bottom:.5rem;line-height:1.4">' + l.address + ' · ' + l.neighborhood + '</p>' +
      '<span style="display:inline-block;font-size:.72rem;font-weight:700;padding:.2rem .55rem;border-radius:20px;' +
      'background:' + (isExclusivo ? '#DCFCE7' : '#FEF3C7') + ';color:' + (isExclusivo ? '#166534' : '#92400E') + ';margin-bottom:.6rem">' +
      (isExclusivo ? '🌟 100% Sin Gluten' : '⚡ Con Opciones SG') + '</span>' +
      '<br><a href="/lugar.html?slug=' + l.slug + '" ' +
      'style="display:inline-flex;align-items:center;gap:.3rem;font-size:.82rem;font-weight:700;color:#fff;' +
      'background:#166534;padding:.35rem .75rem;border-radius:8px;text-decoration:none;margin-top:.2rem">' +
      'Ver ficha completa <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></a>' +
      '</div>'
    );

    var marker = L.marker([l.lat, l.lng], { icon: icon }).bindPopup(popup).addTo(map);
    marker._lugartipo = l.tipo;
    marker._slug = l.slug;
    markers.push(marker);
  });
}

function setMapFilter(btn, filter) {
  document.querySelectorAll('.map-chip').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  mapFilter = filter;
  markers.forEach(function(m) {
    if (filter === 'todos' || m._lugartipo === filter) {
      if (!map.hasLayer(m)) m.addTo(map);
    } else {
      if (map.hasLayer(m)) map.removeLayer(m);
    }
  });
}

function geolocateMe() {
  if (!navigator.geolocation) { alert('Tu navegador no soporta geolocalización.'); return; }
  var btn = document.querySelector('.map-chip-geo');
  var prev = btn.innerHTML;
  btn.innerHTML = '📍 Buscando…';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 15);
      L.circle([pos.coords.latitude, pos.coords.longitude], {
        radius: 200, color: '#3B82F6', fillColor: '#BFDBFE', fillOpacity: .35, weight: 2
      }).addTo(map);
      L.marker([pos.coords.latitude, pos.coords.longitude], {
        icon: L.divIcon({
          className: '',
          html: '<div style="background:#3B82F6;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(59,130,246,.5)"></div>',
          iconSize: [16, 16], iconAnchor: [8, 8]
        })
      }).addTo(map).bindPopup('<b>📍 Estás acá</b>').openPopup();
      btn.innerHTML = prev;
      btn.disabled = false;
    },
    function() {
      btn.innerHTML = '⚠️ Sin permiso';
      btn.disabled = false;
      setTimeout(function() { btn.innerHTML = prev; }, 2500);
    }
  );
}

// ── RAIL EXCLUSIVOS ──────────────────────────────────────────────
function buildRail() {
  var rail = document.getElementById('rail-exclusivos');
  var excl = lugares.filter(function(l) { return l.tipo === 'exclusivo'; });
  rail.innerHTML = excl.map(function(l) {
    return '<a href="/lugar.html?slug=' + l.slug + '" class="rail-card">' +
      '<div class="icon">' + (catIcon[l.category] || '📍') + '</div>' +
      '<div class="rc-name">' + l.name + '</div>' +
      '<div class="rc-hood">' + l.neighborhood + '</div>' +
      '<span class="rc-tag">100% libre de gluten</span>' +
      '</a>';
  }).join('');
}

// ── DIRECTORIO ───────────────────────────────────────────────────
function buildDir(filter, q) {
  var grid = document.getElementById('dir-grid');
  var filtered = lugares.filter(function(l) {
    var matchFilter = filter === 'todos' || l.tipo === filter || l.neighborhood === filter;
    var matchQ = !q ||
      l.name.toLowerCase().indexOf(q) !== -1 ||
      l.neighborhood.toLowerCase().indexOf(q) !== -1 ||
      l.desc.toLowerCase().indexOf(q) !== -1;
    return matchFilter && matchQ;
  });

  if (!filtered.length) {
    grid.innerHTML = '<div id="dir-empty"><p style="font-size:2rem">🤷</p><p>Ningún lugar encontrado.</p></div>';
    return;
  }

  grid.innerHTML = filtered.map(function(l) {
    return '<a href="/lugar.html?slug=' + l.slug + '" class="dir-card ' + l.tipo + '">' +
      '<div class="dc-header">' +
      '<span class="dc-name">' + (catIcon[l.category] || '📍') + ' ' + l.name + '</span>' +
      '<span class="dc-badge ' + l.tipo + '">' + (l.tipo === 'exclusivo' ? '100% GF' : 'Mixto') + '</span>' +
      '</div>' +
      '<div class="dc-meta"><span>' + l.neighborhood + '</span><span class="dc-sep">·</span><span>' + l.category + '</span></div>' +
      '<p class="dc-desc">' + l.desc + '</p>' +
      '<span class="dc-cta">Ver ficha <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></span>' +
      '</a>';
  }).join('');
}

function setDirFilter(btn, filter) {
  document.querySelectorAll('.chip').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  dirFilter = filter;
  buildDir(dirFilter, searchTerm);
}

function filterDir() {
  searchTerm = document.getElementById('hero-search').value.toLowerCase().trim();
  buildDir(dirFilter, searchTerm);
}

function scrollToDir(e) {
  if (e.key === 'Enter') {
    document.getElementById('directorio').scrollIntoView({ behavior: 'smooth' });
  }
}

function handleWaitlist(e) {
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
  .then(function() { window.location.href = '/gracias.html'; })
  .catch(function() { window.location.href = '/gracias.html'; });
}

// ── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  try { AOS.init({ duration: 600, once: true, offset: 60 }); } catch(e) {}

  if (typeof lugares !== 'undefined' && lugares.length) {
    try { initMap(); } catch(e) { console.error('Map error:', e); }
    try { buildRail(); } catch(e) { console.error('Rail error:', e); }
    try { buildDir('todos', ''); } catch(e) { console.error('Dir error:', e); }
  } else {
    console.error('data.js no cargó');
    document.getElementById('dir-grid').innerHTML =
      '<div id="dir-empty"><p style="font-size:2rem">⚠️</p><p>No se pudieron cargar los lugares. Recargá la página.</p></div>';
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(function() {});
}
