import mqtt from 'mqtt';
import { randomUUID } from 'node:crypto';

export function connectBroker(options) {
  // shortcut: M04 checks connectivity only; subscribe and validate ingest in M05.
  const client = mqtt.connect({...options,protocol:'mqtt',protocolVersion:4,clientId:`kg-backend-${randomUUID()}`,
    clean:true,reconnectPeriod:1000,connectTimeout:1500,keepalive:10,resubscribe:false});
  client.on('error',()=>{}); // Readiness reports failure; do not emit broker errors containing connection details.
  return client;
}
