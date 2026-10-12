import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { local, readJson, readAdminConfig, provisionSql } from './local-config.mjs';

const stateFile = join(local, 'mysql-state.json');
let admin;
try {
  if (existsSync(stateFile)) {
    const state = readJson(stateFile);
    if (state.status !== 'complete') throw new Error('Provisioning interrupted; inspect project marker before retry, no automatic deletion');
    const credentials = readJson(join(local, 'mysql-users.json'));
    const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'khoguard_runtime', password: credentials.runtime, database: 'khoguard_demo', connectTimeout: 5000 });
    try {
      const [rows] = await connection.execute("SELECT meta_value FROM infra_meta WHERE meta_key = 'setup_id'");
      const [server] = await connection.query('SELECT @@server_uuid AS id');
      if (rows[0]?.meta_value !== state.setup_id || server[0].id !== state.server_uuid) throw new Error('Project ownership marker mismatch');
      console.log('Existing KhoGuard schema verified; no accounts or grants changed.');
    } finally { await connection.end(); }
  } else {
    if (!existsSync(join(local, 'runtime.env'))) throw new Error('Run npm run infra:setup before database provisioning');
    const credentials = readAdminConfig(readFileSync(join(local, 'mysql-admin.env'), 'utf8'));
    admin = await mysql.createConnection({ host: '127.0.0.1', port: 3306, ...credentials, connectTimeout: 5000 });
    const [schemas] = await admin.execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = 'khoguard_demo'");
    const [users] = await admin.query("SELECT User, Host FROM mysql.user WHERE User IN ('khoguard_runtime', 'khoguard_migrate')");
    if (schemas.length || users.length) throw new Error('KhoGuard names already exist without our ownership marker; refusing to modify them');
    const [server] = await admin.query('SELECT @@server_uuid AS id, VERSION() AS version');
    const state = { status: 'creating', setup_id: randomUUID(), server_uuid: server[0].id, server_version: server[0].version };
    const generated = { runtime: randomBytes(24).toString('hex'), migration: randomBytes(24).toString('hex') };
    writeFileSync(join(local, 'mysql-users.json'), JSON.stringify(generated, null, 2) + '\n', { flag: 'wx' });
    writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
    for (const statement of provisionSql(generated.runtime, generated.migration).split(';').map(sql => sql.trim()).filter(Boolean)) {
      await admin.query(statement);
    }
    await admin.execute("INSERT INTO khoguard_demo.infra_meta (meta_key, meta_value) VALUES ('setup_id', ?)", [state.setup_id]);
    const runtimeFile = join(local, 'runtime.env');
    let env = readFileSync(runtimeFile, 'utf8');
    env = env.replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${generated.runtime}`)
      .replace(/^DB_MIGRATION_PASSWORD=.*$/m, `DB_MIGRATION_PASSWORD=${generated.migration}`);
    writeFileSync(runtimeFile, env);
    state.status = 'complete';
    writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
    console.log('Created khoguard_demo, ownership marker, runtime DML account and migration DDL account. No existing schema/account changed.');
  }
} catch (error) {
  const safeCode = /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'CONFIG';
  console.error(`MySQL provisioning failed (${safeCode}). ${error.code ? 'Check credentials and permissions; SQL and passwords are not logged.' : error.message}`);
  process.exitCode = 1;
} finally { if (admin) await admin.end(); }
