#include "kg_commands.h"
#include <ArduinoJson.h>
#include "kg_messages.h"
#include "kg_state.h"

namespace kg {
namespace commands {
namespace {
PendingAck acks[4];
unsigned ackCount=0;

bool token(const char* value) {
  const size_t length=value ? strlen(value):0;
  if(!length || length>64) return false;
  for(size_t i=0;i<length;i++) if(!(isalnum(static_cast<unsigned char>(value[i])) || strchr(":_-",value[i]))) return false;
  return true;
}
}  // namespace

// Commands only run when addressed to this boot/session and the current controller revision; the edge gate decides.
void onMessage(String &topic, String &raw) {
  if(topic!=config::TOPIC_COMMANDS || ackCount>=4) return;
  JsonDocument doc;
  if(deserializeJson(doc,raw) || doc["device_id"]!=config::DEVICE_ID || doc["kind"]!="commands") return;
  JsonObject p=doc["payload"].as<JsonObject>();
  const char* id=p["command_id"];const char* door=p["door_id"];const char* action=p["action"];
  if(!token(id) || !door || !action || !p["expected_revision"].is<uint64_t>()) {Serial.println("COMMAND_IGNORED: malformed");return;}
  kg::CommandIn in{};
  strncpy(in.id,id,64);
  if(strcmp(door,config::DOOR_IDS[0])==0) in.door=0; else if(strcmp(door,config::DOOR_IDS[1])==0) in.door=1; else return;
  if(strcmp(action,"open")==0) in.action=kg::Action::open;
  else if(strcmp(action,"close")==0) in.action=kg::Action::close;
  else if(strcmp(action,"reset_panic")==0) in.action=kg::Action::reset_panic;
  else return;
  in.expectedRevision=p["expected_revision"].as<uint64_t>();
  in.sessionMatches=doc["boot_id"]==state::bootId && doc["session_id"]==state::sessionId;
  portENTER_CRITICAL(&state::sampleLock);
  const kg::CommandOut out=state::controller.command(in,millis());
  portEXIT_CRITICAL(&state::sampleLock);
  PendingAck &ack=acks[ackCount++];
  strncpy(ack.id,id,64);ack.id[64]='\0';ack.door=uint8_t(in.door);ack.reason=out.reason;
  Serial.printf("COMMAND %s %s %s -> %s%s\r\n",id,door,action,out.reason==kg::Reason::none ? "applied":kg::reasonName(out.reason),out.duplicate ? " (duplicate, not re-run)":"");
}

void clear() {
  ackCount=0;
}

const PendingAck *front() {
  return ackCount ? &acks[0] : nullptr;
}

void pop() {
  for(unsigned i=1;i<ackCount;i++) acks[i-1]=acks[i];
  ackCount--;
}
}  // namespace commands
}  // namespace kg
