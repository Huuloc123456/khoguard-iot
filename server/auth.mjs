import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_TTL_MS = 8 * 3600000;
const COOKIE = 'kg_session';
const N = 16384, R = 8, P = 1, KEY = 64;
const derive = (password, salt) => new Promise((resolve, reject) =>
  scrypt(password, salt, KEY, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));

export async function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${(await derive(password, salt)).toString('base64url')}`;
}
export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== String(N) || parts[2] !== String(R) || parts[3] !== String(P)) return false;
  const expected = Buffer.from(parts[5], 'base64url');
  if (expected.length !== KEY || typeof password !== 'string') return false;
  return timingSafeEqual(await derive(password, Buffer.from(parts[4], 'base64url')), expected);
}

// No Secure flag: the demo is served over http://127.0.0.1 only (DEC-024). Must be added before any non-localhost use.
export const sessionCookie = token => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}`;
export const clearedCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim(), value = part.slice(at + 1).trim();
    if (name && !(name in out)) out[name] = value;
  }
  return out;
}
export const sessionToken = header => {
  const value = parseCookies(header)[COOKIE];
  return /^[A-Za-z0-9_-]{43}$/.test(value ?? '') ? value : null;
};
export const newToken = () => randomBytes(32).toString('base64url');

const PERMISSIONS = {
  viewer: ['read'],
  operator: ['read', 'command', 'ack_alert', 'reserve', 'access_audit'],
  admin: ['read', 'command', 'ack_alert', 'reserve', 'access_audit', 'auth_audit'],
};
export const permissionsOf = role => [...(PERMISSIONS[role] ?? [])];
export const allowed = (role, action) => PERMISSIONS[role]?.includes(action) ?? false;

// Shifts are fixed demo policy: DAY 06:00–18:00, NIGHT 18:00–06:00 Vietnam time (UTC+7, no DST); a night shift keeps its start date.
const OFFSET_MS = 7 * 3600000;
export function shiftAt(date) {
  const local = new Date(date.getTime() + OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour >= 6 && hour < 18) return { code: 'DAY', date: local.toISOString().slice(0, 10) };
  const start = hour < 6 ? new Date(local.getTime() - 86400000) : local;
  return { code: 'NIGHT', date: start.toISOString().slice(0, 10) };
}

// Audit only: the edge already decided entry; leaving and people-protection never depend on this result.
export function accessDecision(card, edgeResult, direction, shift) {
  if (edgeResult === 'unauthorized') return 'edge_rejected';
  if (edgeResult === 'duplicate') return 'duplicate';
  if (direction === 'out') return 'exit';
  if (!card) return 'unknown_card';
  if (!card.active) return 'revoked_card';
  return card.shift_code === 'ANY' || card.shift_code === shift.code ? 'in_shift' : 'out_of_shift';
}

export class LoginLimiter {
  #state = new Map();
  blocked(username, now = Date.now()) { const s = this.#state.get(username); return Boolean(s && s.until > now); }
  failures(username) { return this.#state.get(username)?.count ?? 0; }
  // Five wrong passwords lock that username for 60 s; the map is bounded so random usernames cannot grow memory.
  fail(username, now = Date.now()) {
    const s = this.#state.get(username) ?? { count: 0, until: 0 };
    s.count += 1;
    if (s.count >= 5) { s.count = 0; s.until = now + 60000; }
    this.#state.set(username, s);
    if (this.#state.size > 1000) this.#state.delete(this.#state.keys().next().value);
  }
  succeed(username) { this.#state.delete(username); }
}
