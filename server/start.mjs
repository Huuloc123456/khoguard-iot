import { readConfig } from './config.mjs';
import { createDbPool, loadOwnership, databaseReady } from './database.mjs';
import { connectBroker } from './mqtt.mjs';
import { createApp } from './http.mjs';

try {
  const config = readConfig(process.env);
  const state = loadOwnership();
  const pool = createDbPool(config.db);
  const broker = connectBroker(config.mqtt);
  const server = createApp(async()=>({database:await databaseReady(pool,state),mqtt:broker.connected}));
  let stopping = false;
  async function stop(code=0) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    const deadline = setTimeout(()=>process.exit(code || 1),5000);
    deadline.unref();
    server.closeAllConnections();
    await Promise.allSettled([new Promise(resolve=>server.close(resolve)),broker.endAsync(true),pool.end()]);
    clearTimeout(deadline);
  }
  server.on('error',error=>{console.error(`Backend listener failed (${error.code ?? 'LISTEN'}); no other process stopped.`); void stop(1);});
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>void stop());
  server.listen(config.port,config.host,()=>console.log(`KhoGuard backend listening at http://${config.host}:${config.port}; health/ready only, no ingest or commands.`));
} catch (error) {
  console.error(`Backend configuration invalid${error.code === 'CONFIG' ? `: ${error.message}` : ''}. Check .local/runtime.env and mysql-state.json; secrets not printed.`);
  process.exitCode = 1;
}
