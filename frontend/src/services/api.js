import { API_CONFIG } from '../config';

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

export async function loginUser(mobile, password, baseUrl = API_CONFIG.baseUrl) {
  const res = await fetch(`${baseUrl}${API_CONFIG.loginPath}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ mobile_number: mobile, password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function registerUser(name, email, mobile_number, password, baseUrl = API_CONFIG.baseUrl) {
  const res = await fetch(`${baseUrl}${API_CONFIG.registerPath}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ name, email, mobile_number, password }),
  });
  const data = await res.json().catch(() => ({}));
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
