#pragma once
#include <Arduino.h>
#include "controller.h"

// Door commands from the backend. Acks are queued from the MQTT callback and published from the network loop,
// never inside the callback; at most 4 wait, further commands are ignored and the backend marks them expired.
namespace kg {
namespace commands {
struct PendingAck {char id[65];uint8_t door;kg::Reason reason;};

// MQTT message callback for the commands topic.
void onMessage(String &topic, String &raw);
// A new clean session: acks of the previous one are dropped.
void clear();
// Oldest ack waiting to be published, or nullptr.
const PendingAck *front();
void pop();
}  // namespace commands
}  // namespace kg
