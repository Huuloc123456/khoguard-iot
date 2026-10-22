#pragma once
#include <array>
#include "config.h"
#include "controller.h"

// GPIO wiring of diagram.json; the pin numbers live in include/config.h (checked by tests/diagram.test.js).
namespace kg {
namespace board {
// Slot order is the controller contract: per door contact, beam, panic; then shared presence.
// static: a namespace-scope reference has external linkage in C++11, so without it every .cpp redefines it.
static constexpr const auto &INPUT_PINS = config::INPUT_PINS;
// LEDs: lock D07/D08, motor open/close D07, motor open/close D08, light, buzzer, heater, fan.
static constexpr const auto &OUTPUT_PINS = config::OUTPUT_PINS;
constexpr int DHT_PIN = config::DHT_PIN;

void begin();
std::array<bool,7> readInputs();
// Drives the LEDs and logs an OUTPUTS line whenever any level changes.
void writeOutputs(const kg::Outputs &out, uint32_t now);
}  // namespace board
}  // namespace kg
