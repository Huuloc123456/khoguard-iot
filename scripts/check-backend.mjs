import assert from 'node:assert/strict';
import { createServer, connect } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { local } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createApp } from '../server/http.mjs';
import { createDbPool, loadOwnership, databaseReady } from '../server/database.mjs';
import { connectBroker } from '../server/mqtt.mjs';
import { applyInventory, inventoryMigration, verifyOwnership } from '../db/migrate.mjs';

// Test-only loopback gates disconnect our clients, leaving the real MySQL/Mosquitto services running.
async function gate(targetPort) {
  let blocked = false;
  const sockets = new Set();
  const server = createServer(incoming=>{
    if (blocked) return incoming.destroy();
    const outgoing = connect(targetPort,'127.0.0.1');
    for (const socket of [incoming,outgoing]) {
      sockets.add(socket);
      socket.on('error',()=>{incoming.destroy();outgoing.destroy();});
      socket.on('close',()=>{sockets.delete(socket);incoming.destroy();outgoing.destroy();});
    }
    incoming.pipe(outgoing).pipe(incoming);
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const setBlocked = value=>{blocked=value;if (value) for (const socket of sockets) socket.destroy();};
  return {port:server.address().port,setBlocked,stop:async()=>{setBlocked(true);await new Promise(resolve=>server.close(resolve));}};
}

let runtime,migration,pool,broker,app,dbGate,mqttGate;
let stage = 'configuration';
const checks = [];
try {
  const config = readConfig(process.env);
  const migrationConfig = readConfig(process.env,{migration:true});
  const state = loadOwnership();
  runtime = await mysql.createConnection(config.db);
  migration = await mysql.createConnection(migrationConfig.db);
  await verifyOwnership(runtime,state);
  stage = 'inventory';
  const [counts] = await runtime.query('SELECT (SELECT COUNT(*) FROM warehouses) AS warehouses, (SELECT COUNT(*) FROM zones) AS zones, (SELECT COUNT(*) FROM devices) AS devices, (SELECT COUNT(*) FROM doors) AS doors');
  assert.deepEqual(counts[0],{warehouses:1,zones:4,devices:5,doors:12});
  checks.push('registry seed: 1 warehouse, 4 zones, 5 devices, 12 doors');
  assert.deepEqual(await applyInventory(migration,state),{applied:false,seeded:false});
  checks.push('migration rerun is a no-op');

  stage = 'migration guards';
  for (const [column,value,pattern] of [['status','applying',/incomplete/],['checksum','0'.repeat(64),/checksum/]]) {
    await migration.beginTransaction();
    try {
      await migration.execute(`UPDATE schema_migrations SET ${column} = ? WHERE version = ?`,[value,inventoryMigration.version]);
      await assert.rejects(applyInventory(migration,state),pattern);
    } finally { await migration.rollback(); }
  }
  checks.push('incomplete and changed-checksum migration refused; original journal restored by rollback');
  const [heldLock] = await runtime.execute('SELECT GET_LOCK(?, 0) AS acquired',['khoguard_demo:migrations']);
  assert.equal(heldLock[0].acquired,1,'Test could not acquire its migration lock');
  try { await assert.rejects(applyInventory(migration,state),/Another migration/); }
  finally { await runtime.execute('SELECT RELEASE_LOCK(?)',['khoguard_demo:migrations']); }
  checks.push('concurrent migration lock refused');
  await migration.beginTransaction();
  try {
    const literal = "Kho thử ' — dữ liệu giữ nguyên";
    await migration.execute('UPDATE zones SET name = ? WHERE id = ?',[literal,'C']);
    assert.deepEqual(await applyInventory(migration,state),{applied:false,seeded:false});
    const [rows] = await migration.execute('SELECT name FROM zones WHERE id = ?',['C']);
    assert.equal(rows[0].name,literal);
  } finally { await migration.rollback(); }
  checks.push('seed rerun preserves existing names; prepared UTF-8 value round-trips');
  await runtime.beginTransaction();
  try { await assert.rejects(runtime.execute('UPDATE doors SET device_id = ? WHERE id = ?',['SIM-A01','D07']),error=>error.code==='ER_NO_REFERENCED_ROW_2'); }
  finally { await runtime.rollback(); }
  checks.push('foreign key refuses a door owner from another zone');

  stage = 'production HTTP';
  const production = `http://${config.host}:${config.port}`;
  assert.equal((await fetch(`${production}/api/health`,{signal:AbortSignal.timeout(5000)})).status,200);
  const productionReady = await fetch(`${production}/api/ready`,{signal:AbortSignal.timeout(5000)});
  assert.equal(productionReady.status,200);
  assert.deepEqual(await productionReady.json(),{status:'ready',dependencies:{database:'ready',mqtt:'connected'}});
  checks.push('running backend health and DB/MQTT readiness 200');

  stage = 'live disconnect/recovery';
  dbGate = await gate(config.db.port);
  mqttGate = await gate(config.mqtt.port);
  pool = createDbPool({...config.db,port:dbGate.port});
  broker = connectBroker({...config.mqtt,port:mqttGate.port});
  app = createApp(async()=>({database:await databaseReady(pool,state),mqtt:broker.connected}));
  app.listen(0,'127.0.0.1');
  await once(app,'listening');
  const base = `http://127.0.0.1:${app.address().port}`;
  async function expectReady(status,database,mqtt) {
    const deadline = Date.now()+6000;
    do {
      const response = await fetch(`${base}/api/ready`,{signal:AbortSignal.timeout(5000)});
      const value = await response.json();
      if (response.status===status && value.dependencies.database===database && value.dependencies.mqtt===mqtt) return;
      await delay(100);
    } while (Date.now()<deadline);
    assert.fail('Dependency readiness did not reach the expected state');
  }
  await expectReady(200,'ready','connected');
  dbGate.setBlocked(true);
  await expectReady(503,'unavailable','connected');
  assert.equal((await fetch(`${base}/api/health`)).status,200);
  dbGate.setBlocked(false);
  await expectReady(200,'ready','connected');
  checks.push('real MySQL transport loss: ready 503, health 200, pool reconnects to ready 200');
  mqttGate.setBlocked(true);
  await expectReady(503,'ready','disconnected');
  assert.equal((await fetch(`${base}/api/health`)).status,200);
  mqttGate.setBlocked(false);
  await expectReady(200,'ready','connected');
  checks.push('real MQTT transport loss: ready 503, health 200, broker reconnects to ready 200');

  writeFileSync(join(local,'backend-check.json'),JSON.stringify({checked_at:new Date().toISOString(),schema:'khoguard_demo',inventory:counts[0],checks},null,2)+'\n');
  console.log(`Backend PASS: ${checks.length} checks, seed/idempotency/guards/FK and live DB/MQTT disconnect-recovery; no shared service stopped.`);
} catch (error) {
  console.error(`Backend check FAIL at ${stage} (${error.code ?? 'ASSERTION'}); no credentials or SQL printed.`);
  process.exitCode = 1;
} finally {
  if (app) { app.closeAllConnections(); await new Promise(resolve=>app.close(resolve)); }
  await broker?.endAsync(true);
  await pool?.end();
  await mqttGate?.stop();
  await dbGate?.stop();
  if (runtime) { await runtime.rollback().catch(()=>{}); await runtime.end(); }
  if (migration) { await migration.rollback().catch(()=>{}); await migration.end(); }
}
