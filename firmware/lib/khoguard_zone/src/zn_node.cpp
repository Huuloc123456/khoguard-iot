#include "zn_node.h"
#include <Arduino.h>
#include <DHT.h>
#include <esp_timer.h>
#include "controller.h"
#include "zn_config.h"

namespace kg {
namespace zone {
char bootId[33];
char sessionId[33];

namespace {
portMUX_TYPE lock = portMUX_INITIALIZER_UNLOCKED;
Snapshot state{};
// Same 30 ms debounce as ESP-C01; an input is unknown until its first stable reading.
kg::Input contacts[3], presence, inButton, outButton;
DHT dht(DHT_PIN, DHT22);
QueueHandle_t queue;
uint64_t eventSeq = 0;

void enqueue(uint8_t door, bool open) {
  DoorEvent event{++eventSeq, uint64_t(esp_timer_get_time() / 1000), door, open};
  if (!queue || xQueueSend(queue, &event, 0) != pdTRUE) Serial.println("EVENT_GAP: local state still updated");
}

// True on a debounced press (button pulled LOW) after the button was first seen released.
bool pressed(kg::Input &button, int pin, uint32_t now) {
  const bool wasKnown = button.known;
  return button.update(digitalRead(pin) == HIGH, now) && wasKnown && !button.value;
}
}  // namespace

void randomId(char *output) {
  snprintf(output, 33, "%08lx%08lx%08lx%08lx", static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()));
}

void begin() {
  randomId(bootId);
  for (int pin : CONTACT_PINS) pinMode(pin, INPUT_PULLUP);
  for (int pin : {PRESENCE_PIN, IN_BUTTON_PIN, OUT_BUTTON_PIN}) pinMode(pin, INPUT_PULLUP);
  for (int pin : {WARNING_LED_PIN, CRITICAL_LED_PIN}) {pinMode(pin, OUTPUT); digitalWrite(pin, LOW);}
  dht.begin();
  state.temperature = state.humidity = NAN;
  queue = xQueueCreate(16, sizeof(DoorEvent));
  if (!queue) Serial.println("EVENT_QUEUE_FAILED; telemetry continues");
}

void step() {
  const uint32_t now = millis();
  bool changed = false, warning = false, critical = false;
  const bool in = pressed(inButton, IN_BUTTON_PIN, now), out = pressed(outButton, OUT_BUTTON_PIN, now);
  portENTER_CRITICAL(&lock);
  for (unsigned d = 0; d < 3; d++) {
    const bool wasKnown = contacts[d].known;
    if (contacts[d].update(digitalRead(CONTACT_PINS[d]) == HIGH, now)) {
      state.contactKnown[d] = true;
      state.open[d] = contacts[d].value;
      if (state.open[d]) state.openSince[d] = now;
      if (wasKnown) enqueue(uint8_t(d), state.open[d]);
      changed = true;
    }
    if (state.contactKnown[d] && state.open[d]) {
      const uint32_t elapsed = now - state.openSince[d];
      warning = warning || elapsed >= DOOR_WARNING_MS;
      critical = critical || elapsed > DOOR_CRITICAL_MS;
    }
  }
  if (presence.update(digitalRead(PRESENCE_PIN) == HIGH, now)) {
    state.presenceKnown = true;
    state.presence = presence.value;
    changed = true;
  }
  // After boot nobody knows who is inside; an empty room is confirmed once presence reads clear.
  if (!state.countVerified && state.presenceKnown && !state.presence) {state.countVerified = true; state.count = 0; changed = true;}
  const bool counting = state.countVerified;
  if (counting && in && state.count < 99) {state.count++; changed = true;}
  if (counting && out && state.count > 0) {state.count--; changed = true;}
  if (changed) state.revision++;
  const Snapshot shown = state;
  portEXIT_CRITICAL(&lock);

  digitalWrite(WARNING_LED_PIN, warning ? HIGH : LOW);
  digitalWrite(CRITICAL_LED_PIN, critical ? HIGH : LOW);
  if ((in || out) && !counting) Serial.println("COUNT_IGNORED: count not verified yet; set presence LOW first");
  else if (in || out) Serial.printf("COUNT %s -> %lu\r\n", in ? "IN" : "OUT", static_cast<unsigned long>(shown.count));
  static bool lastOpen[3] = {false, false, false}, lastKnown[3] = {false, false, false};
  for (unsigned d = 0; d < 3; d++) {
    if (shown.contactKnown[d] && (!lastKnown[d] || lastOpen[d] != shown.open[d]))
      Serial.printf("DOOR %s %s\r\n", DOOR_IDS[d], shown.open[d] ? "open" : "closed");
    lastKnown[d] = shown.contactKnown[d];
    lastOpen[d] = shown.open[d];
  }

  static uint32_t readAt = millis();
  if (now - readAt >= 2000) {
    readAt = now;
    const float h = dht.readHumidity(), t = dht.readTemperature();
    portENTER_CRITICAL(&lock);
    state.temperature = t;
    state.humidity = h;
    state.sampleAt = millis();
    portEXIT_CRITICAL(&lock);
    Serial.printf("ZONE_HEARTBEAT %s temperature=%.1f humidity=%.1f people=%s\r\n", DEVICE_ID, t, h,
                  shown.countVerified ? String(shown.count).c_str() : "unverified");
  }
}

Snapshot snapshot() {
  portENTER_CRITICAL(&lock);
  const Snapshot copy = state;
  portEXIT_CRITICAL(&lock);
  return copy;
}

bool nextEvent(DoorEvent &event) {
  return queue && xQueueReceive(queue, &event, 0) == pdTRUE;
}
}  // namespace zone
}  // namespace kg
