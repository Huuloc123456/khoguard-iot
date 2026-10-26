#pragma once
#include <cstdint>
#include <array>
#include <cstring>
#include <cctype>
#include "config.h"
namespace kg {
struct Input {
  bool known=false,value=false,candidate=false,started=false;
  uint32_t changedAt=0;
  bool update(bool raw,uint32_t now) {
    if(!started || raw!=candidate) {started=true;candidate=raw;changedAt=now;}
    if(uint32_t(now-changedAt)<config::INPUT_DEBOUNCE_MS || (known && value==candidate)) return false;
    value=candidate;known=true;return true;
  }
};
enum class ScanResult {accepted,duplicate,unauthorized};
// Demo whitelist replaces WMS: the last card is known but not authorized.
constexpr std::array<const char*,3> CARDS{{"DEMO-017","DEMO-018","DEMO-999"}};
constexpr std::array<bool,3> AUTHORIZED{{true,true,false}};
struct Occupancy {
  bool verified=false;
  uint32_t count=0;
  std::array<bool,CARDS.size()> inside{};
  // Empty room is only confirmed when presence is clear and no authorized card is logged inside.
  bool reconcile(bool presenceClear) {
    if(verified || !presenceClear) return false;
    for(bool in:inside) if(in) return false;
    verified=true;count=0;return true;
  }
  // Per-card direction state rejects repeated reads and an exit without entry, so count never underflows.
  ScanResult scan(unsigned card,bool entering) {
    if(card>=CARDS.size() || !AUTHORIZED[card]) return ScanResult::unauthorized;
    if(inside[card]==entering) return ScanResult::duplicate;
    inside[card]=entering;
    if(entering) count++; else count--;
    return ScanResult::accepted;
  }
  void invalidate() {verified=false;}
};
inline bool countAllowsClose(const Occupancy& o,bool presence) {return o.verified && o.count==0 && !presence;}
struct RfidRead {unsigned door=0,card=0;bool entering=false;char cardId[33]{};};
// The Wokwi MFRC522 is the interactive reader; this serial form remains for scripted tests.
inline bool parseRfid(const char* line,RfidRead& out) {
  char words[4][34];unsigned count=0,length=0;
  for(const char* c=line;;c++) {
    if(*c==' ' || *c=='\0') {
      if(length) {if(count==4) return false;words[count++][length]='\0';length=0;}
      if(*c=='\0') break;
      continue;
    }
    if(count==4 || length==33 || !(std::isalnum(static_cast<unsigned char>(*c)) || *c=='-' || *c=='_' || *c==':')) return false;
    words[count][length++]=static_cast<char>(std::toupper(static_cast<unsigned char>(*c)));
  }
  if(count!=4 || std::strcmp(words[0],"RFID")!=0 || std::strlen(words[2])>32) return false;
  RfidRead read;
  if(std::strcmp(words[1],"D07")==0) read.door=0; else if(std::strcmp(words[1],"D08")==0) read.door=1; else return false;
  if(std::strcmp(words[3],"IN")==0) read.entering=true; else if(std::strcmp(words[3],"OUT")!=0) return false;
  read.card=CARDS.size();
  for(unsigned i=0;i<CARDS.size();i++) if(std::strcmp(words[2],CARDS[i])==0) read.card=i;
  std::strcpy(read.cardId,words[2]);
  out=read;return true;
}
// Reason codes match contracts/mqtt.schema.json; none means allowed.
enum class Reason : uint8_t {none,OCCUPIED,PRESENCE_DETECTED,BEAM_BLOCKED,PANIC_ACTIVE,INPUT_UNKNOWN,INTERLOCK_ACTIVE,STALE_DATA,REVISION_MISMATCH,COMMAND_EXPIRED,NOT_AUTHORIZED,LOCAL_INPUT_FAILURE};
inline const char* reasonName(Reason r) {
  static const char* const names[]={"","OCCUPIED","PRESENCE_DETECTED","BEAM_BLOCKED","PANIC_ACTIVE","INPUT_UNKNOWN","INTERLOCK_ACTIVE","STALE_DATA","REVISION_MISMATCH","COMMAND_EXPIRED","NOT_AUTHORIZED","LOCAL_INPUT_FAILURE"};
  return names[static_cast<uint8_t>(r)];
}
enum class Action : uint8_t {open,close,reset_panic};
enum class Motion : uint8_t {idle,opening,closing};
enum class DoorState : uint8_t {unknown,open,closed,opening,closing};
// Demo thresholds (Agent.md 8.2); all intervals use wrapping uint32 millis differences.
constexpr uint32_t DOOR_WARNING_MS=30000,DOOR_CRITICAL_MS=60000,TRAPPED_MS=300000,TRAVEL_TIMEOUT_MS=10000;
struct Alarms {std::array<bool,2> doorWarning{{false,false}},doorCritical{{false,false}};bool trapped=false;};
struct Outputs {std::array<bool,2> lock{{false,false}},motorOpen{{false,false}},motorClose{{false,false}};bool light=false,buzzer=false,heater=false,fan=false;};
struct CommandIn {char id[65];unsigned door;Action action;uint64_t expectedRevision;bool sessionMatches;};
struct CommandOut {Reason reason=Reason::none;bool duplicate=false;};
// Remembers the last results so a QoS1 redelivery returns the same ack without running again.
struct CommandLog {
  std::array<std::array<char,65>,8> ids{};
  std::array<CommandOut,8> results{};
  unsigned next=0;
  const CommandOut* find(const char* id) const {
    for(unsigned i=0;i<ids.size();i++) if(ids[i][0] && std::strcmp(ids[i].data(),id)==0) return &results[i];
    return nullptr;
  }
  void remember(const char* id,CommandOut out) {
    std::strncpy(ids[next].data(),id,64);ids[next][64]='\0';results[next]=out;next=(next+1)%ids.size();
  }
};
struct Controller {
  // Per door: contact(open), beam(clear), panic(active); then shared presence.
  std::array<Input,7> inputs;
  std::array<bool,2> panic{{false,false}};
  Occupancy occupancy;
  uint64_t revision=0;
  bool update(const std::array<bool,7>& raw,uint32_t now) {
    bool changed=false;
    for(unsigned i=0;i<inputs.size();i++) changed=inputs[i].update(raw[i],now)||changed;
    for(unsigned d=0;d<2;d++) if(inputs[d*3+2].known && inputs[d*3+2].value) panic[d]=true;
    if(inputs[6].known) changed=occupancy.reconcile(!inputs[6].value)||changed;
    if(changed) revision++;
    return changed;
  }
  ScanResult scan(unsigned card,bool entering) {
    const ScanResult result=occupancy.scan(card,entering);
    if(result==ScanResult::accepted) revision++;
    return result;
  }
  void invalidateCount() {if(occupancy.verified) {occupancy.invalidate();revision++;}}
  bool healthy(unsigned door) const {
    return door<2 && inputs[door*3].known && inputs[door*3+1].known && inputs[door*3+2].known;
  }
  // M09 local safety state.
  std::array<Motion,2> motion{{Motion::idle,Motion::idle}};
  std::array<uint32_t,2> motionAt{{0,0}},openSince{{0,0}},reversals{{0,0}},faults{{0,0}};
  std::array<bool,2> openTiming{{false,false}};
  std::array<Reason,2> reversalReason{{Reason::none,Reason::none}};
  bool trappedTiming=false;
  uint32_t trappedSince=0;
  CommandLog commands;
  bool anyPanic() const {return panic[0] || panic[1];}
  bool contactKnown(unsigned d) const {return inputs[d*3].known;}
  bool isOpen(unsigned d) const {return inputs[d*3].known && inputs[d*3].value;}
  bool isClosed(unsigned d) const {return inputs[d*3].known && !inputs[d*3].value;}
  Reason closeGate(unsigned d) const {
    if(anyPanic()) return Reason::PANIC_ACTIVE;
    if(!healthy(d) || !inputs[6].known || !occupancy.verified) return Reason::INPUT_UNKNOWN;
    if(occupancy.count>0) return Reason::OCCUPIED;
    if(inputs[6].value) return Reason::PRESENCE_DETECTED;
    if(!inputs[d*3+1].value) return Reason::BEAM_BLOCKED;
    return Reason::none;
  }
  Reason openGate(unsigned d) const {
    if(!contactKnown(d)) return Reason::INPUT_UNKNOWN;
    if(anyPanic()) return Reason::none;
    const unsigned other=1-d;
    if(!(isClosed(other) && motion[other]==Motion::idle)) return Reason::INTERLOCK_ACTIVE;
    return Reason::none;
  }
  void move(unsigned d,Motion m,uint32_t now) {if(motion[d]!=m) {motion[d]=m;motionAt[d]=now;revision++;}}
  Reason request(unsigned d,Action action,uint32_t now) {
    if(d>1) return Reason::INPUT_UNKNOWN;
    if(action==Action::reset_panic) {
      if(!panic[d]) return Reason::none;
      if(!inputs[d*3+2].known || inputs[d*3+2].value) return Reason::PANIC_ACTIVE;
      panic[d]=false;revision++;return Reason::none;
    }
    const bool opening=action==Action::open;
    const Reason gate=opening ? openGate(d):closeGate(d);
    if(gate!=Reason::none) return gate;
    if(opening ? isOpen(d):isClosed(d)) {move(d,Motion::idle,now);return Reason::none;}
    move(d,opening ? Motion::opening:Motion::closing,now);
    return Reason::none;
  }
  // Call after update(): panic, reversal, travel completion/timeout and local timers. No network needed.
  void tick(uint32_t now) {
    for(unsigned d=0;d<2;d++) {
      if(panic[d] && !isOpen(d)) move(d,Motion::opening,now);
      if(motion[d]==Motion::closing) {
        const Reason unsafe=closeGate(d);
        if(unsafe!=Reason::none) {move(d,Motion::opening,now);reversals[d]++;reversalReason[d]=unsafe;}
      }
      if((motion[d]==Motion::opening && isOpen(d)) || (motion[d]==Motion::closing && isClosed(d))) move(d,Motion::idle,now);
      if(motion[d]!=Motion::idle && uint32_t(now-motionAt[d])>TRAVEL_TIMEOUT_MS) {move(d,Motion::idle,now);faults[d]++;}
      if(isOpen(d)) {if(!openTiming[d]) {openTiming[d]=true;openSince[d]=now;}}
      else openTiming[d]=false;
    }
    const bool trapped=inputs[6].known && inputs[6].value && isClosed(0) && isClosed(1);
    if(trapped && !trappedTiming) trappedSince=now;
    trappedTiming=trapped;
  }
  DoorState doorState(unsigned d) const {
    if(!contactKnown(d)) return DoorState::unknown;
    if(motion[d]==Motion::opening && !isOpen(d)) return DoorState::opening;
    if(motion[d]==Motion::closing && !isClosed(d)) return DoorState::closing;
    return isOpen(d) ? DoorState::open:DoorState::closed;
  }
  // Any panic unlocks both doors for escape; a moving door is never locked.
  bool locked(unsigned d) const {return isClosed(d) && motion[d]==Motion::idle && !anyPanic();}
  Alarms alarms(uint32_t now) const {
    Alarms a;
    for(unsigned d=0;d<2;d++) if(openTiming[d]) {
      const uint32_t open=now-openSince[d];
      a.doorWarning[d]=open>=DOOR_WARNING_MS;a.doorCritical[d]=open>DOOR_CRITICAL_MS;
    }
    a.trapped=trappedTiming && uint32_t(now-trappedSince)>TRAPPED_MS;
    return a;
  }
  // Model assumption: emergency lights/buzzer/heater on for panic or trapped person; fan paused so nobody is chilled further.
  Outputs outputs(uint32_t now) const {
    const Alarms a=alarms(now);Outputs o;
    const bool emergency=anyPanic() || a.trapped;
    for(unsigned d=0;d<2;d++) {o.lock[d]=locked(d);o.motorOpen[d]=motion[d]==Motion::opening;o.motorClose[d]=motion[d]==Motion::closing;}
    o.light=emergency || a.doorWarning[0] || a.doorWarning[1];
    o.buzzer=emergency || a.doorCritical[0] || a.doorCritical[1];
    o.heater=emergency;o.fan=!emergency;
    return o;
  }
  CommandOut command(const CommandIn& in,uint32_t now) {
    if(const CommandOut* seen=commands.find(in.id)) {CommandOut again=*seen;again.duplicate=true;return again;}
    CommandOut out;
    if(!in.sessionMatches) out.reason=Reason::COMMAND_EXPIRED;
    else if(in.expectedRevision!=revision) out.reason=Reason::REVISION_MISMATCH;
    else out.reason=request(in.door,in.action,now);
    commands.remember(in.id,out);
    return out;
  }
};
}
