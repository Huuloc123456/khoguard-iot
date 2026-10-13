#pragma once
#include <array>
#include "controller.h"

// GPIO wiring of diagram.json (checked by tests/diagram.test.js).
namespace kg {
namespace board {
// Slot order is the controller contract: per door contact, beam, panic; then shared presence.
constexpr int INPUT_PINS[] = {16,17,18,19,21,22,23};
// LEDs: lock D07/D08, motor open/close D07, motor open/close D08, light, buzzer, heater, fan.
constexpr int OUTPUT_PINS[] = {25,26,27,14,2,13,32,33,4,5};
constexpr int DHT_PIN = 15;

void begin();
std::array<bool,7> readInputs();
// Drives the LEDs and logs an OUTPUTS line whenever any level changes.
void writeOutputs(const kg::Outputs &out, uint32_t now);
}  // namespace board
}  // namespace kg
