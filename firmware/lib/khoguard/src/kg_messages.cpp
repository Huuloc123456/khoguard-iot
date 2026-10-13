#include "kg_messages.h"
#include <esp_timer.h>
#include "kg_state.h"

namespace kg {
namespace messages {
void envelope(JsonDocument &doc, const char *kind, uint64_t seq, bool will) {
  doc["schema_version"] = 1;
  doc["warehouse_id"] = "WH01";
  doc["device_id"] = "ESP-C01";
  doc["boot_id"] = state::bootId;
  doc["session_id"] = state::sessionId;
  doc["seq"] = seq;
  doc["kind"] = kind;
  // shortcut: M03 has no clock sync or remote commands; add verified NTP before accepting commands.
  doc["clock_synced"] = false;
  doc["sent_at"] = nullptr;
  doc["uptime_ms"] = will ? uint64_t(0) : uint64_t(esp_timer_get_time() / 1000);
  doc["payload"]["zone_id"] = "C";
}

void telemetry(JsonDocument &doc, uint64_t seq) {
  envelope(doc, "telemetry", seq);
  float t, h;
  uint32_t at;
  kg::Controller c;
  portENTER_CRITICAL(&state::sampleLock);
  t = state::temperature;
  h = state::humidity;
  at = state::sampleAt;
  c = state::controller;
  portEXIT_CRITICAL(&state::sampleLock);
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

void eventFrame(JsonDocument &doc, const events::EdgeEvent &event) {
  envelope(doc,"events",event.seq);
  doc["uptime_ms"]=event.uptime;
  char id[64];snprintf(id,sizeof(id),"%s:%llu",state::bootId,static_cast<unsigned long long>(event.seq));doc["event_id"]=id;
  auto payload=doc["payload"].as<JsonObject>();
  payload["door_id"]=event.door==0 ? "D07":"D08";
  if(event.type==events::EventType::rfid) {
    payload["event_type"]="rfid";
    payload["card_id"]=event.card;
    payload["direction"]=event.entering ? "in":"out";
    payload["result"]=event.result==kg::ScanResult::accepted ? "accepted":event.result==kg::ScanResult::duplicate ? "duplicate":"unauthorized";
  } else if(event.type==events::EventType::panic) {
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

void ackFrame(JsonDocument &doc, const commands::PendingAck &ack, uint64_t seq) {
  envelope(doc,"acks",seq);
  JsonObject p=doc["payload"].as<JsonObject>();
  p["door_id"]=ack.door==0 ? "D07":"D08";
  p["command_id"]=ack.id;
  if(ack.reason==kg::Reason::none) {p["status"]="applied";p["reason"]=nullptr;}
  else {p["status"]=ack.reason==kg::Reason::COMMAND_EXPIRED ? "expired":"rejected";p["reason"]=kg::reasonName(ack.reason);}
}
}  // namespace messages
}  // namespace kg
