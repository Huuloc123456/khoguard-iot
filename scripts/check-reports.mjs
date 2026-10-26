import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import mqtt from 'mqtt';
import { root, local, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { brokerOptions } from '../server/mqtt.mjs';
import { signIn } from './check-session.mjs';
import { toCsv } from '../src/csv.js';
import { REPORT_COLUMNS, reportRows } from '../src/reports.js';
import { validateMqttMessage } from '../contracts/validate.js';

// M15: history filters match MySQL, survive a backend restart, and CSV export carries Vietnamese text but no secret.
// Starts and stops its own backend, so the normal backend must be stopped first.
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const accounts=readJson(join(local,'mosquitto/accounts.json'));
const checks=[];
let device,backend,stage='port free',operator,viewer;
const boot=`report-${randomUUID()}`,session=`s-${randomUUID()}`;
const topic=kind=>`khoguard/v1/WH01/devices/ESP-C01/${kind}`;
const envelope=(kind,n,payload,extra={})=>({schema_version:1,warehouse_id:'WH01',device_id:'ESP-C01',boot_id:boot,session_id:session,seq:n,kind,
  clock_synced:false,sent_at:null,uptime_ms:n*1000+500,...extra,payload:{zone_id:'C',...payload}});
const door=id=>({door_id:id,state:'closed',beam_clear:true,panic_latched:false,local_inputs_healthy:true,locked:true});
async function publish(m,retain=false) {const raw=JSON.stringify(m);assert.equal(validateMqttMessage(topic(m.kind),raw).ok,true);await device.publishAsync(topic(m.kind),raw,{qos:1,retain});}
async function until(read,accept,ms=10000) {const end=Date.now()+ms;let last;while (Date.now()<end) {try {last=await read();if (accept(last)) return last;} catch {} await delay(150);}throw new Error('CHECK_TIMEOUT');}
async function startBackend() {
  backend=spawn(process.execPath,['--env-file=.local/runtime.env','server/start.mjs'],{cwd:root,stdio:'ignore',windowsHide:true});
  await until(()=>fetch(`${base}/api/ready`).then(r=>r.status),s=>s===200,15000);
  operator=await signIn(base,'operator'); viewer=await signIn(base,'viewer');
}
async function stopBackend() {const exited=once(backend,'exit');backend.kill('SIGINT');await exited;backend=null;}
const report=async(path,cookie=operator)=>{const r=await fetch(`${base}${path}`,{headers:{cookie},signal:AbortSignal.timeout(5000)});return {status:r.status,body:await r.json()};};
async function walk(kind,qs) {
  // Page through with a small limit to prove cursor pagination neither skips nor repeats rows.
  let items=[],cursor=null;
  do {const r=await report(`/api/reports/${kind}?${qs}&limit=7${cursor ? `&cursor=${cursor}`:''}`);assert.equal(r.status,200);items=items.concat(r.body.items);cursor=r.body.next_cursor;} while (cursor);
  return items;
}
try {
  if (await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(1000)}).then(()=>true,()=>false)) throw Object.assign(new Error('stop the running backend first; this check restarts its own'),{code:'PORT_IN_USE'});
  await startBackend();
  device=mqtt.connect({...brokerOptions(config.mqtt),username:'ESP-C01',password:accounts['ESP-C01'],clientId:`kg-report-${randomUUID()}`,reconnectPeriod:0,clean:true});
  device.on('error',()=>{});await once(device,'connect',{signal:AbortSignal.timeout(5000)});

  stage='events filter matches what was stored';
  const from=new Date(Date.now()-1000).toISOString();
  await publish(envelope('status',0,{state:'online'}),true);
  await publish(envelope('telemetry',1,{controller_revision:1,environment:{temperature_c:-18.2,humidity_pct:55},occupancy:{current_occupants:0,count_verified:true,presence:false},doors:[door('D07'),door('D08')]}));
  const cards=[['DEMO-017','in'],['DEMO-017','out'],['DEMO-018','in'],['DEMO-018','out']];
  for (const [i,[card,direction]] of cards.entries()) await publish(envelope('events',i+1,{event_type:'rfid',door_id:'D07',card_id:card,direction,result:'accepted'},{event_id:`${boot}:${i+1}`}));
  await publish(envelope('events',5,{event_type:'door',door_id:'D08',state:'open'},{event_id:`${boot}:5`}));
  const to=new Date(Date.now()+60000).toISOString(), range=`from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const mine=list=>list.filter(e=>e.received_at>=from);
  const rfid=await until(async()=>mine(await walk('events',`${range}&zone=C&type=rfid`)),l=>l.length>=4);
  const [db]=await pool.execute("SELECT COUNT(*) AS n FROM device_events WHERE zone_id='C' AND device_id='ESP-C01' AND event_type='rfid' AND received_at >= ? AND received_at < ?",[from.slice(0,23).replace('T',' '),to.slice(0,23).replace('T',' ')]);
  assert.equal(rfid.length,Number(db[0].n),'API filter = SQL count');
  assert.deepEqual(rfid.slice(0,4).map(e=>[e.card_id,e.direction]).reverse(),cards);
  assert.equal(new Set(rfid.map(e=>e.id)).size,rfid.length,'no row repeated across pages');
  assert.ok(rfid.every((e,i)=>i===0 || e.id<rfid[i-1].id),'newest first');
  assert.equal((await report(`/api/reports/events?${range}&zone=A&type=rfid`)).status,400,'retired zone is rejected');
  assert.equal(mine((await report(`/api/reports/events?${range}&zone=C&type=door`)).body.items).length,1);
  checks.push(`events zone C + rfid in the test window: API ${rfid.length} rows = MySQL ${db[0].n}; 7-row pages, newest first, no repeats; retired zone A 400, type door 1 row`);

  stage='every dataset reachable with its permission';
  const day=`from=${encodeURIComponent(new Date(Date.now()-86400000).toISOString())}&to=${encodeURIComponent(to)}`;
  const counts={};
  for (const kind of ['alerts','commands','reservations','access']) {const r=await report(`/api/reports/${kind}?${day}&limit=500`);assert.equal(r.status,200,kind);counts[kind]=r.body.items.length;}
  assert.equal((await report(`/api/reports/access?${day}`,viewer)).status,403);
  assert.equal((await report(`/api/reports/events?${day}&zone=Z`)).status,400);
  const sql={alerts:"SELECT COUNT(*) AS n FROM alerts WHERE zone_id='C' AND device_id='ESP-C01' AND raised_at >= ? AND raised_at < ?",commands:"SELECT COUNT(*) AS n FROM door_commands t JOIN doors d ON d.id=t.door_id WHERE d.zone_id='C' AND t.door_id IN ('D07','D08') AND t.created_at >= ? AND t.created_at < ?",
    reservations:"SELECT COUNT(*) AS n FROM reservations t JOIN slots s ON s.id=t.slot_id WHERE s.zone_id='C' AND t.created_at >= ? AND t.created_at < ?",access:"SELECT COUNT(*) AS n FROM access_audit t JOIN doors d ON d.id=t.door_id WHERE d.zone_id='C' AND t.door_id IN ('D07','D08') AND t.at >= ? AND t.at < ?"};
  const window=[new Date(Date.now()-86400000),new Date(to)].map(d=>d.toISOString().slice(0,23).replace('T',' '));
  for (const [kind,q] of Object.entries(sql)) {const [r]=await pool.execute(q,window); assert.ok(counts[kind]===Math.min(500,Number(r[0].n)),kind);}
  checks.push(`last 24 h: alerts ${counts.alerts}, commands ${counts.commands}, reservations ${counts.reservations}, access ${counts.access} rows (each ≤500 = MySQL count); viewer refused the access log (403); bad zone 400`);

  stage='history survives a backend restart';
  const before=(await walk('events',`${range}&zone=C`)).map(e=>e.id);
  await stopBackend(); await startBackend();
  const after=(await walk('events',`${range}&zone=C`)).map(e=>e.id);
  assert.deepEqual(after,before);
  checks.push(`after backend restart the same ${after.length} zone-C rows come back in the same order`);

  stage='CSV export';
  const access=(await report(`/api/reports/access?${day}&limit=500`)).body.items;
  const csv=toCsv(REPORT_COLUMNS.access,reportRows('access',access))+toCsv(REPORT_COLUMNS.alerts,reportRows('alerts',(await report(`/api/reports/alerts?${day}&limit=500`)).body.items));
  assert.ok(csv.startsWith('﻿'));
  assert.match(csv,/Thẻ demo ca (ngày|đêm)/); assert.match(csv,/giờ Việt Nam/);
  // Every secret value from .local must be absent from the export.
  const secrets=[...Object.values(readJson(join(local,'dashboard-users.json'))),...Object.values(accounts),
    ...readFileSync(join(local,'runtime.env'),'utf8').split(/\r?\n/).filter(l=>/PASSWORD/.test(l)).map(l=>l.split('=').slice(1).join('='))].filter(v=>typeof v==='string' && v.length>0);
  assert.ok(secrets.length>=5);
  assert.ok(secrets.every(v=>!csv.includes(v)),'no configured credential value in CSV, including short demo values');
  assert.ok(!/kg_session|scrypt\$|token_hash|password/i.test(csv));
  checks.push(`CSV of ${access.length} access + alert rows: UTF-8 BOM, Vietnamese labels intact, none of ${secrets.length} local credential values or session/hash fields present`);

  await publish(envelope('status',0,{state:'offline'}),true);
  writeFileSync(join(local,'reports-check.json'),JSON.stringify({checked_at:new Date().toISOString(),checks},null,2));
  console.log(`M15 report checks passed: ${checks.length} groups.`);
  for (const c of checks) console.log(`- ${c}`);
} catch(error) {console.error(`M15 check failed at ${stage} (${error.code ?? error.name}: ${error.message}); secrets not printed.`);process.exitCode=1;}
finally {if (backend) await stopBackend().catch(()=>{}); await device?.endAsync(true); await pool.end();}
