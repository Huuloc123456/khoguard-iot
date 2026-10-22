import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registry } from '../scripts/local-config.mjs';

const text = path => readFileSync(new URL(path,import.meta.url),'utf8').replaceAll('\r\n','\n');
const hash = value => createHash('sha256').update(value).digest('hex');
export const inventoryMigration = { version:'001_inventory', sql:text('./migrations/001_inventory.sql') };
inventoryMigration.checksum = hash(inventoryMigration.sql);
export const telemetryMigration = {version:'002_telemetry',sql:text('./migrations/002_telemetry.sql')};
telemetryMigration.checksum = hash(telemetryMigration.sql);
export const eventsMigration = {version:'003_events',sql:text('./migrations/003_events.sql')};
eventsMigration.checksum = hash(eventsMigration.sql);
export const controlMigration = {version:'004_control',sql:text('./migrations/004_control.sql')};
controlMigration.checksum = hash(controlMigration.sql);
export const accessMigration = {version:'005_access',sql:text('./migrations/005_access.sql')};
accessMigration.checksum = hash(accessMigration.sql);
export const reservationMigration = {version:'006_reservations',sql:text('./migrations/006_reservations.sql')};
reservationMigration.checksum = hash(reservationMigration.sql);
export const deviceSourcesMigration = {version:'007_device_sources',sql:text('./migrations/007_device_sources.sql')};
deviceSourcesMigration.checksum = hash(deviceSourcesMigration.sql);
// The inventory seed checksum is tied to the registry as first seeded. 007_device_sources later moved zones A/B/D to
// Wokwi and marked ESP-C01 as the only door controller; undo exactly that to recover the seeded registry.
const V1_SOURCES = {'SIM-A01':'node-simulator','SIM-B01':'node-simulator','SIM-D01':'node-simulator'};
const seededRegistry = {...registry,devices:registry.devices.map(({door_control,...device})=>V1_SOURCES[device.id] ? {...device,source:V1_SOURCES[device.id]} : device)};
const seedText = text('./seeds/inventory.json');
const labels = JSON.parse(seedText);
export const seedChecksum = hash(JSON.stringify(seededRegistry)+seedText);
export const inventorySeed = {
  warehouse:{id:registry.warehouse_id,name:labels.warehouse_name},
  zones:registry.zones.map(id=>({id,warehouse_id:registry.warehouse_id,name:labels.zone_names[id]})),
  devices:registry.devices,
  doors:registry.devices.flatMap(device=>device.doors.map(id=>({id,zone_id:device.zone_id,device_id:device.id}))),
};
const tables = ['warehouses','zones','devices','doors'];

export function migrationAction(row,checksum) {
  if (!row) return 'apply';
  if (row.status !== 'complete') throw new Error('Migration incomplete; inspect owned tables before retry, no automatic reset');
  if (row.checksum !== checksum) throw new Error('Migration checksum changed; add a new migration instead of editing applied SQL');
  return 'skip';
}

export async function verifyOwnership(connection,state) {
  const [rows] = await connection.execute("SELECT @@server_uuid AS server_uuid, (SELECT meta_value FROM infra_meta WHERE meta_key = ?) AS setup_id",['setup_id']);
  assert.equal(rows[0]?.server_uuid,state.server_uuid,'Database instance ownership mismatch');
  assert.equal(rows[0]?.setup_id,state.setup_id,'Database setup ownership mismatch');
}

export async function applyInventory(connection,state) {
  await verifyOwnership(connection,state);
  const lockName = 'khoguard_demo:migrations';
  const [locks] = await connection.execute('SELECT GET_LOCK(?, 0) AS acquired',[lockName]);
  assert.equal(locks[0].acquired,1,'Another migration is running');
  try {
    const [existing] = await connection.execute('SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?, ?, ?)',[...tables,'schema_migrations']);
    const names = existing.map(row=>row.name.toLowerCase());
    if (!names.includes('schema_migrations')) {
      assert.ok(!tables.some(name=>names.includes(name)),'Domain table collision without migration ownership; refusing changes');
      await connection.query("CREATE TABLE schema_migrations (version VARCHAR(64) PRIMARY KEY, checksum CHAR(64) NOT NULL, status ENUM('applying','complete') NOT NULL, applied_at TIMESTAMP NULL) ENGINE=InnoDB");
    }
    const [rows] = await connection.execute('SELECT checksum, status FROM schema_migrations WHERE version = ?',[inventoryMigration.version]);
    const applied = migrationAction(rows[0],inventoryMigration.checksum) === 'apply';
    if (applied) {
      assert.ok(!tables.some(name=>names.includes(name)),'Domain table collision before migration; refusing changes');
      // MySQL DDL commits implicitly; journal unfinished work rather than claiming an atomic rollback.
      await connection.execute('INSERT INTO schema_migrations (version, checksum, status) VALUES (?, ?, ?)',[inventoryMigration.version,inventoryMigration.checksum,'applying']);
      for (const statement of inventoryMigration.sql.split(';').map(sql=>sql.trim()).filter(Boolean)) await connection.query(statement);
      await connection.execute('UPDATE schema_migrations SET status = ?, applied_at = CURRENT_TIMESTAMP WHERE version = ?',['complete',inventoryMigration.version]);
    }
    const [seed] = await connection.execute('SELECT meta_value FROM infra_meta WHERE meta_key = ?',['seed_registry_v1']);
    if (seed.length) {
      assert.equal(seed[0].meta_value,seedChecksum,'Seed checksum changed; use a new migration, do not overwrite inventory');
      return {applied,seeded:false};
    }
    for (const table of tables) {
      const [count] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
      assert.equal(count[0].total,0,'Seed collision; refusing to reset existing inventory');
    }
    await connection.beginTransaction();
    try {
      await connection.execute('INSERT INTO warehouses (id, name) VALUES (?, ?)',[inventorySeed.warehouse.id,inventorySeed.warehouse.name]);
      for (const zone of inventorySeed.zones) await connection.execute('INSERT INTO zones (id, warehouse_id, name) VALUES (?, ?, ?)',[zone.id,zone.warehouse_id,zone.name]);
      for (const device of inventorySeed.devices) await connection.execute('INSERT INTO devices (id, zone_id, source, measures_environment, measures_occupancy) VALUES (?, ?, ?, ?, ?)',[device.id,device.zone_id,device.source,device.environment,device.occupancy]);
      for (const door of inventorySeed.doors) await connection.execute('INSERT INTO doors (id, zone_id, device_id) VALUES (?, ?, ?)',[door.id,door.zone_id,door.device_id]);
      await connection.execute('INSERT INTO infra_meta (meta_key, meta_value) VALUES (?, ?)',['seed_registry_v1',seedChecksum]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    return {applied,seeded:true};
  } finally { await connection.execute('SELECT RELEASE_LOCK(?)',[lockName]).catch(()=>{}); }
}

export async function applyTelemetry(connection,state) {
  await verifyOwnership(connection,state);
  const lockName='khoguard_demo:migrations';
  const [locks]=await connection.execute('SELECT GET_LOCK(?, 0) AS acquired',[lockName]);
  assert.equal(locks[0].acquired,1,'Another migration is running');
  try {
    const [base]=await connection.execute('SELECT checksum, status FROM schema_migrations WHERE version = ?',[inventoryMigration.version]);
    assert.equal(migrationAction(base[0],inventoryMigration.checksum),'skip','Apply inventory first');
    const [rows]=await connection.execute('SELECT checksum, status FROM schema_migrations WHERE version = ?',[telemetryMigration.version]);
    if (migrationAction(rows[0],telemetryMigration.checksum)==='skip') return {applied:false};
    const names=['zone_settings','warehouse_stream','device_sessions','device_current','telemetry'];
    const [existing]=await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?, ?, ?, ?, ?)',names);
    assert.equal(existing.length,0,'M05 table collision; refusing changes');
    await connection.execute('INSERT INTO schema_migrations (version, checksum, status) VALUES (?, ?, ?)',[telemetryMigration.version,telemetryMigration.checksum,'applying']);
    for (const statement of telemetryMigration.sql.split(';').map(sql=>sql.trim()).filter(Boolean)) await connection.query(statement);
    await connection.execute('UPDATE schema_migrations SET status = ?, applied_at = CURRENT_TIMESTAMP WHERE version = ?',['complete',telemetryMigration.version]);
    return {applied:true};
  } finally { await connection.execute('SELECT RELEASE_LOCK(?)',[lockName]).catch(()=>{}); }
}

async function applyAfter(connection,state,previous,migration,tables) {
  await verifyOwnership(connection,state);
  const lockName='khoguard_demo:migrations';
  const [locks]=await connection.execute('SELECT GET_LOCK(?, 0) AS acquired',[lockName]);
  assert.equal(locks[0].acquired,1,'Another migration is running');
  try {
    const [base]=await connection.execute('SELECT checksum, status FROM schema_migrations WHERE version = ?',[previous.version]);
    assert.equal(migrationAction(base[0],previous.checksum),'skip',`Apply ${previous.version} first`);
    const [rows]=await connection.execute('SELECT checksum, status FROM schema_migrations WHERE version = ?',[migration.version]);
    if (migrationAction(rows[0],migration.checksum)==='skip') return {applied:false};
    if (tables.length) {
      const [existing]=await connection.execute(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${tables.map(()=>'?').join(', ')})`,tables);
      assert.equal(existing.length,0,`${migration.version} table collision; refusing changes`);
    }
    await connection.execute('INSERT INTO schema_migrations (version, checksum, status) VALUES (?, ?, ?)',[migration.version,migration.checksum,'applying']);
    for (const statement of migration.sql.split(';').map(sql=>sql.trim()).filter(Boolean)) await connection.query(statement);
    await connection.execute('UPDATE schema_migrations SET status = ?, applied_at = CURRENT_TIMESTAMP WHERE version = ?',['complete',migration.version]);
    return {applied:true};
  } finally { await connection.execute('SELECT RELEASE_LOCK(?)',[lockName]).catch(()=>{}); }
}

export const applyEvents = (connection,state) => applyAfter(connection,state,telemetryMigration,eventsMigration,['device_events','event_gaps']);
export const applyControl = (connection,state) => applyAfter(connection,state,eventsMigration,controlMigration,['door_commands','alerts','alert_acks']);
export const applyAccess = (connection,state) => applyAfter(connection,state,controlMigration,accessMigration,['users','user_sessions','auth_audit','access_cards','access_audit']);
export const applyReservations = (connection,state) => applyAfter(connection,state,accessMigration,reservationMigration,['slots','reservations']);
export const applyDeviceSources = (connection,state) => applyAfter(connection,state,reservationMigration,deviceSourcesMigration,[]);
