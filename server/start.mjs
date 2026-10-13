import { readConfig } from './config.mjs';
import { createDbPool, loadOwnership, databaseReady } from './database.mjs';
import { connectBroker } from './mqtt.mjs';
import { createApp } from './http.mjs';
import { createTelemetryStore } from './telemetry-store.mjs';
import { createAccessStore } from './access-store.mjs';
import { createReservationStore } from './reservation-store.mjs';
import {attachSnapshots} from './websocket.mjs';

try {
  const config = readConfig(process.env);
  const state = loadOwnership();
  const pool = createDbPool(config.db);
  // Commands are published by the same backend client that ingests acks; late-bound because the broker needs the store.
  const store=createTelemetryStore(pool,{publish:(topic,payload,options)=>broker.publishAsync(topic,payload,options)});
  const ready=()=>databaseReady(pool,state);
  // M12: persistent session with a stable client ID, so QoS1 events/acks published while the backend is down (or not yet
  // acknowledged because MySQL failed) are redelivered on reconnect, bounded by the broker's max_queued_messages.
  const broker = connectBroker(config.mqtt,{...store,databaseReady:ready},{clientId:`khoguard-backend-${config.port}`,clean:false});
  const readiness=async()=>({database:await ready(),mqtt:broker.connected && broker.ingestReady});
  const access=createAccessStore(pool);
  const server = createApp(readiness,store,access,createReservationStore(pool));
  const stopSnapshots=attachSnapshots(server,readiness,store,access);
  let stopping = false;
  async function stop(code=0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    const deadline = setTimeout(()=>process.exit(code || 1),5000);
    deadline.unref();
    await stopSnapshots();
    server.closeAllConnections();
    await Promise.allSettled([new Promise(resolve=>server.close(resolve)),broker.endAsync(true),pool.end()]);
    clearTimeout(deadline);
  }
  server.on('error',error=>{console.error(`Backend listener failed (${error.code ?? 'LISTEN'}); no other process stopped.`); void stop(1);});
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>void stop());
  server.listen(config.port,config.host,()=>console.log(`KhoGuard backend listening at http://${config.host}:${config.port}; MQTT telemetry, events, door commands/acks, alerts and login enabled.`));
} catch (error) {
  console.error(`Backend configuration invalid${error.code === 'CONFIG' ? `: ${error.message}` : ''}. Check .local/runtime.env and mysql-state.json; secrets not printed.`);
  process.exitCode = 1;
}
