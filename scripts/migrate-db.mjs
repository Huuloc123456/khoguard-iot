import mysql from 'mysql2/promise';
import { readConfig } from '../server/config.mjs';
import { loadOwnership } from '../server/database.mjs';
import { applyInventory } from '../db/migrate.mjs';

let connection;
try {
  const config = readConfig(process.env,{migration:true});
  const state = loadOwnership();
  connection = await mysql.createConnection(config.db);
  const result = await applyInventory(connection,state);
  console.log(`Inventory migration ${result.applied ? 'applied' : 'already complete'}; seed ${result.seeded ? 'created' : 'preserved'}. No reset or admin account used.`);
} catch (error) {
  console.error(`Migration failed (${error.code ?? 'CONFIG_OR_OWNERSHIP'})${error.code === 'CONFIG' ? `: ${error.message}` : ''}. No credentials/SQL logged; check configuration, ownership and schema_migrations before retry.`);
  process.exitCode = 1;
} finally { await connection?.end(); }
