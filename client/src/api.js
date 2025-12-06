// client/src/api.js

let authToken = null;

// Store token
export function setAuthToken(token) {
  authToken = token;
  if (token) localStorage.setItem('lab4_token', token);
  else localStorage.removeItem('lab4_token');
}

// Retrieve token
export function getAuthToken() {
  if (authToken) return authToken;
  const stored = localStorage.getItem('lab4_token');
  authToken = stored || null;
  return authToken;
}

// Clear token
export function clearAuthToken() {
  authToken = null;
  localStorage.removeItem('lab4_token');
}

// Decode JWT payload (no verification)
export function decodeJwt(token) {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Core API request wrapper
export async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getAuthToken();

  // Attach JWT except for open endpoints
  if (token && !path.startsWith('/api/open/')) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers
  });

  const isJson = res.headers.get('content-type')?.includes('json');
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof body === 'object' && body?.error ? body.error : body;
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return body;
}
