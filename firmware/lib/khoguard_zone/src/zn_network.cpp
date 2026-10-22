#include "zn_network.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <MQTT.h>
#include <WiFi.h>
#include <esp_timer.h>
#include "kg_secrets.h"
#ifdef MQTT_CA_CERT
#include <WiFiClientSecure.h>
#endif
#include "zn_config.h"
#include "zn_node.h"

namespace kg {
namespace zone {
namespace network {
namespace {
char statusTopic[64], telemetryTopic[64], eventTopic[64];

void envelope(JsonDocument &doc, const char *kind, uint64_t seq, bool will = false) {
  doc["schema_version"] = 1;
  doc["warehouse_id"] = "WH01";
  doc["device_id"] = DEVICE_ID;
  doc["boot_id"] = bootId;
  doc["session_id"] = sessionId;
  doc["seq"] = seq;
  doc["kind"] = kind;
  // No NTP on the simulated board: the backend stamps receive time, like ESP-C01.
  doc["clock_synced"] = false;
  doc["sent_at"] = nullptr;
  doc["uptime_ms"] = will ? uint64_t(0) : uint64_t(esp_timer_get_time() / 1000);
  doc["payload"]["zone_id"] = ZONE_ID;
}

void telemetry(JsonDocument &doc, uint64_t seq) {
  envelope(doc, "telemetry", seq);
  const Snapshot s = snapshot();
  const uint32_t now = millis();
  const bool fresh = now - s.sampleAt <= 5000;
  JsonObject p = doc["payload"].as<JsonObject>();
  p["controller_revision"] = s.revision;
  if (fresh && isfinite(s.temperature) && s.temperature >= -100 && s.temperature <= 100) p["environment"]["temperature_c"] = s.temperature;
  else p["environment"]["temperature_c"] = nullptr;
  if (fresh && isfinite(s.humidity) && s.humidity >= 0 && s.humidity <= 100) p["environment"]["humidity_pct"] = s.humidity;
  else p["environment"]["humidity_pct"] = nullptr;
  // An unverified count is null, never 0, so it cannot be read as an empty room.
  if (s.countVerified) p["occupancy"]["current_occupants"] = s.count;
  else p["occupancy"]["current_occupants"] = nullptr;
  p["occupancy"]["count_verified"] = s.countVerified;
  if (s.presenceKnown) p["occupancy"]["presence"] = s.presence;
  else p["occupancy"]["presence"] = nullptr;
  JsonArray doors = p["doors"].to<JsonArray>();
  JsonArray alarms = p["alarms"].to<JsonArray>();
  for (unsigned d = 0; d < 3; d++) {
    JsonObject door = doors.add<JsonObject>();
    door["door_id"] = DOOR_IDS[d];
    door["state"] = !s.contactKnown[d] ? "unknown" : s.open[d] ? "open" : "closed";
    // This node has no light curtain or panic button: unknown, not "clear".
    door["beam_clear"] = nullptr;
    door["panic_latched"] = nullptr;
    door["local_inputs_healthy"] = s.contactKnown[d];
    if (!s.contactKnown[d] || !s.open[d]) continue;
    const uint32_t open = now - s.openSince[d];
    door["open_ms"] = open;
    if (open > DOOR_CRITICAL_MS) {JsonObject a = alarms.add<JsonObject>(); a["code"] = "DOOR_OPEN_CRITICAL"; a["door_id"] = DOOR_IDS[d];}
    else if (open >= DOOR_WARNING_MS) {JsonObject a = alarms.add<JsonObject>(); a["code"] = "DOOR_OPEN_WARNING"; a["door_id"] = DOOR_IDS[d];}
  }
}

void eventFrame(JsonDocument &doc, const DoorEvent &event) {
  envelope(doc, "events", event.seq);
  doc["uptime_ms"] = event.uptime;
  char id[64];
  snprintf(id, sizeof(id), "%s:%llu", bootId, static_cast<unsigned long long>(event.seq));
  doc["event_id"] = id;
  JsonObject p = doc["payload"].as<JsonObject>();
  p["door_id"] = DOOR_IDS[event.door];
  p["event_type"] = "door";
  p["state"] = event.open ? "open" : "closed";
}

bool publish(MQTTClient &client, const char *topic, JsonDocument &doc, bool retain = true) {
  if (doc.overflowed() || measureJson(doc) > 4096) {
    Serial.println("JSON_LIMIT: frame not sent");
    return false;
  }
  String json;
  serializeJson(doc, json);
  return client.publish(topic, json, retain, 1);
}

void networkTask(void *) {
#ifdef MQTT_CA_CERT
  WiFiClientSecure net;
  net.setCACert(MQTT_CA_CERT);
  net.setHandshakeTimeout(5);
#else
  WiFiClient net;
#endif
  MQTTClient client(4096);
  client.begin(MQTT_HOST, MQTT_PORT, net);
  client.setOptions(10, true, 1000);
  uint64_t telemetrySeq = 0, statusSeq = 0;
  uint32_t attemptedAt = millis() - 5000, publishedAt = millis() - 2000;
  DoorEvent pending;
  bool hasPending = false;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      net.stop();
    } else if (!client.connected()) {
      if (millis() - attemptedAt >= 5000) {
        attemptedAt = millis();
        randomId(sessionId);
        JsonDocument will;
        envelope(will, "status", 0, true);
        will["payload"]["state"] = "offline";
        String willJson;
        serializeJson(will, willJson);
        client.setWill(statusTopic, willJson.c_str(), true, 1);
        net.stop();
        if (net.connect(MQTT_HOST, MQTT_PORT, 1000) && client.connect(DEVICE_ID, MQTT_USER, MQTT_PASSWORD, true)) {
          JsonDocument online;
          envelope(online, "status", ++statusSeq);
          online["payload"]["state"] = "online";
          if (!publish(client, statusTopic, online)) net.stop();
          else Serial.printf("MQTT_ONLINE %s boot=%s session=%s\r\n", DEVICE_ID, bootId, sessionId);
          publishedAt = millis() - 2000;
        } else {
          net.stop();
          Serial.printf("MQTT_RETRY error=%d code=%d\r\n", client.lastError(), client.returnCode());
        }
      }
    } else {
      client.loop();
      if (client.connected() && millis() - publishedAt >= 2000) {
        publishedAt = millis();
        JsonDocument doc;
        telemetry(doc, ++telemetrySeq);
        if (!publish(client, telemetryTopic, doc)) net.stop();
      }
      if (client.connected()) {
        if (!hasPending) hasPending = nextEvent(pending);
        if (hasPending) {
          JsonDocument doc;
          eventFrame(doc, pending);
          if (publish(client, eventTopic, doc, false)) hasPending = false;
          else net.stop();
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
}  // namespace

void start() {
  const char *prefix = "khoguard/v1/WH01/devices";
  snprintf(statusTopic, sizeof(statusTopic), "%s/%s/status", prefix, DEVICE_ID);
  snprintf(telemetryTopic, sizeof(telemetryTopic), "%s/%s/telemetry", prefix, DEVICE_ID);
  snprintf(eventTopic, sizeof(eventTopic), "%s/%s/events", prefix, DEVICE_ID);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("Wokwi-GUEST", "", 6);
#ifdef MQTT_CA_CERT
  constexpr char TRANSPORT[] = "mqtts:18885 CA-verified"; constexpr uint32_t NETWORK_STACK = 12288;
#else
  constexpr char TRANSPORT[] = "mqtt:18884 localhost-only"; constexpr uint32_t NETWORK_STACK = 8192;
#endif
  Serial.printf("KHOGUARD_ZONE device=%s zone=%s doors=%s,%s,%s boot=%s transport=%s; IN/OUT buttons count people, LEDs warn on doors open 30/60 s\r\n",
                DEVICE_ID, ZONE_ID, DOOR_IDS[0], DOOR_IDS[1], DOOR_IDS[2], bootId, TRANSPORT);
  if (xTaskCreate(networkTask, "mqtt", NETWORK_STACK, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("MQTT_TASK_FAILED; local loop continues");
  }
}
}  // namespace network
}  // namespace zone
}  // namespace kg
