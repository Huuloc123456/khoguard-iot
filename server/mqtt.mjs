import mqtt from 'mqtt';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { local } from '../scripts/local-config.mjs';

const defaultCa = () => { const file=join(local,'tls','ca.crt'); return existsSync(file) ? readFileSync(file,'utf8') : null; };

// TLS verifies the broker certificate against the project CA (host 127.0.0.1 must be in its SAN); never rejectUnauthorized:false.
export function brokerOptions({tls,...options},ca=tls ? defaultCa() : undefined) {
  if (!tls) return {...options,protocol:'mqtt'};
  if (typeof ca!=='string' || !ca.includes('BEGIN CERTIFICATE')) throw new Error('MQTT TLS needs the demo CA certificate');
  return {...options,protocol:'mqtts',ca,rejectUnauthorized:true,minVersion:'TLSv1.2'};
}

export function connectBroker(options,ingest,{ca=options.tls ? defaultCa() : undefined,clientId=`kg-backend-${randomUUID()}`,clean=true}={}) {
  const client = mqtt.connect({...brokerOptions(options,ca),protocolVersion:4,clientId,
    clean,reconnectPeriod:1000,connectTimeout:1500,keepalive:10,resubscribe:false});
  client.on('error',()=>{}); // Readiness reports failure; do not emit broker errors containing connection details.
  if (ingest) {
    let generation=0,timer;
    client.ingestReady=false;
    const reset=()=>{generation++;clearTimeout(timer);client.ingestReady=false;ingest.resetConnection();};
    client.on('close',reset);
    client.on('end',reset);
    client.on('connect',()=>{
      reset(); const started=generation;
      async function subscribe() {
        if (!client.connected || generation!==started || client.disconnecting) return;
        try {
          if (!await ingest.databaseReady()) throw new Error('DATABASE_UNAVAILABLE');
          const grants=await client.subscribeAsync(['status','telemetry','events','acks'].map(kind=>`khoguard/v1/WH01/devices/+/${kind}`),{qos:1});
          if (grants.length!==4 || grants.some(g=>g.qos!==1)) throw new Error('SUBSCRIBE_REFUSED');
          if (generation===started && client.connected) client.ingestReady=true;
        } catch {if (generation===started && client.connected && !client.disconnecting) timer=setTimeout(()=>void subscribe(),1000);}
      }
      void subscribe();
    });
    // MQTT.js applies backpressure one packet at a time, rather than an unbounded async message queue.
    client.handleMessage=(packet,done)=>{
      const started=generation;
      Promise.resolve().then(async()=>{
        if (!await ingest.databaseReady()) throw new Error('DATABASE_UNAVAILABLE');
        if (generation!==started) return false;
        await ingest.ingest(packet);
        return true;
      }).then(current=>{
        // A packet left over from a closed connection must not be acknowledged: MQTT.js would queue the PUBACK and
        // send it after reconnecting, so the broker would drop a message that was never stored. Its stream is already
        // gone, so do not destroy the (possibly new) one; the broker redelivers it on the persistent session.
        if (current) done(); else done(new Error('STALE_CONNECTION'));
      },()=>{
        reset();
        console.error('MQTT ingest unavailable; connection discarded, persistence not acknowledged.');
        client.stream?.destroy();
        done(new Error('INGEST_UNAVAILABLE'));
      });
    };
  }
  return client;
}
