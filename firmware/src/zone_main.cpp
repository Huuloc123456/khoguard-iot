#include <Arduino.h>
#include "khoguard_zone.h"

// Zone node for zones A/B/D (platformio.ini env zone_a / zone_b / zone_d); ESP-C01 is built from main.cpp.
void setup() {
  Serial.begin(115200);
  kg::zone::begin();
  kg::zone::display::begin();
  kg::zone::network::start();
}

void loop() {
  kg::zone::step();
  kg::zone::display::update(millis());
  delay(10);
}
