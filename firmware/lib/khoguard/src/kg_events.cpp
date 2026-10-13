#include "kg_events.h"
#include <esp_timer.h>

namespace kg {
namespace events {
namespace {
QueueHandle_t eventQueue;
uint64_t eventSeq=0;
}

bool begin() {
  eventQueue=xQueueCreate(32,sizeof(EdgeEvent));
  if(!eventQueue) {Serial.println("EVENT_QUEUE_FAILED");return false;}
  return true;
}

void enqueue(EdgeEvent &event) {
  event.seq=++eventSeq;event.uptime=uint64_t(esp_timer_get_time()/1000);
  if(!eventQueue || xQueueSend(eventQueue,&event,0)!=pdTRUE) Serial.println("EVENT_GAP: local state still updated");
}

bool next(EdgeEvent &event) {
  return xQueueReceive(eventQueue,&event,0)==pdTRUE;
}

void reportChanges(const kg::Controller &before, const kg::Controller &after) {
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
}
}  // namespace events
}  // namespace kg
