import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAcl, buildBrokerConfig, readAdminConfig, provisionSql } from '../scripts/local-config.mjs';

test('device ACL allows only its own outgoing messages and incoming commands', () => {
  const acl = buildAcl();
  const block = acl.split('user ESP-C01\n')[1].split('\nuser ')[0];
  assert.match(block, /topic write khoguard\/v1\/WH01\/devices\/ESP-C01\/telemetry/);
  assert.match(block, /topic read khoguard\/v1\/WH01\/devices\/ESP-C01\/commands/);
  assert.doesNotMatch(block, /devices\/\+|devices\/SIM|topic write .*\/commands/);
});

test('backend can receive telemetry and write commands but observer is read-only', () => {
  const acl = buildAcl();
  const backend = acl.split('user khoguard-backend\n')[1].split('\nuser ')[0];
  assert.match(backend, /topic read .*\/telemetry/);
  assert.match(backend, /topic write .*\/commands/);
  assert.doesNotMatch(backend, /topic write .*\/telemetry/);
  const observer = acl.split('user khoguard-observer\n')[1].split('\nuser ')[0];
  assert.doesNotMatch(observer, /topic write|topic readwrite/);
});

test('broker config binds only localhost and requires authentication', () => {
  const config = buildBrokerConfig('D:/demo/.local/mosquitto');
  assert.match(config, /listener 18884 127\.0\.0\.1/);
  assert.match(config, /allow_anonymous false/);
  assert.match(config, /password_file D:\/demo\/\.local\/mosquitto\/passwords/);
  assert.match(config, /acl_file D:\/demo\/\.local\/mosquitto\/acl/);
  assert.throws(() => buildBrokerConfig('D:/demo\nallow_anonymous true'));
});

test('missing admin credential is a configuration error and never defaults to a blank password', () => {
  assert.throws(() => readAdminConfig('MYSQL_ADMIN_USER=root\nMYSQL_ADMIN_PASSWORD=\n'), /MYSQL_ADMIN_PASSWORD/);
  assert.throws(() => readAdminConfig('MYSQL_ADMIN_PASSWORD=abc\n'), /MYSQL_ADMIN_USER/);
  assert.deepEqual(readAdminConfig('MYSQL_ADMIN_USER=admin\nMYSQL_ADMIN_PASSWORD="a#b!"\n'), { user: 'admin', password: 'a#b!' });
});

test('database provisioning scopes grants to KhoGuard and separates runtime from DDL', () => {
  const sql = provisionSql('a'.repeat(48), 'b'.repeat(48));
  assert.match(sql, /CREATE DATABASE `khoguard_demo`/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON `khoguard_demo`\.\* TO 'khoguard_runtime'@'localhost'/);
  assert.doesNotMatch(sql, /ON \*\.\*|GRANT ALL|GRANT OPTION|ALTER USER|DROP DATABASE/);
  assert.throws(() => provisionSql("'; DROP DATABASE other; --", 'b'.repeat(48)), /password/);
});
