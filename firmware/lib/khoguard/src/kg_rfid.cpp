#include "kg_rfid.h"
#include <Arduino.h>
#include "kg_events.h"
#include "kg_state.h"

namespace kg {
namespace rfid {
// Non-blocking line reader; an overlong line may hide a scan, so the count stops being trusted.
void poll() {
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
      portENTER_CRITICAL(&state::sampleLock);state::controller.invalidateCount();portEXIT_CRITICAL(&state::sampleLock);
      Serial.println("RFID_LINE_DROPPED: count unverified until presence clear and no card inside");
      continue;
    }
    kg::RfidRead read;
    if(!kg::parseRfid(line,read)) {Serial.println("RFID_FORMAT: use RFID D07|D08 <card> IN|OUT");continue;}
    portENTER_CRITICAL(&state::sampleLock);
    const kg::ScanResult result=state::controller.scan(read.card,read.entering);
    const kg::Occupancy count=state::controller.occupancy;
    portEXIT_CRITICAL(&state::sampleLock);
    events::EdgeEvent event{};
    event.type=events::EventType::rfid;event.door=uint8_t(read.door);event.entering=read.entering;event.result=result;
    strncpy(event.card,read.cardId,sizeof(event.card)-1);
    events::enqueue(event);
    Serial.printf("RFID_EVENT door=D0%u card=%s dir=%s result=%d count=%lu verified=%d\r\n",read.door+7,read.cardId,read.entering ? "in":"out",
                  int(result),static_cast<unsigned long>(count.count),count.verified);
  }
}
}  // namespace rfid
}  // namespace kg
