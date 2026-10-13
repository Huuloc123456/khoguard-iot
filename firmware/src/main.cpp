#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <MQTT.h>
#include <WiFi.h>
#include <esp_timer.h>
#include <esp_arduino_version.h>
#include "kg_secrets.h"

constexpr char TELEMETRY_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/telemetry";
constexpr char STATUS_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/status";
DHT dht(15, DHT22);
char bootId[33];
char sessionId[33];
portMUX_TYPE sampleLock = portMUX_INITIALIZER_UNLOCKED;
float temperature = NAN;
float humidity = NAN;
uint32_t sampleAt = 0;

void randomId(char *output) {
  snprintf(output, 33, "%08lx%08lx%08lx%08lx", static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()));
}

void envelope(JsonDocument &doc, const char *kind, uint64_t seq, bool will = false) {
  doc["schema_version"] = 1;
  doc["warehouse_id"] = "WH01";
  doc["device_id"] = "ESP-C01";
  doc["boot_id"] = bootId;
  doc["session_id"] = sessionId;
  doc["seq"] = seq;
  doc["kind"] = kind;
  // shortcut: M03 has no clock sync or remote commands; add verified NTP before accepting commands.
  doc["clock_synced"] = false;
  doc["sent_at"] = nullptr;
  doc["uptime_ms"] = will ? uint64_t(0) : uint64_t(esp_timer_get_time() / 1000);
  doc["payload"]["zone_id"] = "C";
}

bool publish(MQTTClient &client, const char *topic, JsonDocument &doc) {
  if (doc.overflowed() || measureJson(doc) > 4096) {
    Serial.println("JSON_LIMIT: frame not sent");
    return false;
  }
  String json;
  serializeJson(doc, json);
  return client.publish(topic, json, true, 1);
}

void telemetry(JsonDocument &doc, uint64_t seq) {
  envelope(doc, "telemetry", seq);
  float t, h;
  uint32_t at;
  portENTER_CRITICAL(&sampleLock);
  t = temperature;
  h = humidity;
  at = sampleAt;
  portEXIT_CRITICAL(&sampleLock);
  const bool fresh = millis() - at <= 5000;
  JsonObject payload = doc["payload"].as<JsonObject>();
  payload["controller_revision"] = 0;
  if (fresh && isfinite(t) && t >= -100 && t <= 100) payload["environment"]["temperature_c"] = t;
  else payload["environment"]["temperature_c"] = nullptr;
  if (fresh && isfinite(h) && h >= 0 && h <= 100) payload["environment"]["humidity_pct"] = h;
  else payload["environment"]["humidity_pct"] = nullptr;
  payload["occupancy"]["current_occupants"] = nullptr;
  payload["occupancy"]["count_verified"] = false;
  payload["occupancy"]["presence"] = nullptr;
  JsonArray doors = payload["doors"].to<JsonArray>();
  for (const char *id : {"D07", "D08"}) {
    JsonObject door = doors.add<JsonObject>();
    door["door_id"] = id;
    door["state"] = "unknown";
    door["beam_clear"] = nullptr;
    door["panic_latched"] = nullptr;
    door["local_inputs_healthy"] = false;
  }
}

// QoS1 waits for PUBACK in this task; sensor/heartbeat loop runs independently.
void networkTask(void *) {
  WiFiClient net;
  MQTTClient client(4096);
  client.begin(MQTT_HOST, MQTT_PORT, net);
  client.setOptions(10, true, 1000);
  uint64_t telemetrySeq = 0, statusSeq = 0;
  uint32_t attemptedAt = millis() - 5000, publishedAt = millis() - 2000;
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
        client.setWill(STATUS_TOPIC, willJson.c_str(), true, 1);
        net.stop();
        if (net.connect(MQTT_HOST, MQTT_PORT, 1000) && client.connect("ESP-C01", MQTT_USER, MQTT_PASSWORD, true)) {
          JsonDocument online;
          envelope(online, "status", ++statusSeq);
          online["payload"]["state"] = "online";
          if (!publish(client, STATUS_TOPIC, online)) net.stop();
          else Serial.printf("MQTT_ONLINE boot=%s session=%s\r\n", bootId, sessionId);
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
        if (!publish(client, TELEMETRY_TOPIC, doc)) net.stop();
        else Serial.printf("TELEMETRY_ACK seq=%llu\r\n", static_cast<unsigned long long>(telemetrySeq));
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  Serial.begin(115200);
  randomId(bootId);
  dht.begin();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("Wokwi-GUEST", "", 6);
  Serial.printf("KHOGUARD_M03 boot=%s core=%d.%d.%d; D07/D08 and occupancy UNKNOWN; no door outputs\r\n",
                bootId, ESP_ARDUINO_VERSION_MAJOR, ESP_ARDUINO_VERSION_MINOR, ESP_ARDUINO_VERSION_PATCH);
  if (xTaskCreate(networkTask, "mqtt", 8192, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("MQTT_TASK_FAILED; sensor loop continues");
  }
}

void loop() {
  static uint32_t readAt = millis();
  if (millis() - readAt >= 2000) {
    readAt = millis();
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    portENTER_CRITICAL(&sampleLock);
    temperature = t;
    humidity = h;
    sampleAt = millis();
    portEXIT_CRITICAL(&sampleLock);
    Serial.printf("SENSOR_HEARTBEAT ms=%llu temperature=%.1f humidity=%.1f\r\n",
                  static_cast<unsigned long long>(esp_timer_get_time() / 1000), t, h);
  }
  delay(10);
}
