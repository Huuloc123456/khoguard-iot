import test from 'node:test';
import assert from 'node:assert/strict';
import { connectBroker } from '../server/mqtt.mjs';

// A packet still buffered from a connection that has since closed must be refused, not acknowledged: MQTT.js queues an
// offline PUBACK and sends it after reconnecting, so the broker would drop a message the backend never stored (T24).
test('a packet from a superseded connection is not acknowledged or ingested', async () => {
  let ingested = 0, client;
  const ingest = {
    resetConnection() {},
    // The connection closes while this packet waits for the readiness check.
    databaseReady: async () => { client.emit('close'); return true; },
    ingest: async () => { ingested++; },
  };
  client = connectBroker({ host: '127.0.0.1', port: 1, username: 'test', password: 'test' }, ingest, { clientId: 'kg-test-stale' });
  try {
    const packet = { cmd: 'publish', topic: 'khoguard/v1/WH01/devices/SIM-A01/telemetry', payload: Buffer.from('{}'), qos: 1, messageId: 7 };
    const error = await new Promise(resolve => client.handleMessage(packet, resolve));
    assert.ok(error instanceof Error, 'done() must carry an error so no PUBACK is sent');
    assert.equal(ingested, 0);
  } finally { client.end(true); }
});

test('a packet ingested on the current connection is acknowledged', async () => {
  let ingested = 0;
  const ingest = { resetConnection() {}, databaseReady: async () => true, ingest: async () => { ingested++; } };
  const client = connectBroker({ host: '127.0.0.1', port: 1, username: 'test', password: 'test' }, ingest, { clientId: 'kg-test-current' });
  try {
    const packet = { cmd: 'publish', topic: 'khoguard/v1/WH01/devices/SIM-A01/telemetry', payload: Buffer.from('{}'), qos: 1, messageId: 8 };
    const error = await new Promise(resolve => client.handleMessage(packet, resolve));
    assert.equal(error, undefined);
    assert.equal(ingested, 1);
  } finally { client.end(true); }
});
