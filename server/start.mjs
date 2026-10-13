import { readConfig } from './config.mjs';
import { createDbPool, loadOwnership, databaseReady } from './database.mjs';
import { connectBroker } from './mqtt.mjs';
import { createApp } from './http.mjs';
import { createTelemetryStore } from './telemetry-store.mjs';
import {attachSnapshots} from './websocket.mjs';

try {
  const config = readConfig(process.env);
  const state = loadOwnership();
  const pool = createDbPool(config.db);
  const store=createTelemetryStore(pool);
  const ready=()=>databaseReady(pool,state);
  const broker = connectBroker(config.mqtt,{...store,databaseReady:ready});
  const readiness=async()=>({database:await ready(),mqtt:broker.connected && broker.ingestReady});
  const server = createApp(readiness,store);
  const stopSnapshots=attachSnapshots(server,readiness,store);
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
  server.listen(config.port,config.host,()=>console.log(`KhoGuard backend listening at http://${config.host}:${config.port}; MQTT telemetry, snapshot and bounded history enabled.`));
} catch (error) {
  console.error(`Backend configuration invalid${error.code === 'CONFIG' ? `: ${error.message}` : ''}. Check .local/runtime.env and mysql-state.json; secrets not printed.`);
  process.exitCode = 1;
}
