#pragma once
#include <Arduino.h>
#include "controller.h"

// State shared by the control loop and the MQTT task. Every access goes through sampleLock (a short critical
// section that only copies data), so the loop never waits on the network.
namespace kg {
namespace state {
extern kg::Controller controller;
extern portMUX_TYPE sampleLock;
extern char bootId[33];
extern char sessionId[33];
// Latest DHT22 sample; NAN until the first read, sampleAt in millis().
extern float temperature;
extern float humidity;
extern uint32_t sampleAt;

void randomId(char *output);
// New boot ID for this power-up.
void begin();
}  // namespace state
}  // namespace kg
