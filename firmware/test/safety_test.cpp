#include <cassert>
#include <cstdio>
#include <cstring>
#include "../include/controller.h"
using kg::Reason;using kg::Action;using kg::Motion;using kg::DoorState;
// Slots: D07 contact(open) beam(clear) panic, D08 contact beam panic, presence.
using Raw=std::array<bool,7>;
constexpr Raw SAFE_CLOSED{{false,true,false,false,true,false,false}};
// Holds raw inputs past the 30 ms debounce, then runs the local rules once.
void settle(kg::Controller& c,Raw raw,uint32_t& now) {c.update(raw,now);now+=30;c.update(raw,now);c.tick(now);}
Raw with(Raw raw,unsigned slot,bool value) {raw[slot]=value;return raw;}
kg::Controller ready(uint32_t& now) {kg::Controller c;settle(c,SAFE_CLOSED,now);assert(c.occupancy.verified);return c;}

int main() {
  uint32_t now=1000;
  {
    // Close gate: every unsafe condition alone is enough to block.
    auto c=ready(now);
    settle(c,with(SAFE_CLOSED,0,true),now);
    assert(c.closeGate(0)==Reason::none);
    auto presence=c;settle(presence,with(with(SAFE_CLOSED,0,true),6,true),now);
    assert(presence.occupancy.count==0 && presence.closeGate(0)==Reason::PRESENCE_DETECTED);
    auto beam=c;settle(beam,with(with(SAFE_CLOSED,0,true),1,false),now);assert(beam.closeGate(0)==Reason::BEAM_BLOCKED);
    auto counted=c;assert(counted.scan(0,true)==kg::ScanResult::accepted);assert(counted.closeGate(0)==Reason::OCCUPIED);
    auto unverified=c;unverified.invalidateCount();assert(unverified.closeGate(0)==Reason::INPUT_UNKNOWN);
    kg::Controller fresh;fresh.update(with(SAFE_CLOSED,0,true),now);assert(fresh.closeGate(0)==Reason::INPUT_UNKNOWN);
    auto panic=c;settle(panic,with(with(SAFE_CLOSED,0,true),5,true),now);assert(panic.closeGate(0)==Reason::PANIC_ACTIVE);
    assert(c.request(0,Action::close,now)==Reason::none && c.motion[0]==Motion::closing && c.doorState(0)==DoorState::closing);
    assert(!c.locked(0));
    settle(c,SAFE_CLOSED,now);assert(c.motion[0]==Motion::idle && c.doorState(0)==DoorState::closed && c.locked(0));
    std::puts("M09 PASS: close gate blocks on count, presence, beam, unknown, unverified and panic");
  }
  {
    // Beam blocked or presence appearing while closing reverses the door.
    auto c=ready(now);settle(c,with(SAFE_CLOSED,0,true),now);
    const Raw open=with(SAFE_CLOSED,0,true);
    assert(c.request(0,Action::close,now)==Reason::none);
    const auto revision=c.revision;const auto reversals=c.reversals[0];
    settle(c,with(open,1,false),now);
    // Contact still reads open (not fully shut), so reversing ends straight back at open.
    assert(c.motion[0]==Motion::idle && c.doorState(0)==DoorState::open && c.reversals[0]==reversals+1 && c.revision>revision);
    assert(c.reversalReason[0]==Reason::BEAM_BLOCKED);
    settle(c,open,now);assert(c.request(0,Action::close,now)==Reason::none);settle(c,with(open,6,true),now);
    assert(c.motion[0]!=Motion::closing && c.reversals[0]==reversals+2); assert(c.reversalReason[0]==Reason::PRESENCE_DETECTED);
    // A door that never reaches its target stops and reports a local fault.
    auto stuck=ready(now);settle(stuck,open,now);assert(stuck.request(0,Action::close,now)==Reason::none);
    const auto faults=stuck.faults[0];now+=10001;stuck.tick(now);
    assert(stuck.motion[0]==Motion::idle && stuck.faults[0]==faults+1);
    std::puts("M09 PASS: beam/presence reversal while closing and travel timeout fault");
  }
  {
    // Panic from closed: latch, unlock both doors, open its door; ack is not a reset; reset needs a released button.
    auto c=ready(now);assert(c.locked(0) && c.locked(1));
    settle(c,with(SAFE_CLOSED,2,true),now);
    assert(c.panic[0] && c.motion[0]==Motion::opening && !c.locked(0) && !c.locked(1));
    auto out=c.outputs(now);assert(out.light && out.buzzer && out.heater && !out.fan && out.motorOpen[0]);
    assert(c.request(0,Action::reset_panic,now)==Reason::PANIC_ACTIVE && c.panic[0]);
    settle(c,with(with(SAFE_CLOSED,0,true),2,true),now);assert(c.motion[0]==Motion::idle);
    settle(c,with(SAFE_CLOSED,0,true),now);assert(c.panic[0]);
    assert(c.request(0,Action::close,now)==Reason::PANIC_ACTIVE);
    assert(c.request(0,Action::reset_panic,now)==Reason::none && !c.panic[0]);
    assert(c.closeGate(0)==Reason::none);
    // Panic on D08 opens D08 even while D07 is open: escape overrides interlock.
    auto both=ready(now);settle(both,with(SAFE_CLOSED,0,true),now);settle(both,with(with(SAFE_CLOSED,0,true),5,true),now);
    assert(both.motion[1]==Motion::opening);
    std::puts("M09 PASS: panic latch opens from closed, unlocks both, survives ack, resets only when released");
  }
  {
    // Interlock: normal mode never lets both doors open; two requests in a row, the second loses.
    auto c=ready(now);
    assert(c.request(0,Action::open,now)==Reason::none && c.motion[0]==Motion::opening);
    assert(c.request(1,Action::open,now)==Reason::INTERLOCK_ACTIVE && c.motion[1]==Motion::idle);
    settle(c,with(SAFE_CLOSED,0,true),now);
    assert(c.request(1,Action::open,now)==Reason::INTERLOCK_ACTIVE);
    kg::Controller unknown;unknown.update(SAFE_CLOSED,now);assert(unknown.request(0,Action::open,now)==Reason::INPUT_UNKNOWN);
    std::puts("M09 PASS: two-door interlock, concurrent requests and unknown inputs");
  }
  {
    // Local timers on a monotonic clock: 30 s warning, >60 s escalation, >5 min trapped person.
    auto c=ready(now);const uint32_t opened=now+30;settle(c,with(SAFE_CLOSED,0,true),now);
    auto at=[&](uint32_t ms){return c.alarms(opened+ms);};
    assert(!at(29999).doorWarning[0] && at(30000).doorWarning[0] && !at(60000).doorCritical[0] && at(60001).doorCritical[0]);
    assert(!c.outputs(opened+29999).light && c.outputs(opened+30000).light && !c.outputs(opened+60000).buzzer && c.outputs(opened+60001).buzzer);
    settle(c,SAFE_CLOSED,now);assert(!c.alarms(now+100000).doorWarning[0]);
    auto t=ready(now);const uint32_t seen=now+30;settle(t,with(SAFE_CLOSED,6,true),now);
    assert(!t.alarms(seen+300000).trapped && t.alarms(seen+300001).trapped && t.outputs(seen+300001).heater);
    settle(t,with(with(SAFE_CLOSED,6,true),0,true),now);assert(!t.alarms(now+400000).trapped);
    auto wrap=ready(now);uint32_t w=0xFFFFFF00u;settle(wrap,with(SAFE_CLOSED,0,true),w);
    assert(!wrap.alarms(w+29000).doorWarning[0] && wrap.alarms(w+30000).doorWarning[0]);
    std::puts("M11 PASS: door-open 30 s / >60 s, trapped >5 min, reset on close/clear, millis rollover");
  }
  {
    // Commands: session-bound, revision-checked, deduplicated by ID; a duplicate never runs twice.
    auto c=ready(now);
    kg::CommandIn cmd{};std::strcpy(cmd.id,"cmd-1");cmd.door=0;cmd.action=Action::open;cmd.expectedRevision=c.revision;cmd.sessionMatches=true;
    auto first=c.command(cmd,now);assert(first.reason==Reason::none && !first.duplicate && c.motion[0]==Motion::opening);
    settle(c,with(SAFE_CLOSED,0,true),now);
    auto again=c.command(cmd,now);assert(again.duplicate && again.reason==Reason::none);
    kg::CommandIn stale=cmd;std::strcpy(stale.id,"cmd-2");stale.expectedRevision=c.revision-1;stale.action=Action::close;
    assert(c.command(stale,now).reason==Reason::REVISION_MISMATCH && c.motion[0]==Motion::idle);
    kg::CommandIn old=stale;std::strcpy(old.id,"cmd-3");old.expectedRevision=c.revision;old.sessionMatches=false;
    assert(c.command(old,now).reason==Reason::COMMAND_EXPIRED && c.motion[0]==Motion::idle);
    kg::CommandIn ok=old;std::strcpy(ok.id,"cmd-4");ok.sessionMatches=true;
    assert(c.command(ok,now).reason==Reason::none && c.motion[0]==Motion::closing);
    assert(std::strcmp(kg::reasonName(Reason::INTERLOCK_ACTIVE),"INTERLOCK_ACTIVE")==0);
    for(int i=5;i<20;i++) {kg::CommandIn n=ok;std::snprintf(n.id,sizeof(n.id),"cmd-%d",i);n.expectedRevision=0;c.command(n,now);}
    assert(c.command(cmd,now).duplicate==false);
    std::puts("M10 PASS: command dedupe, revision mismatch, stale session and bounded command memory");
  }
}
