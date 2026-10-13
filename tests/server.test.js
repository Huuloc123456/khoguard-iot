import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { readConfig } from '../server/config.mjs';
import { createApp } from '../server/http.mjs';

const env = { DB_HOST:'127.0.0.1', DB_PORT:'3306', DB_NAME:'khoguard_demo', DB_USER:'khoguard_runtime', DB_PASSWORD:'a'.repeat(48), DB_MIGRATION_USER:'khoguard_migrate', DB_MIGRATION_PASSWORD:'b'.repeat(48), MQTT_HOST:'127.0.0.1', MQTT_PORT:'18884', MQTT_USERNAME:'khoguard-backend', MQTT_PASSWORD:'c'.repeat(48) };
test('configuration fails closed without secrets and cannot select another schema/account or LAN bind', () => {
  const config = readConfig(env);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3001);
  assert.equal(config.db.user, 'khoguard_runtime');
  assert.equal('migrationPassword' in config.db, false);
  for (const [key,value] of Object.entries({DB_PASSWORD:'', MQTT_PASSWORD:'', DB_NAME:'mysql', DB_USER:'root', HTTP_HOST:'0.0.0.0', HTTP_PORT:'3x', DB_PORT:'65536', MQTT_PORT:'1883', MQTT_HOST:'example.com'})) {
    assert.throws(() => readConfig({...env,[key]:value}), new RegExp(key));
  }
  assert.equal(readConfig({...env,MQTT_PASSWORD:undefined,DB_PASSWORD:undefined},{migration:true}).db.user,'khoguard_migrate');
  assert.throws(() => readConfig({...env,DB_MIGRATION_PASSWORD:''},{migration:true}), /DB_MIGRATION_PASSWORD/);
});

async function withApp(t, readiness) {
  const server = createApp(readiness);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('health stays live while readiness reflects dependency loss and recovery', async t => {
  let database = false, mqtt = true;
  const base = await withApp(t, async()=>({database,mqtt}));
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok',service:'khoguard-backend'});
  assert.equal(health.headers.get('cache-control'),'no-store');
  assert.equal(health.headers.get('x-content-type-options'),'nosniff');
  let ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status,503);
  assert.deepEqual(await ready.json(),{status:'not_ready',dependencies:{database:'unavailable',mqtt:'connected'}});
  database = true;
  ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status,200);
  mqtt = false;
  assert.equal((await fetch(`${base}/api/ready`)).status,503);
});
test('readiness exceptions do not leak credentials and no mutation route is exposed', async t => {
  const base = await withApp(t,async()=>{throw new Error('password=private SQL SELECT');});
  const ready = await fetch(`${base}/api/ready`);
  assert.equal(ready.status,503);
  assert.doesNotMatch(await ready.text(),/password|private|SELECT/);
  assert.equal((await fetch(`${base}/api/health`,{method:'POST',body:'ignored'})).status,405);
  assert.equal((await fetch(`${base}/api/doors/D07/commands`,{method:'POST'})).status,404);
  assert.equal((await fetch(`${base}/api/health?unexpected=1`)).status,400);
  const invalidHostStatus = await new Promise((resolve,reject) => {
    get(`${base}/api/health`,{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);
  });
  assert.equal(invalidHostStatus,400);
});
