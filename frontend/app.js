/* ═══════════════════════════════════════════════
   AlertMap — app.js
   Handles: Leaflet map, JWT auth (login/register)
   ═══════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────
   MAP SETUP
   ──────────────────────────────────── */

const streetTile = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
);

const satelliteTile = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: 'Tiles © Esri', maxZoom: 19 }
);

const map = L.map('map', {
  center: [51.505, -0.09],
  zoom: 13,
  layers: [streetTile],
  zoomControl: false,
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

let currentLayer = 'street';
let trafficLayerVisible = false;

function toggleLayer() {
  if (currentLayer === 'street') {
    map.removeLayer(streetTile);
    satelliteTile.addTo(map);
    currentLayer = 'satellite';
  } else {
    map.removeLayer(satelliteTile);
    streetTile.addTo(map);
    currentLayer = 'street';
  }
}

/* ── Simulated alert markers ── */
const alertData = [
  { type: 'traffic',  lat: 51.510, lng: -0.085, title: 'Heavy Traffic Jam',        desc: 'A40 Westbound — 40 min delay', severity: 'High'   },
  { type: 'accident', lat: 51.497, lng: -0.105, title: 'Accident Reported',         desc: '2 vehicles — lane blocked', severity: 'Medium' },
  { type: 'closure',  lat: 51.515, lng: -0.070, title: 'Road Closure',              desc: 'Waterloo Bridge — until 18:00', severity: 'High'  },
  { type: 'climate',  lat: 51.503, lng: -0.120, title: 'Heavy Rain Warning',        desc: 'Reduced visibility, slow down', severity: 'Low'   },
  { type: 'traffic',  lat: 51.522, lng: -0.095, title: 'Traffic Build-up',          desc: 'City Road — 15 min delay', severity: 'Medium' },
  { type: 'closure',  lat: 51.488, lng: -0.095, title: 'Construction Zone',         desc: 'Vauxhall Bridge — 1 lane open', severity: 'Medium'},
  { type: 'climate',  lat: 51.530, lng: -0.075, title: 'Fog Alert',                 desc: 'Low visibility on A10 North', severity: 'Low'   },
  { type: 'accident', lat: 51.480, lng: -0.110, title: 'Minor Collision',           desc: 'Clapham High St — cleared soon', severity: 'Low'},
];

const markerColors = {
  traffic:  '#ef4444',
  accident: '#f97316',
  closure:  '#f59e0b',
  climate:  '#3b82f6',
};

const badgeColors = {
  traffic:  '#ef4444',
  accident: '#f97316',
  closure:  '#f59e0b',
  climate:  '#3b82f6',
};

const typeLabels = {
  traffic:  'Traffic Jam',
  accident: 'Accident',
  closure:  'Road Closure',
  climate:  'Climate Alert',
};

function makeIcon(type) {
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker marker-${type}" style="background:${markerColors[type]}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function severityClass(s) {
  return s === 'High' ? '#ef4444' : s === 'Medium' ? '#f97316' : '#22c55e';
}

const trafficMarkers = alertData.map(a => {
  const marker = L.marker([a.lat, a.lng], { icon: makeIcon(a.type) });
  marker.bindPopup(`
    <span class="popup-badge" style="background:${badgeColors[a.type]}">${typeLabels[a.type]}</span>
    <div class="popup-title">${a.title}</div>
    <div class="popup-body">${a.desc}</div>
    <div class="popup-body" style="margin-top:4px;font-weight:600;color:${severityClass(a.severity)}">
      Severity: ${a.severity}
    </div>
  `, { maxWidth: 200 });
  return marker;
});

const trafficLayerGroup = L.layerGroup(trafficMarkers).addTo(map);

function toggleTrafficLayer() {
  if (trafficLayerVisible) {
    map.removeLayer(trafficLayerGroup);
  } else {
    trafficLayerGroup.addTo(map);
  }
  trafficLayerVisible = !trafficLayerVisible;
}

/* ── Geo-locate user ── */
function goToMyLocation() {
  if (!navigator.geolocation) return showMapMsg('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.flyTo([lat, lng], 15, { duration: 1.4 });
      L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#4f6ef7',
        color: 'white',
        weight: 2.5,
        fillOpacity: 1,
      }).addTo(map).bindPopup('<div class="popup-title">You are here</div>').openPopup();
    },
    () => showMapMsg('Location access denied')
  );
}

function showMapMsg(msg) {
  // quick toast in corner
  const el = document.createElement('div');
  el.textContent = msg;
  Object.assign(el.style, {
    position: 'fixed', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(15,22,41,.85)', color: 'white', padding: '7px 18px',
    borderRadius: '99px', fontSize: '.8rem', zIndex: 9999,
    backdropFilter: 'blur(6px)',
  });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

/* ── Search ── */
async function searchLocation() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) return;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data.length) {
      const { lat, lon, display_name } = data[0];
      map.flyTo([+lat, +lon], 14, { duration: 1.4 });
      L.popup({ maxWidth: 280 })
        .setLatLng([+lat, +lon])
        .setContent(`<div class="popup-title">${display_name.split(',')[0]}</div><div class="popup-body">${display_name}</div>`)
        .openOn(map);
    } else {
      showMapMsg('No results found');
    }
  } catch {
    showMapMsg('Search failed — check connection');
  }
}

document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchLocation();
});

/* ── Alert ticker ── */
const tickerMessages = [
  '🔴 Heavy Traffic on A40 Westbound — 40 min delay  ·  ',
  '🟠 Accident cleared on Clapham High St  ·  ',
  '🟡 Road Closure: Waterloo Bridge until 18:00 — use alternative routes  ·  ',
  '🔵 Heavy Rain Warning in effect — reduce speed on A10 North  ·  ',
  '🟠 Construction work on Vauxhall Bridge — expect delays  ·  ',
  '🔴 Major congestion on City Road — 15 min delay  ·  ',
];
document.getElementById('tickerText').textContent = tickerMessages.join('');

/* ════════════════════════════════════
   AUTH — Tab switching
   ════════════════════════════════════ */

function switchTab(tab) {
  if (tab === 'register') {
    openRegisterModal();
    return;
  }
  const isLogin = tab === 'login';
  document.getElementById('loginForm').classList.toggle('hidden', !isLogin);
  document.getElementById('registerForm').classList.toggle('hidden', isLogin);
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabRegister').classList.toggle('active', false);
  clearMsg();
  hideTokenBox();
}

/* ════════════════════════════════════
   AUTH — Helpers
   ════════════════════════════════════ */

function getApiBase()        { return document.getElementById('apiBaseUrl').value.trim().replace(/\/$/, ''); }
function getLoginPath()      { return document.getElementById('apiLoginPath').value.trim(); }
function getRegisterPath()   { return document.getElementById('apiRegisterPath').value.trim(); }
function getTokenField()     { return document.getElementById('apiTokenField').value.trim() || 'access_token'; }
function getRequestFormat()  { return document.querySelector('input[name="reqFormat"]:checked').value; }

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  btn.querySelector('.btn-text').classList.toggle('hidden', loading);
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !loading);
  btn.disabled = loading;
}

function showMsg(text, type = 'error') {
  const el = document.getElementById('authMsg');
  el.textContent = text;
  el.className = `auth-msg ${type}`;
}

function clearMsg() {
  const el = document.getElementById('authMsg');
  el.textContent = '';
  el.className = 'auth-msg hidden';
}

function hideTokenBox() {
  document.getElementById('tokenBox').classList.add('hidden');
}

/* ════════════════════════════════════
   AUTH — Login
   ════════════════════════════════════ */

async function handleLogin(e) {
  e.preventDefault();
  clearMsg();
  setLoading('loginBtn', true);

  const mobile   = document.getElementById('loginMobile').value.trim();
  const password = document.getElementById('loginPassword').value;
  const format   = getRequestFormat();

  let body, headers = {};

  if (format === 'json') {
    body = JSON.stringify({ mobile, password });
    headers['Content-Type'] = 'application/json';
  } else {
    const fd = new FormData();
    fd.append('username', mobile);
    fd.append('password', password);
    body = fd;
  }

  try {
    const res = await fetch(`${getApiBase()}${getLoginPath()}`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail || data.message || data.error || `HTTP ${res.status}`;
      showMsg(`Login failed: ${detail}`);
    } else {
      const token = extractToken(data);
      if (token) {
        sessionStorage.setItem('jwt', token);
        showMsg('Signed in successfully!', 'success');
        showUserBadge(mobile);
        renderTokenBox(token);
        if (document.getElementById('rememberMe').checked) {
          localStorage.setItem('jwt', token);
          localStorage.setItem('userMobile', mobile);
        }
      } else {
        showMsg(`Login succeeded but token field "${getTokenField()}" not found in response.`);
        renderTokenBox(JSON.stringify(data, null, 2), true);
      }
    }
  } catch (err) {
    if (err.name === 'TypeError') {
      showMsg('Cannot reach API — check Base URL and CORS settings.');
    } else {
      showMsg(`Unexpected error: ${err.message}`);
    }
  } finally {
    setLoading('loginBtn', false);
  }
}

/* ════════════════════════════════════
   AUTH — Register
   ════════════════════════════════════ */

async function handleRegister(e) {
  e.preventDefault();
  clearMsg();

  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName  = document.getElementById('regLastName').value.trim();
  const email     = document.getElementById('regEmail').value.trim();
  const password  = document.getElementById('regPassword').value;
  const confirm   = document.getElementById('regConfirm').value;

  if (password !== confirm) {
    showMsg('Passwords do not match.');
    document.getElementById('regConfirm').classList.add('error');
    return;
  }
  document.getElementById('regConfirm').classList.remove('error');

  setLoading('registerBtn', true);

  const format = getRequestFormat();
  let body, headers = {};

  if (format === 'json') {
    body = JSON.stringify({ first_name: firstName, last_name: lastName, email, password });
    headers['Content-Type'] = 'application/json';
  } else {
    const fd = new FormData();
    fd.append('first_name', firstName);
    fd.append('last_name', lastName);
    fd.append('email', email);
    fd.append('password', password);
    body = fd;
  }

  try {
    const res = await fetch(`${getApiBase()}${getRegisterPath()}`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = data.detail || data.message || data.error || `HTTP ${res.status}`;
      showMsg(`Registration failed: ${detail}`);
    } else {
      const token = extractToken(data);
      showMsg('Account created! You can now sign in.', 'success');
      if (token) {
        sessionStorage.setItem('jwt', token);
        showUserBadge(email);
        renderTokenBox(token);
      } else {
        setTimeout(() => switchTab('login'), 1600);
      }
    }
  } catch (err) {
    if (err.name === 'TypeError') {
      showMsg('Cannot reach API — check Base URL and CORS settings.');
    } else {
      showMsg(`Unexpected error: ${err.message}`);
    }
  } finally {
    setLoading('registerBtn', false);
  }
}

/* ════════════════════════════════════
   JWT — helpers
   ════════════════════════════════════ */

function extractToken(data) {
  const field = getTokenField();
  if (data[field]) return data[field];
  // fallback common names
  for (const k of ['token', 'access_token', 'jwt', 'accessToken', 'id_token']) {
    if (data[k]) return data[k];
  }
  return null;
}

function decodeJwt(token) {
  try {
    const [h, p] = token.split('.');
    const decode = str => JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/')));
    return { header: decode(h), payload: decode(p) };
  } catch {
    return null;
  }
}

function renderTokenBox(token, raw = false) {
  const box = document.getElementById('tokenBox');
  const parts = document.getElementById('tokenParts');
  const decoded = document.getElementById('tokenDecoded');

  box.classList.remove('hidden');

  if (raw) {
    parts.innerHTML = `<span style="color:#4a5568">${escapeHtml(token)}</span>`;
    decoded.innerHTML = '';
    return;
  }

  const segments = token.split('.');
  if (segments.length === 3) {
    parts.innerHTML =
      `<span class="token-part-header">${escapeHtml(segments[0])}</span>` +
      `<span style="color:#8a94a6">.</span>` +
      `<span class="token-part-payload">${escapeHtml(segments[1])}</span>` +
      `<span style="color:#8a94a6">.</span>` +
      `<span class="token-part-sig">${escapeHtml(segments[2])}</span>`;

    const d = decodeJwt(token);
    if (d) {
      const expInfo = d.payload.exp
        ? `\n// expires: ${new Date(d.payload.exp * 1000).toLocaleString()}`
        : '';
      decoded.innerHTML = `<pre>${escapeHtml(JSON.stringify(d.payload, null, 2))}${expInfo}</pre>`;
    }
  } else {
    parts.innerHTML = `<span style="color:#4a5568">${escapeHtml(token)}</span>`;
    decoded.innerHTML = '';
  }
}

function copyToken() {
  const token = sessionStorage.getItem('jwt') || localStorage.getItem('jwt') || '';
  if (!token) return;
  navigator.clipboard.writeText(token).then(() => {
    const btn = document.querySelector('.copy-btn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ════════════════════════════════════
   User badge / logout
   ════════════════════════════════════ */

function showUserBadge(mobile) {
  document.getElementById('userBadge').classList.remove('hidden');
  document.getElementById('userEmailLabel').textContent = mobile;
  document.getElementById('avatarInitial').textContent = mobile.charAt(0).toUpperCase();
}

function logout() {
  sessionStorage.removeItem('jwt');
  localStorage.removeItem('jwt');
  localStorage.removeItem('userMobile');
  document.getElementById('userBadge').classList.add('hidden');
  hideTokenBox();
  clearMsg();
  document.getElementById('loginMobile').value = '';
  document.getElementById('loginPassword').value = '';
  switchTab('login');
}

/* ── Restore session on load ── */
(function restoreSession() {
  const token  = sessionStorage.getItem('jwt') || localStorage.getItem('jwt');
  const mobile = localStorage.getItem('userMobile');
  if (token && mobile) {
    showUserBadge(mobile);
    renderTokenBox(token);
    showMsg('Session restored — still signed in.', 'success');
  }
})();

/* ════════════════════════════════════
   Password strength meter
   ════════════════════════════════════ */

function calcPwStrength(val, fillId, labelId) {
  let score = 0;
  if (val.length >= 8)            score++;
  if (/[A-Z]/.test(val))          score++;
  if (/[0-9]/.test(val))          score++;
  if (/[^A-Za-z0-9]/.test(val))   score++;

  const fill   = document.getElementById(fillId);
  const label  = document.getElementById(labelId);
  const colors = ['', '#ef4444', '#f97316', '#f59e0b', '#22c55e'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  fill.style.width      = `${score * 25}%`;
  fill.style.background = colors[score] || '';
  label.textContent     = labels[score] || '';
  label.style.color     = colors[score] || '';
}

document.getElementById('regPassword').addEventListener('input', function () {
  calcPwStrength(this.value, 'pwStrengthFill', 'pwStrengthLabel');
});

document.getElementById('regModalPassword').addEventListener('input', function () {
  calcPwStrength(this.value, 'regModalPwStrengthFill', 'regModalPwStrengthLabel');
});

document.getElementById('regModalConfirm').addEventListener('input', function () {
  const mismatch = document.getElementById('regModalMismatchLabel');
  const match = this.value === document.getElementById('regModalPassword').value;
  mismatch.classList.toggle('hidden', match || this.value === '');
});

/* ════════════════════════════════════
   Toggle password visibility
   ════════════════════════════════════ */

function togglePassword(inputId, btn) {
  const inp = document.getElementById(inputId);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show
    ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

/* ════════════════════════════════════
   API Config accordion
   ════════════════════════════════════ */

function toggleApiConfig() {
  const body    = document.getElementById('apiConfigBody');
  const chevron = document.getElementById('apiChevron');
  const open    = body.classList.toggle('hidden');
  chevron.classList.toggle('open', !open);
}

/* ════════════════════════════════════
   REGISTER MODAL
   ════════════════════════════════════ */

function openRegisterModal() {
  document.getElementById('registerModal').classList.remove('hidden');
  document.getElementById('regModalName').focus();
}

function closeRegisterModal() {
  document.getElementById('registerModal').classList.add('hidden');
  document.getElementById('regModalForm').reset();
  switchTab('login');
}

function handleRegModalBackdrop(e) {
  if (e.target === document.getElementById('registerModal')) {
    closeRegisterModal();
  }
}

function handleRegisterModal(e) {
  e.preventDefault();

  const password = document.getElementById('regModalPassword').value;
  const confirm  = document.getElementById('regModalConfirm').value;
  const mismatch = document.getElementById('regModalMismatchLabel');

  if (password !== confirm) {
    mismatch.classList.remove('hidden');
    document.getElementById('regModalConfirm').focus();
    return;
  }
  mismatch.classList.add('hidden');

  const btn = document.getElementById('regModalBtn');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-spinner').classList.remove('hidden');
  btn.disabled = true;

  // Hardcoded success — replace with real API call when backend is ready
  setTimeout(() => {
    btn.querySelector('.btn-text').classList.remove('hidden');
    btn.querySelector('.btn-spinner').classList.add('hidden');
    btn.disabled = false;

    document.getElementById('registerModal').classList.add('hidden');
    document.getElementById('regModalForm').reset();
    document.getElementById('regModalPwStrengthFill').style.width = '';
    document.getElementById('regModalPwStrengthLabel').textContent = '';
    document.getElementById('regSuccessModal').classList.remove('hidden');
  }, 800);
}

function handleRegSuccessOk() {
  document.getElementById('regSuccessModal').classList.add('hidden');
  switchTab('login');
}