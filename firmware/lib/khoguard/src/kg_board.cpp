#include "kg_board.h"
#include <Arduino.h>

namespace kg {
namespace board {
void begin() {
  for(int pin:INPUT_PINS) pinMode(pin,INPUT_PULLUP);
  for(int pin:OUTPUT_PINS) {pinMode(pin,OUTPUT);digitalWrite(pin,LOW);}
}

std::array<bool,7> readInputs() {
  std::array<bool,7> raw;
  for(unsigned i=0;i<raw.size();i++) raw[i]=digitalRead(INPUT_PINS[i])==HIGH;
  return raw;
}

void writeOutputs(const kg::Outputs &out, uint32_t now) {
  const bool levels[]={out.lock[0],out.lock[1],out.motorOpen[0],out.motorClose[0],out.motorOpen[1],out.motorClose[1],out.light,out.buzzer,out.heater,out.fan};
  for(unsigned i=0;i<10;i++) digitalWrite(OUTPUT_PINS[i],levels[i] ? HIGH:LOW);
  // Serial evidence that local outputs change with no broker (T08): telemetry cannot be sent then.
  static int lastLevels=-1;
  int packed=0;
  for(unsigned i=0;i<10;i++) packed|=int(levels[i])<<i;
  if(packed!=lastLevels) {
    lastLevels=packed;
    Serial.printf("OUTPUTS ms=%lu lock=%d%d motor07=%d%d motor08=%d%d light=%d buzzer=%d heater=%d fan=%d\r\n",static_cast<unsigned long>(now),
                  levels[0],levels[1],levels[2],levels[3],levels[4],levels[5],levels[6],levels[7],levels[8],levels[9]);
  }
}
}  // namespace board
}  // namespace kg
