/* ═══════════════════════════════════════════════
   AlertMap — dashboard.js
   Handles: user info, subscribed places,
            phone update, place search, Leaflet map
   ═══════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────
   DUMMY USER DATA  (replace with API)
   ───────────────────────────────────── */
const user = {
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  phone: '+44 7700 900123',
};

let subscribedPlaces = [
  { id: 1, name: 'London',   country: 'United Kingdom', emoji: '🇬🇧', bg: '#eef1ff', alerts: 4  },
  { id: 2, name: 'New York', country: 'United States',  emoji: '🇺🇸', bg: '#fff1f0', alerts: 7  },
  { id: 3, name: 'Tokyo',    country: 'Japan',           emoji: '🇯🇵', bg: '#fff7ed', alerts: 2  },
  { id: 4, name: 'Paris',    country: 'France',          emoji: '🇫🇷', bg: '#f0f9ff', alerts: 3  },
  { id: 5, name: 'Sydney',   country: 'Australia',       emoji: '🇦🇺', bg: '#f0fdf4', alerts: 1  },
];

/* ─────────────────────────────────────
   INIT
   ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  renderUserInfo();
  renderPlaces();
  initDashMap();
  initTicker();

  // Close autocomplete dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.place-search-wrap')) {
      document.getElementById('placeDropdown').classList.add('hidden');
    }
  });

  // Keyboard shortcut for place search
  document.getElementById('placeSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') subscribeSelectedPlace();
    if (e.key === 'Escape') document.getElementById('placeDropdown').classList.add('hidden');
  });
});

/* ─────────────────────────────────────
   GREETING
   ───────────────────────────────────── */
function setGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
  document.getElementById('dashGreeting').textContent = greet;
}

/* ─────────────────────────────────────
   USER INFO
   ───────────────────────────────────── */
function renderUserInfo() {
  document.getElementById('dashName').textContent  = `${user.firstName} ${user.lastName}`;
  document.getElementById('dashEmail').textContent = user.email;
  document.getElementById('dashPhone').textContent = user.phone;
  document.getElementById('dashAvatar').textContent =
    (user.firstName[0] + user.lastName[0]).toUpperCase();
}

/* ─────────────────────────────────────
   SUBSCRIBED PLACES
   ───────────────────────────────────── */
function renderPlaces() {
  const grid = document.getElementById('placesGrid');
  grid.innerHTML = '';

  subscribedPlaces.forEach(p => {
    const alertClass =
      p.alerts === 0 ? 'chip-alerts-none' :
      p.alerts <= 3  ? 'chip-alerts-low'  : 'chip-alerts-high';

    const chip = document.createElement('div');
    chip.className = 'place-chip';
    chip.innerHTML = `
      <div class="place-chip-icon" style="background:${p.bg}">${p.emoji}</div>
      <div class="place-chip-info">
        <div class="place-chip-name">${p.name}</div>
        <div class="place-chip-sub">${p.country}</div>
        <div class="place-chip-alerts ${alertClass}">
          ${p.alerts === 0
            ? '✓ No alerts'
            : `⚠ ${p.alerts} alert${p.alerts !== 1 ? 's' : ''}`}
        </div>
      </div>
      <button class="place-chip-remove" title="Unsubscribe from ${p.name}" onclick="removePlace(${p.id})">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    grid.appendChild(chip);
  });

  updatePlaceCount();
}

function removePlace(id) {
  subscribedPlaces = subscribedPlaces.filter(p => p.id !== id);
  renderPlaces();
}

function updatePlaceCount() {
  const n = subscribedPlaces.length;
  document.getElementById('placesBadge').textContent = `${n} place${n !== 1 ? 's' : ''}`;
  document.getElementById('statPlaces').textContent   = n;
}

/* ─────────────────────────────────────
   PHONE UPDATE
   ───────────────────────────────────── */
function handlePhoneUpdate(e) {
  e.preventDefault();
  const val = document.getElementById('newPhone').value.trim();
  const msg = document.getElementById('phoneMsg');

  if (!val) {
    showInlineMsg(msg, 'Please enter a phone number.', 'error');
    return;
  }

  user.phone = val;
  document.getElementById('dashPhone').textContent = val;
  document.getElementById('newPhone').value = '';
  showInlineMsg(msg, 'Phone number updated successfully!', 'success');
}

function showInlineMsg(el, text, type) {
  el.textContent = text;
  el.className = `inline-msg ${type}`;
  setTimeout(() => { el.className = 'inline-msg hidden'; }, 3500);
}

/* ─────────────────────────────────────
   PLACE SEARCH  (Nominatim autocomplete)
   ───────────────────────────────────── */
let selectedPlace = null;
let searchTimeout = null;

function handlePlaceSearch(query) {
  clearTimeout(searchTimeout);
  selectedPlace = null;
  const dropdown = document.getElementById('placeDropdown');

  if (!query.trim() || query.length < 2) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  dropdown.innerHTML = '<li class="drop-loading">Searching…</li>';
  dropdown.classList.remove('hidden');

  searchTimeout = setTimeout(() => fetchPlaceSuggestions(query), 360);
}

async function fetchPlaceSuggestions(query) {
  const dropdown = document.getElementById('placeDropdown');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=7&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();

    if (!data.length) {
      dropdown.innerHTML = '<li class="drop-loading">No results found</li>';
      return;
    }

    dropdown.innerHTML = '';
    data.forEach(item => {
      const addr    = item.address || {};
      const city    = addr.city || addr.town || addr.village || addr.county || item.display_name.split(',')[0];
      const country = addr.country || '';
      const code    = (addr.country_code || '').toUpperCase();
      const flag    = getFlagEmoji(code);

      const li = document.createElement('li');
      li.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        <div>
          <span class="drop-place-name">${flag} ${city}</span>
          <span class="drop-place-country">${country}</span>
        </div>
      `;

      const placeObj = {
        name:    city,
        country: country,
        emoji:   flag,
        bg:      '#f1f4f9',
        alerts:  0,
        lat:     +item.lat,
        lng:     +item.lon,
        label:   `${flag} ${city}${country ? ', ' + country : ''}`,
      };

      li.addEventListener('click', () => selectPlace(placeObj));
      dropdown.appendChild(li);
    });
  } catch {
    dropdown.innerHTML = '<li class="drop-loading">Search failed — check connection</li>';
  }
}

function selectPlace(place) {
  selectedPlace = place;
  document.getElementById('placeSearchInput').value = place.label;
  document.getElementById('placeDropdown').classList.add('hidden');
}

function subscribeSelectedPlace() {
  const msg   = document.getElementById('subscribeMsg');
  const input = document.getElementById('placeSearchInput');
  const query = input.value.trim();

  if (!query) {
    showInlineMsg(msg, 'Please search and select a place first.', 'error');
    return;
  }

  const name = selectedPlace ? selectedPlace.name : query.split(',')[0].trim();

  if (subscribedPlaces.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    showInlineMsg(msg, `You are already subscribed to ${name}.`, 'error');
    return;
  }

  const newPlace = {
    id:      Date.now(),
    name:    name,
    country: selectedPlace?.country || '',
    emoji:   selectedPlace?.emoji   || '📍',
    bg:      '#f1f4f9',
    alerts:  0,
  };

  subscribedPlaces.push(newPlace);
  renderPlaces();
  input.value   = '';
  selectedPlace = null;
  showInlineMsg(msg, `Successfully subscribed to ${name}!`, 'success');
}

/* ── Country code → flag emoji ── */
function getFlagEmoji(code) {
  if (!code || code.length !== 2) return '📍';
  const offset = 127397;
  return String.fromCodePoint(...code.split('').map(c => c.charCodeAt(0) + offset));
}

/* ─────────────────────────────────────
   LEAFLET MAP
   ───────────────────────────────────── */
const alertData = [
  { type: 'traffic',  lat: 51.510, lng: -0.085, title: 'Heavy Traffic Jam',  desc: 'A40 Westbound — 40 min delay',        severity: 'High'   },
  { type: 'accident', lat: 51.497, lng: -0.105, title: 'Accident Reported',   desc: '2 vehicles — lane blocked',           severity: 'Medium' },
  { type: 'closure',  lat: 51.515, lng: -0.070, title: 'Road Closure',        desc: 'Waterloo Bridge — until 18:00',       severity: 'High'   },
  { type: 'climate',  lat: 51.503, lng: -0.120, title: 'Heavy Rain Warning',  desc: 'Reduced visibility, slow down',       severity: 'Low'    },
  { type: 'traffic',  lat: 51.522, lng: -0.095, title: 'Traffic Build-up',    desc: 'City Road — 15 min delay',            severity: 'Medium' },
  { type: 'closure',  lat: 51.488, lng: -0.095, title: 'Construction Zone',   desc: 'Vauxhall Bridge — 1 lane open',       severity: 'Medium' },
  { type: 'climate',  lat: 51.530, lng: -0.075, title: 'Fog Alert',           desc: 'Low visibility on A10 North',         severity: 'Low'    },
  { type: 'accident', lat: 51.480, lng: -0.110, title: 'Minor Collision',     desc: 'Clapham High St — cleared soon',      severity: 'Low'    },
];

const markerColors = { traffic: '#ef4444', accident: '#f97316', closure: '#f59e0b', climate: '#3b82f6' };
const typeLabels   = { traffic: 'Traffic Jam', accident: 'Accident', closure: 'Road Closure', climate: 'Climate Alert' };

function makeDashIcon(type) {
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker" style="background:${markerColors[type]}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function severityColor(s) {
  return s === 'High' ? '#ef4444' : s === 'Medium' ? '#f97316' : '#22c55e';
}

function initDashMap() {
  const dashMap = L.map('dash-map', {
    center: [51.505, -0.09],
    zoom: 12,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(dashMap);

  L.control.zoom({ position: 'bottomright' }).addTo(dashMap);

  alertData.forEach(a => {
    L.marker([a.lat, a.lng], { icon: makeDashIcon(a.type) })
      .bindPopup(`
        <span class="popup-badge" style="background:${markerColors[a.type]}">${typeLabels[a.type]}</span>
        <div class="popup-title">${a.title}</div>
        <div class="popup-body">${a.desc}</div>
        <div class="popup-body" style="margin-top:4px;font-weight:600;color:${severityColor(a.severity)}">
          Severity: ${a.severity}
        </div>
      `, { maxWidth: 200 })
      .addTo(dashMap);
  });
}

/* ─────────────────────────────────────
   TICKER
   ───────────────────────────────────── */
function initTicker() {
  const msgs = [
    '🔴 Heavy Traffic on A40 Westbound — 40 min delay  ·  ',
    '🟠 Accident cleared on Clapham High St  ·  ',
    '🟡 Road Closure: Waterloo Bridge until 18:00 — use alternative routes  ·  ',
    '🔵 Heavy Rain Warning in effect — reduce speed on A10 North  ·  ',
    '🟠 Construction work on Vauxhall Bridge — expect delays  ·  ',
    '🔴 Major congestion on City Road — 15 min delay  ·  ',
  ];
  document.getElementById('dashTickerText').textContent = msgs.join('');
}

/* ─────────────────────────────────────
   LOGOUT
   ───────────────────────────────────── */
function handleLogout() {
  sessionStorage.removeItem('jwt');
  localStorage.removeItem('jwt');
  localStorage.removeItem('userEmail');
  window.location.href = 'index.html';
}