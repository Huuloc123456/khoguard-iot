import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
import { local, readJson } from './local-config.mjs';
import { acceptFirmwareSample } from './firmware-observation.mjs';

const expectedBoot = process.argv[2];
if (process.argv.length > 3 || (expectedBoot && !/^[a-f0-9]{32}$/.test(expectedBoot))) {
  console.error('Usage: npm run firmware:check -- [32-character boot ID from Wokwi serial]');
  process.exit(1);
}
const topic = 'khoguard/v1/WH01/devices/ESP-C01/telemetry';
let client;
let timer;
try {
  const accounts = readJson(join(local, 'mosquitto', 'accounts.json'));
  client = await mqtt.connectAsync('mqtt://127.0.0.1:18884', {
    username: 'khoguard-observer', password: accounts['khoguard-observer'],
    clientId: `kg-fw-check-${randomUUID()}`, clean: true, reconnectPeriod: 0, connectTimeout: 3000,
  });
  const samples = [];
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('No three live firmware samples within 45 seconds; start Wokwi and keep its tab visible')), 45000);
    client.on('error', () => reject(new Error('Observer connection failed')));
    client.on('message', (name, raw, packet) => {
      if (name !== topic) return;
      try {
        if (!acceptFirmwareSample(samples, name, raw, packet, expectedBoot)) return;
        const last = samples.at(-1);
        console.log(`Live ESP-C01 seq=${last.seq}, uptime=${last.uptime_ms}, boot=${last.boot_id}, session=${last.session_id}`);
        if (samples.length < 3) return;
        assert.ok(samples.some(s => typeof s.payload.environment.temperature_c === 'number'
          && typeof s.payload.environment.humidity_pct === 'number'), 'At least one sample must contain a DHT22 reading');
        resolve();
      } catch (error) { reject(error); }
    });
    client.subscribe(topic, { qos: 1 }, error => { if (error) reject(new Error('Observer subscription failed')); });
  });
  const evidence = {
    checked_at: new Date().toISOString(), boot_correlated: Boolean(expectedBoot),
    topic, qos: 1, live_samples: samples.length, samples,
  };
  writeFileSync(join(local, 'firmware-observation.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(expectedBoot
    ? 'PASS: three live schema-valid frames, QoS1, increasing sequence/uptime, boot matches supplied Wokwi ID.'
    : 'PASS: three live schema-valid device frames. Compare boot ID with Wokwi serial before claiming simulator provenance.');
} catch (error) {
  console.error(`Firmware check FAIL: ${error.code ?? error.message}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await client?.endAsync(true);
}
