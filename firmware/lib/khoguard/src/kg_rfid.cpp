#include "kg_rfid.h"
#include <Arduino.h>
#include <MFRC522.h>
#include <SPI.h>
#include "config.h"
#include "kg_events.h"
#include "kg_state.h"

namespace kg {
namespace rfid {
namespace {
// RST is wired to 3V3 (no free GPIO), so the library uses a soft reset.
MFRC522 reader(config::RFID_SS_PIN, MFRC522::UNUSED_PIN);
bool readerReady = false;

// One accepted, duplicate or refused read: the controller decides, the event is queued and logged.
void record(const kg::RfidRead &read) {
  portENTER_CRITICAL(&state::sampleLock);
  const kg::ScanResult result=state::controller.scan(read.card,read.entering);
  const kg::Occupancy count=state::controller.occupancy;
  portEXIT_CRITICAL(&state::sampleLock);
  events::EdgeEvent event{};
  event.type=events::EventType::rfid;event.door=uint8_t(read.door);event.entering=read.entering;event.result=result;
  strncpy(event.card,read.cardId,sizeof(event.card)-1);
  events::enqueue(event);
  Serial.printf("RFID_EVENT door=%s card=%s dir=%s result=%d count=%lu verified=%d\r\n",config::DOOR_IDS[read.door],read.cardId,read.entering ? "in":"out",
                int(result),static_cast<unsigned long>(count.count),count.verified);
}

// Wokwi preset UID -> card ID of the controller's table; any other card is reported by UID and refused.
kg::RfidRead fromUid(const MFRC522::Uid &uid, bool entering) {
  kg::RfidRead read;
  read.door=config::RFID_DOOR;
  read.entering=entering;
  read.card=kg::CARDS.size();
  const char *known=nullptr;
  for (const auto &entry : config::RFID_CARDS) {
    if (uid.size==4 && memcmp(uid.uidByte,entry.uid,4)==0) known=entry.card;
  }
  if (known) {
    strncpy(read.cardId,known,sizeof(read.cardId)-1);
    for (unsigned i=0;i<kg::CARDS.size();i++) if (strcmp(kg::CARDS[i],known)==0) read.card=i;
  } else {
    char *out=read.cardId+snprintf(read.cardId,sizeof(read.cardId),"UID-");
    for (byte i=0;i<uid.size && i<10;i++) out+=snprintf(out,read.cardId+sizeof(read.cardId)-out,"%02X",uid.uidByte[i]);
  }
  return read;
}

void pollReader() {
  static uint32_t polledAt=0;
  if (!readerReady || millis()-polledAt<config::RFID_POLL_MS) return;
  polledAt=millis();
  // A tap is read once: the card is halted until it is presented again.
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;
  record(fromUid(reader.uid,digitalRead(config::RFID_DIRECTION_PIN)==HIGH));
  reader.PICC_HaltA();
}

// Non-blocking line reader; an overlong line may hide a scan, so the count stops being trusted.
void pollSerial() {
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
    record(read);
  }
}
}  // namespace

void begin() {
  pinMode(config::RFID_DIRECTION_PIN,INPUT);
  SPI.begin(config::RFID_SCK_PIN,config::RFID_MISO_PIN,config::RFID_MOSI_PIN,config::RFID_SS_PIN);
  reader.PCD_Init();
  const byte version=reader.PCD_ReadRegister(MFRC522::VersionReg);
  readerReady=version!=0x00 && version!=0xFF;
  Serial.printf("RFID_READER %s version=0x%02X door=%s; serial \"RFID D07 DEMO-017 IN\" still accepted\r\n",
                readerReady ? "ready":"missing",version,config::DOOR_IDS[config::RFID_DOOR]);
}

void poll() {
  pollReader();
  pollSerial();
}
}  // namespace rfid
}  // namespace kg
