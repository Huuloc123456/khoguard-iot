import mysql from 'mysql2/promise';
import { readConfig } from '../server/config.mjs';
import { loadOwnership } from '../server/database.mjs';
import { applyInventory, applyTelemetry, applyEvents, applyControl, applyAccess, applyReservations, applyDeviceSources } from '../db/migrate.mjs';

let connection;
try {
  const config = readConfig(process.env,{migration:true});
  const state = loadOwnership();
  connection = await mysql.createConnection(config.db);
  const result = await applyInventory(connection,state);
  console.log(`Inventory migration ${result.applied ? 'applied' : 'already complete'}; seed ${result.seeded ? 'created' : 'preserved'}. No reset or admin account used.`);
  const telemetry=await applyTelemetry(connection,state);
  console.log(`Telemetry migration ${telemetry.applied ? 'applied' : 'already complete'}; existing history preserved.`);
  const events=await applyEvents(connection,state);
  console.log(`Event migration ${events.applied ? 'applied' : 'already complete'}; existing event log preserved.`);
  const control=await applyControl(connection,state);
  console.log(`Command/alert migration ${control.applied ? 'applied' : 'already complete'}; existing commands and alerts preserved.`);
  const access=await applyAccess(connection,state);
  console.log(`Access migration ${access.applied ? 'applied' : 'already complete'}; accounts come from npm run auth:setup.`);
  const reservations=await applyReservations(connection,state);
  console.log(`Slot/reservation migration ${reservations.applied ? 'applied with demo-seed occupancy' : 'already complete'}; existing reservations preserved.`);
  const sources=await applyDeviceSources(connection,state);
  console.log(`Device source migration ${sources.applied ? 'applied: zones A/B/D are Wokwi zone nodes' : 'already complete'}; device IDs and history unchanged.`);
} catch (error) {
  console.error(`Migration failed (${error.code ?? 'CONFIG_OR_OWNERSHIP'})${error.code === 'CONFIG' ? `: ${error.message}` : ''}. No credentials/SQL logged; check configuration, ownership and schema_migrations before retry.`);
  process.exitCode = 1;
} finally { await connection?.end(); }
