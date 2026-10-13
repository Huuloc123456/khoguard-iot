#pragma once
#include <ArduinoJson.h>
#include "kg_commands.h"
#include "kg_events.h"

// MQTT topics and JSON frames of contracts/mqtt.schema.json for ESP-C01.
namespace kg {
namespace messages {
constexpr char TELEMETRY_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/telemetry";
constexpr char STATUS_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/status";
constexpr char EVENT_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/events";
constexpr char COMMAND_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/commands";
constexpr char ACK_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/acks";

// Common envelope; the Last Will (will=true) carries uptime 0 because it is sent by the broker later.
void envelope(JsonDocument &doc, const char *kind, uint64_t seq, bool will = false);
void telemetry(JsonDocument &doc, uint64_t seq);
void eventFrame(JsonDocument &doc, const events::EdgeEvent &event);
void ackFrame(JsonDocument &doc, const commands::PendingAck &ack, uint64_t seq);
}  // namespace messages
}  // namespace kg
