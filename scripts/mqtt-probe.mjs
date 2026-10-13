// Retained or unrelated traffic on the same topic must not satisfy a delivery probe.
export function receiveProbe(client, topic, expected, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('message', listener);
      reject(new Error('Expected MQTT message did not arrive'));
    }, timeoutMs);
    const listener = (name, payload, packet) => {
      if (name !== topic || packet.retain || payload.toString() !== expected) return;
      clearTimeout(timer);
      client.off('message', listener);
      resolve(payload.toString());
    };
    client.on('message', listener);
  });
}
