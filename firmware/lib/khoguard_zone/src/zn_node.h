#pragma once
#include <stdint.h>

// Zone node for zones A/B/D: three door contacts, presence, IN/OUT counting buttons and a DHT22. It owns its door
// timers like ESP-C01 but has no lock, beam or panic hardware, so those signals are reported as unknown (null).
namespace kg {
namespace zone {
struct Snapshot {
  uint64_t revision;
  bool contactKnown[3], open[3];
  uint32_t openSince[3];
  bool presenceKnown, presence;
  bool countVerified;
  uint32_t count;
  float temperature, humidity;
  uint32_t sampleAt;
};
struct DoorEvent {uint64_t seq, uptime; uint8_t door; bool open;};

extern char bootId[33];
extern char sessionId[33];
void randomId(char *output);

// Pins, DHT22, boot ID and the event queue.
void begin();
// One loop pass: debounce inputs, count people, door timers and LEDs, DHT22 every 2 s.
void step();
// Consistent copy for the MQTT task.
Snapshot snapshot();
// Oldest queued door change, without blocking.
bool nextEvent(DoorEvent &event);
}  // namespace zone
}  // namespace kg
