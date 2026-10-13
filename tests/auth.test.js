import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, parseCookies, sessionCookie, clearedCookie, allowed, shiftAt, accessDecision, LoginLimiter, SESSION_TTL_MS } from '../server/auth.mjs';

test('passwords are salted scrypt hashes and verify in constant time', async () => {
  const a = await hashPassword('correct horse'), b = await hashPassword('correct horse');
  assert.match(a, /^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/);
  assert.notEqual(a, b, 'random salt');
  assert.equal(await verifyPassword('correct horse', a), true);
  assert.equal(await verifyPassword('wrong', a), false);
  assert.equal(await verifyPassword('x', 'plain-text'), false);
});

test('session cookie is HttpOnly, SameSite=Strict, bounded, and parsing ignores junk', () => {
  const cookie = sessionCookie('tok_123');
  assert.match(cookie, /^kg_session=tok_123; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800$/);
  assert.equal(SESSION_TTL_MS, 8 * 3600000);
  assert.match(clearedCookie(), /kg_session=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0/);
  assert.deepEqual(parseCookies('a=1; kg_session=abc; bad; =x'), { a: '1', kg_session: 'abc' });
  assert.deepEqual(parseCookies(undefined), {});
});

test('roles: viewer reads only, operator controls doors/alerts/reservations, admin also reads login audit', () => {
  for (const action of ['read', 'command', 'ack_alert', 'reserve', 'access_audit', 'auth_audit']) {
    assert.equal(allowed('viewer', action), action === 'read', `viewer ${action}`);
    assert.equal(allowed('operator', action), action !== 'auth_audit', `operator ${action}`);
    assert.equal(allowed('admin', action), true, `admin ${action}`);
  }
  assert.equal(allowed('guest', 'read'), false);
  assert.equal(allowed('admin', 'unknown'), false);
});

test('shift boundaries at 06:00 and 18:00 Vietnam time; night shift belongs to the date it started', () => {
  const at = local => shiftAt(new Date(`${local}+07:00`));
  assert.deepEqual(at('2026-10-13T05:59:59.999'), { code: 'NIGHT', date: '2026-10-12' });
  assert.deepEqual(at('2026-10-13T06:00:00.000'), { code: 'DAY', date: '2026-10-13' });
  assert.deepEqual(at('2026-10-13T17:59:59.999'), { code: 'DAY', date: '2026-10-13' });
  assert.deepEqual(at('2026-10-13T18:00:00.000'), { code: 'NIGHT', date: '2026-10-13' });
  assert.deepEqual(at('2026-10-14T00:30:00.000'), { code: 'NIGHT', date: '2026-10-13' });
  assert.deepEqual(at('2026-01-01T02:00:00.000'), { code: 'NIGHT', date: '2025-12-31' }, 'across year end');
});

test('access decision audits shift without ever overriding the edge or blocking exit', () => {
  const day = { card_id: 'DEMO-017', shift_code: 'DAY', active: true }, night = { card_id: 'DEMO-018', shift_code: 'NIGHT', active: true };
  const noon = shiftAt(new Date('2026-10-13T12:00:00+07:00'));
  assert.equal(accessDecision(day, 'accepted', 'in', noon), 'in_shift');
  assert.equal(accessDecision(night, 'accepted', 'in', noon), 'out_of_shift');
  assert.equal(accessDecision(night, 'accepted', 'out', noon), 'exit', 'leaving is always allowed and never flagged');
  assert.equal(accessDecision({ ...day, active: false }, 'accepted', 'in', noon), 'revoked_card');
  assert.equal(accessDecision(null, 'unauthorized', 'in', noon), 'edge_rejected');
  assert.equal(accessDecision(null, 'accepted', 'in', noon), 'unknown_card');
  assert.equal(accessDecision(day, 'duplicate', 'in', noon), 'duplicate');
  assert.equal(accessDecision({ ...night, shift_code: 'ANY' }, 'accepted', 'in', noon), 'in_shift');
});

test('login limiter locks a username for 60 s after 5 failures and resets on success', () => {
  const limiter = new LoginLimiter();
  let now = 1000;
  for (let i = 0; i < 5; i++) { assert.equal(limiter.blocked('op', now), false); limiter.fail('op', now); }
  assert.equal(limiter.blocked('op', now), true);
  assert.equal(limiter.blocked('other', now), false);
  now += 60000; assert.equal(limiter.blocked('op', now), false);
  limiter.fail('op', now); limiter.succeed('op'); assert.equal(limiter.failures('op'), 0);
});
