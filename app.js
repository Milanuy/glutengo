// GlutenGo — app.js v0.6
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
// MAPA LEAFLET
// ────────────────────────────────────────────────────
var map, markers = [], mapFilter = 'todos';

function initMap(){
  map = L.map('map', {
    center: [-34.9058, -56.1882],
    zoom: 13,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
  }).addTo(map);

  lugares.forEach(function(l){
    var color = l.tipo === 'exclusivo' ? '#166534' : '#E8A93C';
    var icon = L.divIcon({
      className: '',
      html: '<div style="background:'+color+';width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer"></div>',
      iconSize: [24,24], iconAnchor: [12,24], popupAnchor: [0,-28]
    });

    var popup = L.popup({maxWidth:220}).setContent(
      '<div style="font-family:DM Sans,sans-serif;padding:.25rem">' +
      '<strong style="font-size:.95rem">' + l.name + '</strong><br>' +
      '<span style="font-size:.78rem;color:#6B7280">' + l.address + ' · ' + l.neighborhood + '</span><br>' +
      '<span style="display:inline-block;margin:.3rem 0;font-size:.72rem;font-weight:700;padding:.15rem .4rem;border-radius:20px;background:' + (l.tipo==='exclusivo'?'#DCFCE7':'#FEF3C7') + ';color:' + (l.tipo==='exclusivo'?'#166534':'#92400E') + '">' +
      (l.tipo==='exclusivo'?'🌟 100% Sin Gluten':'⚡ Con Opciones SG') +
      '</span><br>' +
      '<a href="/lugar.html?slug=' + l.slug + '" style="font-size:.82rem;font-weight:700;color:#166534">Ver ficha completa →</a>' +
      '</div>'
    );

    var marker = L.marker([l.lat, l.lng], {icon:icon}).bindPopup(popup).addTo(map);
    marker._lugartipo = l.tipo;
    markers.push(marker);
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
