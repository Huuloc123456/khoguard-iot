import { existsSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { hashPassword, verifyPassword } from '../server/auth.mjs';

// M13: three demo dashboard accounts; passwords live only in protected .local/dashboard-users.json, the DB keeps scrypt hashes.
const DEMO_USERS = [['viewer', 'viewer'], ['operator', 'operator'], ['admin', 'admin']];
const file = join(local, 'dashboard-users.json');
let pool;
try {
  if (!existsSync(local) || lstatSync(local).isSymbolicLink()) throw new Error('Run infra:setup first');
  if (!existsSync(file)) {
    const users = Object.fromEntries(DEMO_USERS.map(([name]) => [name, randomBytes(12).toString('base64url')]));
    writeFileSync(file, JSON.stringify(users, null, 2) + '\n', { flag: 'wx' });
  }
  const users = readJson(file);
  if (DEMO_USERS.some(([name]) => typeof users[name] !== 'string' || users[name].length < 12)) throw new Error('dashboard-users.json is incomplete; fix it, do not overwrite');
  pool = createDbPool(readConfig(process.env).db);
  for (const [username, role] of DEMO_USERS) {
    const [rows] = await pool.execute('SELECT id,password_hash FROM users WHERE username = ?', [username]);
    if (!rows.length) await pool.execute('INSERT INTO users (username,role,password_hash,active,created_at) VALUES (?,?,?,TRUE,UTC_TIMESTAMP(3))', [username, role, await hashPassword(users[username])]);
    else if (!await verifyPassword(users[username], rows[0].password_hash)) {
      // The local file is the source of truth; changing it rotates the password and revokes that user's sessions.
      await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(users[username]), rows[0].id]);
      await pool.execute('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND revoked_at IS NULL', [rows[0].id]);
    }
  }
  console.log('Dashboard accounts ready: viewer, operator, admin. Passwords are in .local/dashboard-users.json (not printed).');
} catch (error) {
  console.error(`Account setup failed (${error.code ?? error.message}); no password printed.`);
  process.exitCode = 1;
} finally { await pool?.end(); }
