import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import mqtt from 'mqtt';
import { brokerOptions } from '../server/mqtt.mjs';
import { readConfig } from '../server/config.mjs';
import { validateMqttMessage } from '../contracts/validate.js';
import { local, readJson } from './local-config.mjs';
import { environmentMessage, statusMessage } from './environment-message.mjs';

let client,currentWill,stopping=false;
const topic=kind=>`khoguard/v1/WH01/devices/SIM-A01/${kind}`;
async function publish(kind,message) {
  let timeout;
  try { await Promise.race([client.publishAsync(topic(kind),JSON.stringify(message),{qos:1,retain:true}),
    new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('PUBLISH_TIMEOUT')),5000);})]); }
  finally {clearTimeout(timeout);}
}
async function stop() {
  stopping=true;
  if (client?.connected) {
    await publish('status',currentWill).catch(()=>{});
  }
  await client?.endAsync(true);
}
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>void stop());
try {
  const config=readConfig(process.env), accounts=readJson(join(local,'mosquitto/accounts.json'));
  const values={temperature:24.5,humidity:55};
  const seen=new Set();
  for (const arg of process.argv.slice(2)) {
    const match=/^--(temperature|humidity)=(-?\d+(?:\.\d+)?)$/.exec(arg);
    assert.ok(match && !seen.has(match[1]),'Use --temperature=24.5 --humidity=55');
    seen.add(match[1]); values[match[1]]=Number(match[2]);
  }
  const boot=`sim-${randomUUID()}`, started=performance.now(); let seq=0;
  const make=session=>environmentMessage({boot,session,seq:seq++,uptime:Math.floor(performance.now()-started),...values});
  assert.equal(validateMqttMessage(topic('telemetry'),JSON.stringify(make('initial'))).ok,true,'Invalid simulated temperature/humidity');
  console.log(`SIM-A01: node simulation, ${values.temperature} C / ${values.humidity}%; safety signals unknown. Publish every 2 s; Ctrl+C stops.`);
  while (!stopping) {
    const session=`session-${randomUUID()}`, frame=make(session), offline=statusMessage(frame,'offline');
    client=mqtt.connect({...brokerOptions(config.mqtt),username:'SIM-A01',password:accounts['SIM-A01'],clientId:`kg-sim-${randomUUID()}`,
      reconnectPeriod:0,connectTimeout:1500,keepalive:10,clean:true,queueQoSZero:false,
      will:{topic:topic('status'),payload:JSON.stringify(offline),qos:1,retain:true}});
    currentWill=offline;
    client.on('error',()=>{});
    try {
      await once(client,'connect',{signal:AbortSignal.timeout(5000)});
      await publish('status',statusMessage(frame,'online'));
      while (!stopping && client.connected) {
        await publish('telemetry',make(session));
        await delay(2000);
      }
    } catch {if (!stopping) console.log('Simulator reconnecting; no persistence acknowledgment implied by MQTT PUBACK.');}
    finally {await client.endAsync(true);}
    if (!stopping) await delay(1000);
  }
} catch(error) {
  console.error(`Environment simulator failed (${error.code ?? error.name}); check arguments/local configuration. Secrets not printed.`);
  process.exitCode=1;
} finally {await client?.endAsync(true);}
