import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { local, readJson } from './local-config.mjs';

let runtime, migration;
const checks = [];
const createdTables = new Set();
const table = `__infra_probe_${randomBytes(6).toString('hex')}`;
const denied = error => ['ER_TABLEACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(error.code);
try {
  const env = parseEnv(readFileSync(join(local, 'runtime.env'), 'utf8'));
  assert.equal(env.DB_HOST, '127.0.0.1');
  assert.equal(env.DB_PORT, '3306');
  assert.equal(env.DB_NAME, 'khoguard_demo');
  assert.equal(env.DB_USER, 'khoguard_runtime');
  assert.equal(env.DB_MIGRATION_USER, 'khoguard_migrate');
  const state = readJson(join(local, 'mysql-state.json'));
  assert.equal(state.status, 'complete');
  const options = { host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, connectTimeout: 5000 };
  runtime = await mysql.createConnection({ ...options, user: env.DB_USER, password: env.DB_PASSWORD });
  migration = await mysql.createConnection({ ...options, user: env.DB_MIGRATION_USER, password: env.DB_MIGRATION_PASSWORD });
  const [owner] = await runtime.execute("SELECT meta_value FROM infra_meta WHERE meta_key = 'setup_id'");
  const [server] = await runtime.query('SELECT @@server_uuid AS id');
  assert.equal(owner[0]?.meta_value, state.setup_id);
  assert.equal(server[0].id, state.server_uuid);
  checks.push('runtime connection and ownership marker verified');
  await runtime.beginTransaction();
  await runtime.execute('INSERT INTO infra_meta (meta_key, meta_value) VALUES (?, ?)', [table, 'first']);
  await runtime.execute('UPDATE infra_meta SET meta_value = ? WHERE meta_key = ?', ['second', table]);
  const [rows] = await runtime.execute('SELECT meta_value FROM infra_meta WHERE meta_key = ?', [table]);
  assert.equal(rows[0].meta_value, 'second');
  await runtime.execute('DELETE FROM infra_meta WHERE meta_key = ?', [table]);
  await runtime.rollback();
  const [remaining] = await runtime.execute('SELECT meta_key FROM infra_meta WHERE meta_key = ?', [table]);
  assert.equal(remaining.length, 0);
  checks.push('prepared SELECT/INSERT/UPDATE/DELETE and rollback verified');
  await migration.query(`CREATE TABLE \`${table}\` (id INT PRIMARY KEY) ENGINE=InnoDB`);
  createdTables.add(table);
  checks.push('migration account can create a table in the project schema');
  await assert.rejects(async () => {
    await runtime.query(`CREATE TABLE \`${table}_denied\` (id INT)`);
    createdTables.add(`${table}_denied`);
  }, denied);
  await assert.rejects(runtime.query(`DROP TABLE \`${table}\``), denied);
  checks.push('runtime CREATE/DROP denied');
  await assert.rejects(runtime.query('SELECT COUNT(*) FROM mysql.user'), denied);
  checks.push('runtime access to administration tables denied');
  await assert.rejects(migration.query('SELECT COUNT(*) FROM mysql.user'), denied);
  checks.push('migration access to administration tables denied');
  writeFileSync(join(local, 'mysql-check.json'), JSON.stringify({ date: new Date().toISOString(), schema: env.DB_NAME, checks }, null, 2) + '\n');
  console.log(`MySQL PASS: ${checks.length} checks — runtime DML, migration DDL, rollback and privilege separation.`);
} catch (error) {
  console.error(`MySQL check failed (${error.code ?? 'ASSERTION'}). Credentials and SQL are not logged.`);
  process.exitCode = 1;
} finally {
  if (runtime) { await runtime.rollback().catch(() => {}); await runtime.end(); }
  if (migration) {
    for (const created of createdTables) {
      await migration.query(`DROP TABLE IF EXISTS \`${created}\``).catch(() => { process.exitCode = 1; });
    }
    await migration.end();
  }
}
