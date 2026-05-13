import { API_CONFIG, ALERTS_API } from '../config';

const TOKEN_KEY = 'jwt';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
}

function buildHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function loginUser(mobile, password, baseUrl = API_CONFIG.baseUrl) {
  console.log(`[API] loginUser → POST ${baseUrl}${API_CONFIG.loginPath} mobile=${mobile}`);
  const res = await fetch(`${baseUrl}${API_CONFIG.loginPath}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ mobile_number: mobile, password }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] loginUser ← status=${res.status} ok=${res.ok}`);
  return { ok: res.ok, status: res.status, data };
}

export async function registerUser(name, email, mobile_number, password, baseUrl = API_CONFIG.baseUrl) {
  console.log(`[API] registerUser → POST ${baseUrl}${API_CONFIG.registerPath} mobile=${mobile_number}`);
  const res = await fetch(`${baseUrl}${API_CONFIG.registerPath}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ name, email, mobile_number, password }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] registerUser ← status=${res.status} ok=${res.ok}`);
  return { ok: res.ok, status: res.status, data };
}

export function extractToken(data) {
  const candidates = [
    API_CONFIG.tokenField,
    'token',
    'access_token',
    'jwt',
    'accessToken',
    'id_token',
  ];
  for (const k of candidates) {
    if (data[k]) return data[k];
  }
  return null;
}

export function decodeJwt(token) {
  try {
    const [h, p] = token.split('.');
    const decode = (str) =>
      JSON.parse(atob(str.replace(/-/g, '+').replace(/_/g, '/')));
    return { header: decode(h), payload: decode(p) };
  } catch {
    return null;
  }
}

// ── Subscription / User APIs (api_server @ port 5051) ──────────────────────

const API_BASE = ALERTS_API.baseUrl;

export async function fetchUser(mobileNumber) {
  const url = `${API_BASE}${ALERTS_API.getUserPath}?mobile_number=${encodeURIComponent(mobileNumber)}`;
  console.log(`[API] fetchUser → GET ${url}`);
  const res = await fetch(url, { headers: buildHeaders() });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] fetchUser ← status=${res.status} name=${data.user?.name}`);
  return { ok: res.ok, status: res.status, data };
}

export async function fetchSubscriptions(mobileNumber) {
  const url = `${API_BASE}${ALERTS_API.getSubscriptionsPath}?mobile_number=${encodeURIComponent(mobileNumber)}`;
  console.log(`[API] fetchSubscriptions → GET ${url}`);
  const res = await fetch(url, { headers: buildHeaders() });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] fetchSubscriptions ← status=${res.status} count=${data.count}`);
  return { ok: res.ok, status: res.status, data };
}

export async function addSubscription(mobileNumber, latitude, longitude, distance = 50) {
  const url = `${API_BASE}${ALERTS_API.addSubscriptionPath}`;
  console.log(`[API] addSubscription → POST ${url} mobile=${mobileNumber} lat=${latitude} lon=${longitude} dist=${distance}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ mobile_number: mobileNumber, latitude, longitude, distance }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] addSubscription ← status=${res.status} ok=${res.ok}`);
  return { ok: res.ok, status: res.status, data };
}

export async function deleteSubscription(mobileNumber, latitude, longitude) {
  const url = `${API_BASE}${ALERTS_API.deleteSubscriptionPath}`;
  console.log(`[API] deleteSubscription → DELETE ${url} mobile=${mobileNumber} lat=${latitude} lon=${longitude}`);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: buildHeaders(),
    body: JSON.stringify({ mobile_number: mobileNumber, latitude, longitude }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] deleteSubscription ← status=${res.status} ok=${res.ok}`);
  return { ok: res.ok, status: res.status, data };
}

export async function triggerDummyTest(latitude, longitude) {
  const url = `${API_BASE}${ALERTS_API.dummyTestPath}`;
  console.log(`[API] triggerDummyTest → POST ${url} lat=${latitude} lon=${longitude}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ latitude, longitude }),
  });
  const data = await res.json().catch(() => ({}));
  console.log(`[API] triggerDummyTest ← status=${res.status} ok=${res.ok}`);
  return { ok: res.ok, status: res.status, data };
}
