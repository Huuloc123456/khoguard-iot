import mqtt from 'mqtt';
import { randomUUID } from 'node:crypto';

export function connectBroker(options,ingest) {
  const client = mqtt.connect({...options,protocol:'mqtt',protocolVersion:4,clientId:`kg-backend-${randomUUID()}`,
    clean:true,reconnectPeriod:1000,connectTimeout:1500,keepalive:10,resubscribe:false});
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
          const grants=await client.subscribeAsync(['khoguard/v1/WH01/devices/+/status','khoguard/v1/WH01/devices/+/telemetry'],{qos:1});
          if (grants.length!==2 || grants.some(g=>g.qos!==1)) throw new Error('SUBSCRIBE_REFUSED');
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
        if (generation!==started) return;
        await ingest.ingest(packet);
      }).then(()=>done(),()=>{
        reset();
        console.error('MQTT ingest unavailable; connection discarded, persistence not acknowledged.');
        client.stream?.destroy();
        done(new Error('INGEST_UNAVAILABLE'));
      });
    };
  }
  return client;
}
