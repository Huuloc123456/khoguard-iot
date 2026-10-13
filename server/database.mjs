import mysql from 'mysql2/promise';
import { join } from 'node:path';
import { local, readJson } from '../scripts/local-config.mjs';
import { inventoryMigration, telemetryMigration, seedChecksum } from '../db/migrate.mjs';

export function loadOwnership() {
  const state = readJson(join(local,'mysql-state.json'));
  if (state.status !== 'complete' || !/^[a-f0-9-]{36}$/.test(state.setup_id ?? '') || !/^[a-f0-9-]{36}$/.test(state.server_uuid ?? '')) throw new Error('Database ownership state invalid; run infra:db:init');
  return state;
}
export const createDbPool = options => mysql.createPool({...options,connectionLimit:4,waitForConnections:false,maxIdle:4,idleTimeout:60000,enableKeepAlive:true});

export async function databaseReady(pool,state) {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query({sql:`SELECT @@server_uuid AS server_uuid,
      (SELECT meta_value FROM infra_meta WHERE meta_key = ?) AS setup_id,
      (SELECT checksum FROM schema_migrations WHERE version = ? AND status = 'complete') AS checksum,
      (SELECT meta_value FROM infra_meta WHERE meta_key = ?) AS seed_checksum,
      (SELECT checksum FROM schema_migrations WHERE version = ? AND status = 'complete') AS telemetry_checksum`,timeout:1500},['setup_id',inventoryMigration.version,'seed_registry_v1',telemetryMigration.version]);
    return rows[0]?.server_uuid === state.server_uuid && rows[0]?.setup_id === state.setup_id
      && rows[0]?.checksum === inventoryMigration.checksum && rows[0]?.seed_checksum === seedChecksum
      && rows[0]?.telemetry_checksum === telemetryMigration.checksum;
  } catch { connection?.destroy(); return false; }
  finally { connection?.release(); }
}
