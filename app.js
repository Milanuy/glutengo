// GlutenGo — app.js v1.2
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

var CATEGORY_LABELS = {
  restaurante: 'Restaurante',
  cafeteria: 'Cafetería',
  panaderia: 'Panadería',
  heladeria: 'Heladería',
  rotiseria: 'Para llevar',
  almacen: 'Almacén',
  hotel: 'Hotel',
  otro: 'Otro',
};

var MOMENT_FILTERS = {
  'moment:desayuno': ['cafeteria', 'panaderia'],
  'moment:almuerzo': ['restaurante', 'rotiseria'],
  'moment:postre': ['heladeria', 'cafeteria', 'panaderia'],
  'moment:llevar': ['rotiseria', 'panaderia', 'almacen'],
  'moment:compras': ['almacen'],
};

function formatCategory(category) {
  return CATEGORY_LABELS[category] || category || 'Otro';
}

function formatSponsorTarget(filter) {
  var labels = {
    todos: 'la home de GlutenGo',
    exclusivo: 'locales 100% GF',
    mixto: 'locales con opciones SG',
    'cat:panaderia': 'Panaderías',
    'cat:restaurante': 'Restaurantes',
    'cat:cafeteria': 'Cafés',
    'cat:heladeria': 'Heladerías',
    'cat:almacen': 'Almacenes',
    'moment:desayuno': 'Desayuno o merienda',
    'moment:almuerzo': 'Almuerzo o cena',
    'moment:postre': 'Postre / helado',
    'moment:llevar': 'Para llevar',
    'moment:compras': 'Compras SG'
  };
  if (labels[filter]) return labels[filter];
  return filter || 'esta sección';
}

function sponsorSlotParam(filter) {
  return String(filter || 'todos')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'todos';
}

function matchesFilter(lugar, filter) {
  if (!lugar || filter === 'todos') return true;
  if (filter === 'exclusivo' || filter === 'mixto') return lugar.tipo === filter;
  if (filter && filter.indexOf('cat:') === 0) return lugar.category === filter.replace('cat:', '');
  if (filter && filter.indexOf('moment:') === 0) {
    return (MOMENT_FILTERS[filter] || []).indexOf(lugar.category) !== -1;
  }
  if (filter === 'Online') return lugar.neighborhood.indexOf('Online') === 0;
  return lugar.neighborhood === filter;
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch];
  });
}

function placeLogoHtml(lugar, className) {
  if (!lugar || !lugar.logoUrl) return '';
  var classes = ['brand-logo'];
  if (className) classes.push(className);
  return '<span class="' + classes.join(' ') + '">' +
    '<img src="' + escapeHtml(lugar.logoUrl) + '" alt="Logo de ' + escapeHtml(lugar.name) + '" loading="lazy">' +
  '</span>';
}

function hasValidCoords(lugar) {
  return lugar &&
    Number.isFinite(Number(lugar.lat)) &&
    Number.isFinite(Number(lugar.lng));
}

function getPlacePosition(lugar) {
  var n = Number(lugar && lugar.position);
  return Number.isFinite(n) ? n : 999;
}

function sortPlacesForDisplay(list) {
  return list.slice().sort(function(a, b) {
    return getPlacePosition(a) - getPlacePosition(b);
  });
}

function normalizePublicPlace(place) {
  if (!place || !place.slug || !place.name) return null;
  return {
    slug: String(place.slug),
    name: String(place.name),
    category: CATEGORY_LABELS[place.category] ? place.category : 'otro',
    tipo: place.tipo === 'exclusivo' ? 'exclusivo' : 'mixto',
    address: place.address || 'Dirección a confirmar',
    neighborhood: place.neighborhood || 'Zona a confirmar',
    phone: place.phone || '',
    desc: place.desc || 'Local registrado en GlutenGo. Confirmá información antes de ir.',
    hours: place.hours || null,
    lat: place.lat,
    lng: place.lng,
    instagram: place.instagram || '',
    plan: place.plan || 'basico',
    position: getPlacePosition(place),
    logoUrl: place.logoUrl || '',
    photoUrls: Array.isArray(place.photoUrls) ? place.photoUrls : [],
    featuredPlacement: place.featuredPlacement || 'none',
    sponsor: place.sponsor || {},
    benefits: place.benefits || {},
    source: place.source || 'admin',
  };
}

function mergePublicPlaces(publicPlaces) {
  if (!Array.isArray(publicPlaces) || !publicPlaces.length) return;
  var bySlug = {};
  lugares.forEach(function(place) {
    bySlug[place.slug] = Object.assign({}, place);
  });
  publicPlaces.forEach(function(raw) {
    var place = normalizePublicPlace(raw);
    if (!place) return;
    var existing = bySlug[place.slug];
    if (existing && !hasValidCoords(place) && hasValidCoords(existing)) {
      place.lat = existing.lat;
      place.lng = existing.lng;
    }
    bySlug[place.slug] = Object.assign({}, existing || {}, place);
  });
  lugares = Object.keys(bySlug).map(function(slug) { return bySlug[slug]; });
}

function loadPublicPlaces() {
  return fetch('/api/public-businesses')
    .then(function(r) { return r.ok ? r.json() : []; })
    .then(function(list) { mergePublicPlaces(list); })
    .catch(function(err) { console.warn('No se pudieron cargar negocios activos:', err.message); });
}

function parseSponsorDate(value) {
  if (!value) return null;
  var parts = String(value).split('-');
  if (parts.length !== 3) return null;
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function isSponsorLive(sponsor) {
  if (!sponsor || !sponsor.active || !sponsor.target) return false;
  if (!sponsor.start || !sponsor.end) return false;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var start = parseSponsorDate(sponsor.start);
  var end = parseSponsorDate(sponsor.end);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

function sponsorMatchesFilter(lugar, filter) {
  var sponsor = lugar && lugar.sponsor;
  if (!isSponsorLive(sponsor)) return false;
  return sponsor.target === filter || (filter === 'todos' && sponsor.target === 'home');
}

function findSponsorForFilter(filter) {
  var matches = lugares.filter(function(l) { return sponsorMatchesFilter(l, filter); });
  return sortPlacesForDisplay(matches)[0] || null;
}

function sponsorCardHtml(lugar, filter) {
  if (!lugar) return '';
  var sponsor = lugar.sponsor || {};
  var label = sponsor.label || 'Sponsor de esta sección';
  var section = filter === 'todos' ? 'GlutenGo' : label;
  return '<a href="/lugar.html?slug=' + encodeURIComponent(lugar.slug) + '" class="sponsor-card sponsor-card-live">' +
    '<div>' +
      '<span class="sponsor-kicker">Presentado por</span>' +
      '<div class="sponsor-title">' + escapeHtml(section) + '</div>' +
      '<div class="sponsor-meta">' + escapeHtml(lugar.name) + ' acompaña esta búsqueda en GlutenGo. Confirmá siempre datos y disponibilidad con el local.</div>' +
    '</div>' +
    '<span class="sponsor-cta">Ver ficha</span>' +
  '</a>';
}

function availableSponsorCardHtml(filter) {
  var target = formatSponsorTarget(filter);
  var href = '/negocios.html?ref=sponsor-disponible&slot=' + encodeURIComponent(sponsorSlotParam(filter)) + '#visibilidad';
  return '<a href="' + href + '" class="sponsor-card sponsor-card-available">' +
    '<div>' +
      '<span class="sponsor-kicker">Espacio disponible</span>' +
      '<div class="sponsor-title">Tu local puede aparecer acá</div>' +
      '<div class="sponsor-meta">Sponsor de ' + escapeHtml(target) + ': una ubicación mensual para llegar a personas que ya están buscando opciones sin gluten.</div>' +
    '</div>' +
    '<span class="sponsor-cta">Aparecer acá</span>' +
  '</a>';
}

function emptyStateSvg(color) {
  var stroke = color || '#9CA3AF';
  return '<svg width="42" height="42" fill="none" stroke="' + stroke + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/>' +
    '<path d="M20 20l-3.5-3.5"/>' +
    '<path d="M8.5 9.5h.01M13.5 9.5h.01"/>' +
    '<path d="M8.8 13.8c1.5 1.1 3 1.1 4.4 0"/>' +
  '</svg>';
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
  map.attributionControl.setPrefix(false);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  lugares.forEach(function(l){
    if (!hasValidCoords(l)) return;
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
        '<div style="font-size:.69rem;color:#8a8f98;line-height:1.35;margin:0 0 .55rem">' +
          'Info pública: confirmá protocolo y disponibilidad con el local.' +
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
    marker._lugar     = l;
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

  setTimeout(function(){
    try { map.invalidateSize(); } catch(e) {}
  }, 120);
}

function updateStats(){
  var totalEl = document.getElementById('stat-total');
  var exclEl  = document.getElementById('stat-exclusivos');
  var mixtEl  = document.getElementById('stat-mixtos');
  if(!totalEl || !exclEl || !mixtEl) return;

  var exclusivos = lugares.filter(function(l){ return l.tipo === 'exclusivo'; }).length;
  var mixtos = lugares.filter(function(l){ return l.tipo === 'mixto'; }).length;
  totalEl.textContent = lugares.length;
  exclEl.textContent = exclusivos;
  mixtEl.textContent = mixtos;
}

function setMapFilter(btn, filter){
  document.querySelectorAll('.map-chip').forEach(function(b){b.classList.remove('active')});
  btn.classList.add('active');
  mapFilter = filter;
  markers.forEach(function(m){
    if(matchesFilter(m._lugar, filter)){
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
  var excl = sortPlacesForDisplay(lugares.filter(function(l){ return l.tipo === 'exclusivo'; }));
  rail.innerHTML = excl.map(function(l){
    var iconSvg = getCatSVG(l.category, '#166534');
    var visual = placeLogoHtml(l, 'rail-brand-logo') ||
      '<div class="icon" style="display:flex;align-items:center;justify-content:center">' + iconSvg + '</div>';
    return '<a href="/lugar.html?slug='+encodeURIComponent(l.slug)+'" class="rail-card">' +
      visual +
      '<div class="rc-name">'+escapeHtml(l.name)+'</div>' +
      '<div class="rc-hood">'+escapeHtml(l.neighborhood)+'</div>' +
      '<span class="rc-tag">100% libre de gluten</span>' +
      '</a>';
  }).join('');
}

function scrollRail(direction){
  var rail = document.getElementById('rail-exclusivos');
  if(!rail) return;
  var card = rail.querySelector('.rail-card');
  var step = card ? card.getBoundingClientRect().width + 16 : 280;
  rail.scrollBy({ left: step * direction, behavior: 'smooth' });
}

// ────────────────────────────────────────────────────
// DIRECTORIO
// ────────────────────────────────────────────────────
function buildDir(filter, q){
  var grid = document.getElementById('dir-grid');
  var filtered = lugares.filter(function(l){
    var matchFilter = matchesFilter(l, filter);
    var matchQ = !q ||
      l.name.toLowerCase().indexOf(q) !== -1 ||
      l.neighborhood.toLowerCase().indexOf(q) !== -1 ||
      l.desc.toLowerCase().indexOf(q) !== -1 ||
      formatCategory(l.category).toLowerCase().indexOf(q) !== -1;
    return matchFilter && matchQ;
  });

  if(!filtered.length){
    grid.innerHTML = '<div id="dir-empty">' + emptyStateSvg() + '<p>Ningún lugar encontrado para ese filtro.</p></div>';
    return;
  }

  filtered = sortPlacesForDisplay(filtered);
  var sponsor = findSponsorForFilter(filter);
  var sponsorHtml = sponsorCardHtml(sponsor, filter) || (!q ? availableSponsorCardHtml(filter) : '');

  grid.innerHTML = sponsorHtml + filtered.map(function(l){
    var iconColor = l.tipo === 'exclusivo' ? '#166534' : '#D97706';
    var iconSvg   = getCatSVG(l.category, iconColor);
    var visual = placeLogoHtml(l, 'dc-brand-logo') ||
      '<span class="dc-category-icon">' + iconSvg + '</span>';
    return '<a href="/lugar.html?slug='+encodeURIComponent(l.slug)+'" class="dir-card '+escapeHtml(l.tipo)+'">' +
      '<div class="dc-header">' +
        '<span class="dc-name" style="display:flex;align-items:center;gap:.4rem">' +
          visual + escapeHtml(l.name) +
        '</span>' +
        '<span class="dc-badge '+escapeHtml(l.tipo)+'">'+(l.tipo==='exclusivo'?'100% GF':'Opciones SG')+'</span>' +
      '</div>' +
      '<div class="dc-meta"><span>'+escapeHtml(l.neighborhood)+'</span><span class="dc-sep">·</span><span>'+escapeHtml(formatCategory(l.category))+'</span></div>' +
      '<p class="dc-desc">'+escapeHtml(l.desc)+'</p>' +
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
// INIT
// ────────────────────────────────────────────────────
function initApp() {
  try { AOS.init({duration:600, once:true, offset:60}); } catch(e){}

  if(typeof lugares !== 'undefined' && lugares.length){
    try { updateStats(); } catch(e){ console.error('Stats error:', e); }
    try { initMap(); } catch(e){ console.error('Map error:', e); }
    try { buildRail(); } catch(e){ console.error('Rail error:', e); }
    try { buildDir('todos',''); } catch(e){ console.error('Dir error:', e); }
  } else {
    console.error('data.js no cargó o lugares está vacío');
    document.getElementById('dir-grid').innerHTML =
      '<div id="dir-empty">' + emptyStateSvg('#D97706') + '<p>No se pudieron cargar los lugares. Recargá la página.</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', function(){
  if (typeof lugares === 'undefined') {
    window.lugares = [];
  }
  loadPublicPlaces().then(initApp);
});

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(function(){});
}
