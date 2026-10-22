#pragma once
#include <ArduinoJson.h>
#include "config.h"
#include "kg_commands.h"
#include "kg_events.h"

// JSON frames of contracts/mqtt.schema.json for ESP-C01; topics, IDs and retain flags are in include/config.h.
namespace kg {
namespace messages {
// Common envelope; the Last Will (will=true) carries uptime 0 because it is sent by the broker later.
void envelope(JsonDocument &doc, const char *kind, uint64_t seq, bool will = false);
void telemetry(JsonDocument &doc, uint64_t seq);
void eventFrame(JsonDocument &doc, const events::EdgeEvent &event);
void ackFrame(JsonDocument &doc, const commands::PendingAck &ack, uint64_t seq);
}  // namespace messages
}  // namespace kg
