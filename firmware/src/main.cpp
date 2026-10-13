#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <MQTT.h>
#include <WiFi.h>
#include <esp_timer.h>
#include <esp_arduino_version.h>
#include "kg_secrets.h"
#include "controller.h"

constexpr char TELEMETRY_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/telemetry";
constexpr char STATUS_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/status";
constexpr char EVENT_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/events";
constexpr int INPUT_PINS[] = {16,17,18,19,21,22,23};
kg::Controller controller;
struct EdgeEvent {uint64_t seq,uptime;uint8_t door;bool panic,open;};
QueueHandle_t eventQueue;
uint64_t eventSeq=0;
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

bool publish(MQTTClient &client, const char *topic, JsonDocument &doc, bool retain=true) {
  if (doc.overflowed() || measureJson(doc) > 4096) {
    Serial.println("JSON_LIMIT: frame not sent");
    return false;
  }
  String json;
  serializeJson(doc, json);
  return client.publish(topic, json, retain, 1);
}

void telemetry(JsonDocument &doc, uint64_t seq) {
  envelope(doc, "telemetry", seq);
  float t, h;
  uint32_t at;
  kg::Controller c;
  portENTER_CRITICAL(&sampleLock);
  t = temperature;
  h = humidity;
  at = sampleAt;
  c = controller;
  portEXIT_CRITICAL(&sampleLock);
  const bool fresh = millis() - at <= 5000;
  JsonObject payload = doc["payload"].as<JsonObject>();
  payload["controller_revision"] = c.revision;
  if (fresh && isfinite(t) && t >= -100 && t <= 100) payload["environment"]["temperature_c"] = t;
  else payload["environment"]["temperature_c"] = nullptr;
  if (fresh && isfinite(h) && h >= 0 && h <= 100) payload["environment"]["humidity_pct"] = h;
  else payload["environment"]["humidity_pct"] = nullptr;
  payload["occupancy"]["current_occupants"] = nullptr;
  payload["occupancy"]["count_verified"] = false;
  if(c.inputs[6].known) payload["occupancy"]["presence"] = c.inputs[6].value;
  else payload["occupancy"]["presence"] = nullptr;
  JsonArray doors = payload["doors"].to<JsonArray>();
  unsigned index=0;
  for (const char *id : {"D07", "D08"}) {
    JsonObject door = doors.add<JsonObject>();
    door["door_id"] = id;
    door["state"] = !c.inputs[index*3].known ? "unknown" : c.inputs[index*3].value ? "open":"closed";
    if(c.inputs[index*3+1].known) door["beam_clear"] = c.inputs[index*3+1].value;
    else door["beam_clear"] = nullptr;
    if(c.inputs[index*3+2].known) door["panic_latched"] = c.panic[index];
    else door["panic_latched"] = nullptr;
    door["local_inputs_healthy"] = c.healthy(index);
    index++;
  }
}

void eventFrame(JsonDocument &doc,const EdgeEvent &event) {
  envelope(doc,"events",event.seq);
  doc["uptime_ms"]=event.uptime;
  char id[64];snprintf(id,sizeof(id),"%s:%llu",bootId,static_cast<unsigned long long>(event.seq));doc["event_id"]=id;
  auto payload=doc["payload"].as<JsonObject>();
  payload["event_type"]=event.panic ? "panic":"door";
  payload["door_id"]=event.door==0 ? "D07":"D08";
  if(event.panic) payload["input"]="panic_high";
  else payload["state"]=event.open ? "open":"closed";
}

// QoS1 waits for PUBACK in this task; sensor/heartbeat loop runs independently.
void networkTask(void *) {
  WiFiClient net;
  MQTTClient client(4096);
  client.begin(MQTT_HOST, MQTT_PORT, net);
  client.setOptions(10, true, 1000);
  uint64_t telemetrySeq = 0, statusSeq = 0;
  uint32_t attemptedAt = millis() - 5000, publishedAt = millis() - 2000;
  EdgeEvent pending;bool hasPending=false;
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
      if(client.connected()) {
        if(!hasPending) hasPending=xQueueReceive(eventQueue,&pending,0)==pdTRUE;
        if(hasPending) {JsonDocument doc;eventFrame(doc,pending);if(publish(client,EVENT_TOPIC,doc,false)) hasPending=false;else net.stop();}
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  Serial.begin(115200);
  randomId(bootId);
  dht.begin();
  for(int pin:INPUT_PINS) pinMode(pin,INPUT_PULLUP);
  eventQueue=xQueueCreate(32,sizeof(EdgeEvent));
  if(!eventQueue) {Serial.println("EVENT_QUEUE_FAILED");return;}
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("Wokwi-GUEST", "", 6);
  Serial.printf("KHOGUARD_M07 boot=%s core=%d.%d.%d; D07/D08 inputs simulated; count unverified; no door outputs\r\n",
                bootId, ESP_ARDUINO_VERSION_MAJOR, ESP_ARDUINO_VERSION_MINOR, ESP_ARDUINO_VERSION_PATCH);
  if (xTaskCreate(networkTask, "mqtt", 8192, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("MQTT_TASK_FAILED; sensor loop continues");
  }
}

void loop() {
  std::array<bool,7> raw;
  for(unsigned i=0;i<raw.size();i++) raw[i]=digitalRead(INPUT_PINS[i])==HIGH;
  const auto before=controller;
  portENTER_CRITICAL(&sampleLock);
  controller.update(raw,millis());
  const auto after=controller;
  portEXIT_CRITICAL(&sampleLock);
  for(unsigned door=0;door<2;door++) {
    const unsigned contact=door*3;
    const bool changed=before.inputs[contact].known && before.inputs[contact].value!=after.inputs[contact].value;
    const bool panic=!before.panic[door] && after.panic[door];
    if(changed || panic) {
      EdgeEvent event{++eventSeq,uint64_t(esp_timer_get_time()/1000),uint8_t(door),panic,after.inputs[contact].value};
      if(!eventQueue || xQueueSend(eventQueue,&event,0)!=pdTRUE) Serial.println("EVENT_GAP: local input still updated");
      Serial.printf("INPUT_EVENT door=D0%u panic=%d open=%d revision=%llu\r\n",door+7,panic,event.open,static_cast<unsigned long long>(after.revision));
    }
  }
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
