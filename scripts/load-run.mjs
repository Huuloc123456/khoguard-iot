// Named load-run (not *-test.mjs) so `node --test` does not pick it up as a unit test.
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { root, local } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { createDbPool } from '../server/database.mjs';
import { signIn } from './check-session.mjs';
import { SimDevice, ZONE_TEMPERATURE } from './sim-lib.mjs';

// M16 load test (Agent.md T27). The broker/ACL know 5 devices, so "50 nodes" are 50 virtual senders multiplexed
// onto the 5 registered device accounts (10 each): the same message rate (25 msg/s), not 50 separate identities.
// Starts its own backend (stop the normal one and Wokwi ESP-C01 first). Usage: npm run load:test -- --nodes=50 --seconds=60
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(nodes|seconds|burst)=(\d+)$/.exec(a);if (!m) throw new Error('Use --nodes=50 --seconds=60 --burst=500');return [m[1],Number(m[2])];}));
const NODES=args.nodes ?? 50, SECONDS=args.seconds ?? 60, BURST=args.burst ?? 500, PERIOD=2000;
const config=readConfig(process.env), pool=createDbPool(config.db), base=`http://${config.host}:${config.port}`;
const ZONE_OF={'SIM-A01':'A','SIM-B01':'B','ESP-C01':'C','SIM-D01':'D'};
let backend,ws;
const rss=pid=>{
  try {
    if (process.platform==='linux') return Number(/VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`,'utf8'))[1])/1024;
    if (process.platform==='win32') {const out=spawnSync('tasklist',['/FI',`PID eq ${pid}`,'/FO','CSV','/NH'],{encoding:'utf8'}).stdout;return Number(out.split('","')[4].replace(/[^\d]/g,''))/1024;}
  } catch {} return null;
};
const pct=(list,p)=>{if (!list.length) return null;const s=[...list].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.ceil(p/100*s.length)-1)];};
const stats=list=>({samples:list.length,p50_ms:pct(list,50),p95_ms:pct(list,95),max_ms:list.length ? Math.max(...list):null});
async function until(read,accept,ms=15000) {const end=Date.now()+ms;while (Date.now()<end) {try {const v=await read();if (accept(v)) return v;} catch {} await delay(100);}throw new Error('LOAD_TIMEOUT');}
try {
  if (await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(1000)}).then(()=>true,()=>false)) throw Object.assign(new Error('stop the running backend first'),{code:'PORT_IN_USE'});
  backend=spawn(process.execPath,['--env-file=.local/runtime.env','server/start.mjs'],{cwd:root,stdio:'ignore',windowsHide:true});
  await until(()=>fetch(`${base}/api/ready`).then(r=>r.status),s=>s===200);
  const cookie=await signIn(base,'viewer'), rssStart=rss(backend.pid);
  let virtual=0; const clock=()=>virtual;
  const devices=['SIM-A01','SIM-B01','ESP-C01','SIM-C02','SIM-D01'].map(id=>new SimDevice(id,{config,clock,label:'load'}));
  for (const d of devices) {if (d.spec.environment) d.state.temperature=ZONE_TEMPERATURE[d.spec.zone_id][0]+1; await d.connect();}
  const sent=new Map(), shown=[], counters=new Map(devices.map(d=>[d.id,0]));
  let latest=null;
  ws=new WebSocket(`ws://${config.host}:${config.port}/ws`,{headers:{cookie},origin:'http://127.0.0.1:5173'});
  ws.on('message',raw=>{
    const at=Date.now(), frame=JSON.parse(raw); if (frame.type!=='snapshot') return; latest=frame.data;
    for (const z of frame.data.zones) {
      const id=Object.keys(ZONE_OF).find(k=>ZONE_OF[k]===z.id), key=`${id}:${z.environment.temperature_c}`, t=sent.get(key);
      if (t && !t.shown) {t.shown=true; shown.push(at-t.at);}
    }
  });
  await once(ws,'open');
  const marker=d=>{const k=counters.get(d.id); counters.set(d.id,k+1); return Math.round((ZONE_TEMPERATURE[d.spec.zone_id][0]+1+(k%400)/100)*100)/100;};
  const publishOne=async d=>{
    if (d.spec.environment) d.state.temperature=marker(d);
    virtual+=40; const m=await d.telemetry(); const at=Date.now();
    if (d.spec.environment) sent.set(`${d.id}:${d.state.temperature}`,{at,shown:false});
    return {id:d.id,boot:d.boot,seq:m.seq,at};
  };
  const published=[];
  // Phase 1: steady load, NODES senders each once per 2 s, spread evenly.
  const gap=PERIOD/NODES, started=Date.now(), deadline=started+SECONDS*1000;
  for (let i=0;Date.now()<deadline;i++) {
    published.push(await publishOne(devices[i%devices.length]));
    const next=started+(i+1)*gap, wait=next-Date.now(); if (wait>0) await delay(wait);
  }
  const steadyDuration=(Date.now()-started)/1000;
  await delay(2500);
  const ingest=async list=>{
    const byBoot=new Map(list.map(p=>[`${p.id}|${p.boot}|${p.seq}`,p.at]));
    const [rows]=await pool.execute(`SELECT device_id,boot_id,seq,received_at FROM telemetry WHERE boot_id IN (${devices.map(()=>'?').join(',')})`,devices.map(d=>d.boot));
    const lat=[]; for (const r of rows) {const t=byBoot.get(`${r.device_id}|${r.boot_id}|${r.seq}`); if (t) lat.push(new Date(r.received_at).getTime()-t);}
    return {stored:lat.length,latency:lat};
  };
  const steady=await ingest(published), steadyShown=[...shown];
  // Phase 2: burst, as fast as QoS1 acks allow.
  const burstStart=Date.now(), burst=[];
  for (let i=0;i<BURST;i++) burst.push(await publishOne(devices[i%devices.length]));
  const burstPublished=(Date.now()-burstStart)/1000;
  const all=[...published,...burst];
  await until(async()=>(await ingest(all)).stored,n=>n>=all.length,30000).catch(()=>{});
  const burstDrain=(Date.now()-burstStart)/1000, total=await ingest(all), burstLat=(await ingest(burst)).latency;
  // Phase 3: every device drops and reconnects on a new session; time until all are fresh again.
  for (const d of devices) await d.offline();
  await delay(3000);
  const reconnectStart=Date.now();
  for (const d of devices) {await d.connect(); await d.telemetry();}
  await until(async()=>latest,s=>devices.every(d=>{const x=s.devices.find(v=>v.id===d.id);return x.session_id===d.session && x.freshness==='fresh';}),20000);
  const reconnect=(Date.now()-reconnectStart)/1000, rssEnd=rss(backend.pid);
  const result={checked_at:new Date().toISOString(),machine:{os:`${os.type()} ${os.release()}`,cpu:os.cpus()[0]?.model,cores:os.cpus().length,memory_gb:Math.round(os.totalmem()/2**30)},
    virtual_nodes:NODES,device_identities:devices.length,
    steady:{seconds:Math.round(steadyDuration),published:published.length,rate_per_s:Math.round(published.length/steadyDuration*10)/10,stored:steady.stored,lost:published.length-steady.stored,
      ingest:stats(steady.latency),publish_to_websocket:{...stats(steadyShown),note:'markers overwritten inside the 1 s broadcast window are not shown, so this is a sample'}},
    burst:{messages:BURST,publish_seconds:Math.round(burstPublished*10)/10,drained_seconds:Math.round(burstDrain*10)/10,ingest:stats(burstLat)},
    total:{published:all.length,stored:total.stored,lost:all.length-total.stored},
    reconnect_all_fresh_seconds:Math.round(reconnect*10)/10,backend_rss_mb:{start:rssStart && Math.round(rssStart),end:rssEnd && Math.round(rssEnd)},
    target:'P95 publish → display ≤ 2 s (proposed in Agent.md, not changed after measuring)'};
  result.pass=result.total.lost===0 && result.steady.publish_to_websocket.p95_ms!==null && result.steady.publish_to_websocket.p95_ms<=2000;
  writeFileSync(join(local,'load-test.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  console.log(result.pass ? 'M16 load test PASS: no loss and P95 publish→WebSocket ≤ 2 s.' : 'M16 load test FAIL: see numbers above.');
  if (!result.pass) process.exitCode=1;
  for (const d of devices) await d.offline();
} catch(error) {console.error(`Load test failed (${error.code ?? error.name}: ${error.message}); secrets not printed.`);process.exitCode=1;}
finally {ws?.close(); if (backend) {const e=once(backend,'exit');backend.kill('SIGINT');await e;} await pool.end();}
