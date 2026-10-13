#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <MQTT.h>
#include <WiFi.h>
#include <esp_timer.h>
#include <esp_arduino_version.h>
#include "kg_secrets.h"
// kg_secrets.h defines MQTT_CA_CERT after infra:tls:setup + firmware:prepare.
#ifdef MQTT_CA_CERT
#include <WiFiClientSecure.h>
#endif
#include "controller.h"

constexpr char TELEMETRY_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/telemetry";
constexpr char STATUS_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/status";
constexpr char EVENT_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/events";
constexpr char COMMAND_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/commands";
constexpr char ACK_TOPIC[] = "khoguard/v1/WH01/devices/ESP-C01/acks";
constexpr int INPUT_PINS[] = {16,17,18,19,21,22,23};
// LEDs: lock D07/D08, motor open/close D07, motor open/close D08, light, buzzer, heater, fan.
constexpr int OUTPUT_PINS[] = {25,26,27,14,2,13,32,33,4,5};
kg::Controller controller;
enum class EventType : uint8_t {door,panic,rfid};
struct EdgeEvent {uint64_t seq,uptime;EventType type;uint8_t door;bool open;char card[33];bool entering;kg::ScanResult result;kg::Reason reason;bool reversal;};
// Acks are queued from the MQTT callback and published from the network loop, never inside the callback.
struct PendingAck {char id[65];uint8_t door;kg::Reason reason;};
PendingAck acks[4];
unsigned ackCount=0;
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
  // Unverified count is never published as a number, so 0 cannot be mistaken for an empty room.
  if(c.occupancy.verified) payload["occupancy"]["current_occupants"] = c.occupancy.count;
  else payload["occupancy"]["current_occupants"] = nullptr;
  payload["occupancy"]["count_verified"] = c.occupancy.verified;
  if(c.inputs[6].known) payload["occupancy"]["presence"] = c.inputs[6].value;
  else payload["occupancy"]["presence"] = nullptr;
  const uint32_t now=millis();
  const kg::Alarms alarms=c.alarms(now);
  const kg::Outputs outputs=c.outputs(now);
  JsonArray doors = payload["doors"].to<JsonArray>();
  unsigned index=0;
  for (const char *id : {"D07", "D08"}) {
    JsonObject door = doors.add<JsonObject>();
    door["door_id"] = id;
    static const char* const states[]={"unknown","open","closed","opening","closing"};
    door["state"] = states[static_cast<uint8_t>(c.doorState(index))];
    door["locked"] = c.locked(index);
    if(c.openTiming[index]) door["open_ms"] = uint32_t(now-c.openSince[index]);
    if(c.inputs[index*3+1].known) door["beam_clear"] = c.inputs[index*3+1].value;
    else door["beam_clear"] = nullptr;
    if(c.inputs[index*3+2].known) door["panic_latched"] = c.panic[index];
    else door["panic_latched"] = nullptr;
    door["local_inputs_healthy"] = c.healthy(index);
    index++;
  }
  JsonArray active = payload["alarms"].to<JsonArray>();
  for(unsigned d=0;d<2;d++) {
    const char* id=d==0 ? "D07":"D08";
    if(alarms.doorCritical[d]) {JsonObject a=active.add<JsonObject>();a["code"]="DOOR_OPEN_CRITICAL";a["door_id"]=id;}
    else if(alarms.doorWarning[d]) {JsonObject a=active.add<JsonObject>();a["code"]="DOOR_OPEN_WARNING";a["door_id"]=id;}
  }
  if(alarms.trapped) active.add<JsonObject>()["code"]="TRAPPED_PERSON";
  payload["outputs"]["light"]=outputs.light;
  payload["outputs"]["buzzer"]=outputs.buzzer;
  payload["outputs"]["heater"]=outputs.heater;
  payload["outputs"]["fan"]=outputs.fan;
}

void eventFrame(JsonDocument &doc,const EdgeEvent &event) {
  envelope(doc,"events",event.seq);
  doc["uptime_ms"]=event.uptime;
  char id[64];snprintf(id,sizeof(id),"%s:%llu",bootId,static_cast<unsigned long long>(event.seq));doc["event_id"]=id;
  auto payload=doc["payload"].as<JsonObject>();
  payload["door_id"]=event.door==0 ? "D07":"D08";
  if(event.type==EventType::rfid) {
    payload["event_type"]="rfid";
    payload["card_id"]=event.card;
    payload["direction"]=event.entering ? "in":"out";
    payload["result"]=event.result==kg::ScanResult::accepted ? "accepted":event.result==kg::ScanResult::duplicate ? "duplicate":"unauthorized";
  } else if(event.type==EventType::panic) {
    payload["event_type"]="panic";
    payload["input"]="panic_high";
  } else {
    payload["event_type"]="door";
    // Reversal and travel faults reuse door events with the local reason code.
    if(event.reversal) payload["state"]="opening";
    else if(event.reason==kg::Reason::LOCAL_INPUT_FAILURE) payload["state"]="unknown";
    else payload["state"]=event.open ? "open":"closed";
    if(event.reason!=kg::Reason::none) payload["reason"]=kg::reasonName(event.reason);
  }
}

bool token(const char* value) {
  const size_t length=value ? strlen(value):0;
  if(!length || length>64) return false;
  for(size_t i=0;i<length;i++) if(!(isalnum(static_cast<unsigned char>(value[i])) || strchr(":_-",value[i]))) return false;
  return true;
}

// Commands only run when addressed to this boot/session and the current controller revision; the edge gate decides.
void onCommand(String &topic, String &raw) {
  if(topic!=COMMAND_TOPIC || ackCount>=4) return;
  JsonDocument doc;
  if(deserializeJson(doc,raw) || doc["device_id"]!="ESP-C01" || doc["kind"]!="commands") return;
  JsonObject p=doc["payload"].as<JsonObject>();
  const char* id=p["command_id"];const char* door=p["door_id"];const char* action=p["action"];
  if(!token(id) || !door || !action || !p["expected_revision"].is<uint64_t>()) {Serial.println("COMMAND_IGNORED: malformed");return;}
  kg::CommandIn in{};
  strncpy(in.id,id,64);
  if(strcmp(door,"D07")==0) in.door=0; else if(strcmp(door,"D08")==0) in.door=1; else return;
  if(strcmp(action,"open")==0) in.action=kg::Action::open;
  else if(strcmp(action,"close")==0) in.action=kg::Action::close;
  else if(strcmp(action,"reset_panic")==0) in.action=kg::Action::reset_panic;
  else return;
  in.expectedRevision=p["expected_revision"].as<uint64_t>();
  in.sessionMatches=doc["boot_id"]==bootId && doc["session_id"]==sessionId;
  portENTER_CRITICAL(&sampleLock);
  const kg::CommandOut out=controller.command(in,millis());
  portEXIT_CRITICAL(&sampleLock);
  PendingAck &ack=acks[ackCount++];
  strncpy(ack.id,id,64);ack.id[64]='\0';ack.door=uint8_t(in.door);ack.reason=out.reason;
  Serial.printf("COMMAND %s %s %s -> %s%s\r\n",id,door,action,out.reason==kg::Reason::none ? "applied":kg::reasonName(out.reason),out.duplicate ? " (duplicate, not re-run)":"");
}

void ackFrame(JsonDocument &doc,const PendingAck &ack,uint64_t seq) {
  envelope(doc,"acks",seq);
  JsonObject p=doc["payload"].as<JsonObject>();
  p["door_id"]=ack.door==0 ? "D07":"D08";
  p["command_id"]=ack.id;
  if(ack.reason==kg::Reason::none) {p["status"]="applied";p["reason"]=nullptr;}
  else {p["status"]=ack.reason==kg::Reason::COMMAND_EXPIRED ? "expired":"rejected";p["reason"]=kg::reasonName(ack.reason);}
}

// QoS1 waits for PUBACK in this task; sensor/heartbeat loop runs independently.
void networkTask(void *) {
#ifdef MQTT_CA_CERT
  // M12: verify broker certificate chain and hostname host.wokwi.internal against the pinned demo CA; never setInsecure().
  WiFiClientSecure net;
  net.setCACert(MQTT_CA_CERT);
  net.setHandshakeTimeout(5);
#else
  WiFiClient net;
#endif
  MQTTClient client(4096);
  client.begin(MQTT_HOST, MQTT_PORT, net);
  client.setOptions(10, true, 1000);
  client.onMessage(onCommand);
  uint64_t telemetrySeq = 0, statusSeq = 0, ackSeq = 0;
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
          // Clean session: commands queued for an older session are never delivered after reconnect.
          ackCount=0;
          if (!publish(client, STATUS_TOPIC, online) || !client.subscribe(COMMAND_TOPIC, 1)) net.stop();
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
      while(client.connected() && ackCount) {
        JsonDocument doc;ackFrame(doc,acks[0],++ackSeq);
        if(!publish(client,ACK_TOPIC,doc,false)) {net.stop();break;}
        for(unsigned i=1;i<ackCount;i++) acks[i-1]=acks[i];
        ackCount--;
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
  for(int pin:OUTPUT_PINS) {pinMode(pin,OUTPUT);digitalWrite(pin,LOW);}
  eventQueue=xQueueCreate(32,sizeof(EdgeEvent));
  if(!eventQueue) {Serial.println("EVENT_QUEUE_FAILED");return;}
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("Wokwi-GUEST", "", 6);
#ifdef MQTT_CA_CERT
  constexpr char TRANSPORT[]="mqtts:18885 CA-verified";constexpr uint32_t NETWORK_STACK=12288; // mbedTLS handshake needs more stack
#else
  constexpr char TRANSPORT[]="mqtt:18884 localhost-only";constexpr uint32_t NETWORK_STACK=8192;
#endif
  Serial.printf("KHOGUARD_M12 boot=%s core=%d.%d.%d transport=%s; local interlock/panic/timers active; RFID via serial \"RFID D07 DEMO-017 IN\"; outputs are LEDs\r\n",
                bootId, ESP_ARDUINO_VERSION_MAJOR, ESP_ARDUINO_VERSION_MINOR, ESP_ARDUINO_VERSION_PATCH, TRANSPORT);
  if (xTaskCreate(networkTask, "mqtt", NETWORK_STACK, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("MQTT_TASK_FAILED; sensor loop continues");
  }
}

void enqueue(EdgeEvent &event) {
  event.seq=++eventSeq;event.uptime=uint64_t(esp_timer_get_time()/1000);
  if(!eventQueue || xQueueSend(eventQueue,&event,0)!=pdTRUE) Serial.println("EVENT_GAP: local state still updated");
}

// Non-blocking line reader; an overlong line may hide a scan, so the count stops being trusted.
void readRfid() {
  static char line[64];
  static unsigned length=0;
  static bool overflow=false;
  while(Serial.available()) {
    const char c=char(Serial.read());
    if(c!='\r' && c!='\n') {
      if(length<sizeof(line)-1) line[length++]=c; else overflow=true;
      continue;
    }
    if(!length && !overflow) continue;
    line[length]='\0';length=0;
    if(overflow) {
      overflow=false;
      portENTER_CRITICAL(&sampleLock);controller.invalidateCount();portEXIT_CRITICAL(&sampleLock);
      Serial.println("RFID_LINE_DROPPED: count unverified until presence clear and no card inside");
      continue;
    }
    kg::RfidRead read;
    if(!kg::parseRfid(line,read)) {Serial.println("RFID_FORMAT: use RFID D07|D08 <card> IN|OUT");continue;}
    portENTER_CRITICAL(&sampleLock);
    const kg::ScanResult result=controller.scan(read.card,read.entering);
    const kg::Occupancy count=controller.occupancy;
    portEXIT_CRITICAL(&sampleLock);
    EdgeEvent event{};
    event.type=EventType::rfid;event.door=uint8_t(read.door);event.entering=read.entering;event.result=result;
    strncpy(event.card,read.cardId,sizeof(event.card)-1);
    enqueue(event);
    Serial.printf("RFID_EVENT door=D0%u card=%s dir=%s result=%d count=%lu verified=%d\r\n",read.door+7,read.cardId,read.entering ? "in":"out",
                  int(result),static_cast<unsigned long>(count.count),count.verified);
  }
}

void loop() {
  std::array<bool,7> raw;
  for(unsigned i=0;i<raw.size();i++) raw[i]=digitalRead(INPUT_PINS[i])==HIGH;
  portENTER_CRITICAL(&sampleLock);
  const auto before=controller;
  const uint32_t now=millis();
  controller.update(raw,now);
  controller.tick(now);
  const auto after=controller;
  portEXIT_CRITICAL(&sampleLock);
  // Outputs follow local rules only; broker/backend loss never changes them.
  const kg::Outputs out=after.outputs(now);
  const bool levels[]={out.lock[0],out.lock[1],out.motorOpen[0],out.motorClose[0],out.motorOpen[1],out.motorClose[1],out.light,out.buzzer,out.heater,out.fan};
  for(unsigned i=0;i<10;i++) digitalWrite(OUTPUT_PINS[i],levels[i] ? HIGH:LOW);
  for(unsigned door=0;door<2;door++) {
    const unsigned contact=door*3;
    const bool changed=before.inputs[contact].known && before.inputs[contact].value!=after.inputs[contact].value;
    const bool panic=!before.panic[door] && after.panic[door];
    for(const bool isPanic:{false,true}) {
      if(isPanic ? !panic : !changed) continue;
      EdgeEvent event{};
      event.type=isPanic ? EventType::panic:EventType::door;event.door=uint8_t(door);event.open=after.inputs[contact].value;
      enqueue(event);
      Serial.printf("INPUT_EVENT door=D0%u panic=%d open=%d revision=%llu\r\n",door+7,isPanic,event.open,static_cast<unsigned long long>(after.revision));
    }
    for(const bool fault:{false,true}) {
      if(fault ? after.faults[door]==before.faults[door] : after.reversals[door]==before.reversals[door]) continue;
      EdgeEvent event{};event.type=EventType::door;event.door=uint8_t(door);event.reversal=!fault;
      event.reason=fault ? kg::Reason::LOCAL_INPUT_FAILURE:after.reversalReason[door];
      enqueue(event);
      Serial.printf("SAFETY_EVENT door=D0%u %s %s\r\n",door+7,fault ? "travel timeout":"closing reversed",kg::reasonName(event.reason));
    }
  }
  readRfid();
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
