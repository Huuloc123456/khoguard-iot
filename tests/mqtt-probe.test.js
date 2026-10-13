import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { receiveProbe } from '../scripts/mqtt-probe.mjs';

test('MQTT probe waits for its live marker despite retained and unrelated traffic', async () => {
  const client = new EventEmitter();
  const received = receiveProbe(client, 'telemetry', 'this-run');
  client.emit('message', 'telemetry', Buffer.from('this-run'), { retain: true });
  client.emit('message', 'other-topic', Buffer.from('this-run'), { retain: false });
  client.emit('message', 'telemetry', Buffer.from('another-run'), { retain: false });
  assert.equal(client.listenerCount('message'), 1);
  client.emit('message', 'telemetry', Buffer.from('this-run'), { retain: false });
  assert.equal(await received, 'this-run');
  assert.equal(client.listenerCount('message'), 0);
});

test('MQTT probe times out when its marker never arrives and removes its listener', async () => {
  const client = new EventEmitter();
  await assert.rejects(receiveProbe(client, 'telemetry', 'missing', 10), /did not arrive/);
  assert.equal(client.listenerCount('message'), 0);
});
