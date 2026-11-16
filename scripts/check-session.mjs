import { join } from 'node:path';
import { local, readJson } from './local-config.mjs';

// Integration checks sign in like the dashboard (M13); the password is read from protected .local and never printed.
let cookie = '';
export async function signIn(base, role = 'operator') {
  const password = readJson(join(local, 'dashboard-users.json'))[role];
  const response = await fetch(`${base}/api/auth/login`, { method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { origin: 'http://127.0.0.1:5173', 'content-type': 'application/json' }, body: JSON.stringify({ username: role, password }) });
  if (response.status !== 200) throw Object.assign(new Error(`sign-in as ${role} failed (${response.status}); run npm run auth:setup`), { code: 'SIGN_IN' });
  cookie = response.headers.get('set-cookie').split(';')[0];
  return cookie;
}
export const authFetch = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers ?? {}), cookie } });
// Polls read() until accept(value); read errors are retried and the last one is reported on timeout.
export async function until(read, accept, ms = 10000, label = '') {
  const end = Date.now() + ms; let error;
  while (Date.now() < end) {
    try { const value = await read(); if (accept(value)) return value; } catch (e) { error = e; }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`CHECK_TIMEOUT${label ? `: ${label}` : ''}${error ? ` (last error: ${error.message})` : ''}`, { cause: error });
}
