#include <Arduino.h>
#include "config.h"
#include "khoguard.h"

// The firmware lives in lib/khoguard; this file only wires the modules into Arduino's setup/loop.
void setup() {
  Serial.begin(115200);
  kg::state::begin();
  kg::environment::begin();
  kg::board::begin();
  if (!kg::events::begin()) return;
  kg::network::start();
}

void loop() {
  kg::edge::step();
  kg::rfid::poll();
  kg::environment::poll();
  delay(kg::config::LOOP_DELAY_MS);
}
