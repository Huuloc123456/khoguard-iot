#include "kg_board.h"
#include <Arduino.h>

namespace kg {
namespace board {
namespace {
// LEDC: channels 0/1 share timer 0 at 50 Hz for the two servos; channel 2 (timer 1) plays the buzzer tone.
constexpr uint8_t SERVO_CHANNELS[2] = {0, 1}, BUZZER_CHANNEL = 2;
constexpr uint8_t SERVO_RESOLUTION = 16;
// Same pulse range as the Arduino Servo library: 544 us = 0 deg, 2400 us = 180 deg, period 20 ms.
constexpr uint32_t SERVO_MIN_US = 544, SERVO_MAX_US = 2400, SERVO_PERIOD_US = 20000;
float servoAngle[2] = {float(config::SERVO_CLOSED_DEG), float(config::SERVO_CLOSED_DEG)};
int servoWritten[2] = {-1, -1};
bool buzzing = false;

bool panicSlot(unsigned slot) {
  for (int panic : config::PANIC_SLOTS) if (int(slot) == panic) return true;
  return false;
}

// HC-SR04 light curtains (DEC-045): one shared TRIG pulse, each ECHO measured by its own interrupt so the safety
// loop never waits for an echo. 32-bit fields are written by the ISR and read atomically by the loop.
struct Sonar {
  int pin;
  volatile uint32_t riseUs, widthUs, echoAtMs;
};
Sonar sonars[2] = {{config::INPUT_PINS[config::BEAM_SLOTS[0]], 0, 0, 0}, {config::INPUT_PINS[config::BEAM_SLOTS[1]], 0, 0, 0}};
uint32_t firedAt = 0;

void IRAM_ATTR onEcho(void *arg) {
  Sonar &sonar = *static_cast<Sonar *>(arg);
  if (digitalRead(sonar.pin) == HIGH) sonar.riseUs = micros();
  else {sonar.widthUs = micros() - sonar.riseUs; sonar.echoAtMs = millis();}
}

// Clear only with a recent echo from farther than BEAM_BLOCKED_CM; a missing echo counts as blocked (fail-safe).
bool beamClear(unsigned door, uint32_t now) {
  const uint32_t echoAt = sonars[door].echoAtMs, width = sonars[door].widthUs;
  return echoAt != 0 && now - echoAt <= config::SONAR_TIMEOUT_MS && width / 58 >= config::BEAM_BLOCKED_CM;
}

void fireSonars(uint32_t now) {
  if (now - firedAt < config::SONAR_PERIOD_MS) return;
  firedAt = now;
  digitalWrite(config::SONAR_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(config::SONAR_TRIG_PIN, LOW);
}

int beamSlotDoor(unsigned slot) {
  for (unsigned d = 0; d < 2; d++) if (int(slot) == config::BEAM_SLOTS[d]) return int(d);
  return -1;
}

void writeServo(unsigned door, float angle) {
  const int degrees = int(angle + 0.5f);
  if (degrees == servoWritten[door]) return;
  servoWritten[door] = degrees;
  const uint32_t pulse = SERVO_MIN_US + (SERVO_MAX_US - SERVO_MIN_US) * uint32_t(degrees) / 180;
  ledcWrite(SERVO_CHANNELS[door], pulse * ((1u << SERVO_RESOLUTION) - 1) / SERVO_PERIOD_US);
}

// The servo shows the door leaf: it follows the motor while it runs, otherwise the position the contact reports.
float servoTarget(const kg::Controller &c, unsigned door, float current) {
  if (c.motion[door] == kg::Motion::opening) return config::SERVO_OPEN_DEG;
  if (c.motion[door] == kg::Motion::closing) return config::SERVO_CLOSED_DEG;
  if (c.contactKnown(door)) return c.isOpen(door) ? config::SERVO_OPEN_DEG : config::SERVO_CLOSED_DEG;
  return current;
}
}  // namespace

void begin() {
  for (unsigned i = 0; i < 7; i++) pinMode(INPUT_PINS[i], panicSlot(i) ? INPUT_PULLDOWN : beamSlotDoor(i) >= 0 ? INPUT : INPUT_PULLUP);
  for (Sonar &sonar : sonars) attachInterruptArg(digitalPinToInterrupt(sonar.pin), onEcho, &sonar, CHANGE);
  for (int pin : config::LOCK_RELAY_PINS) {pinMode(pin, OUTPUT); digitalWrite(pin, LOW);}
  for (int pin : {config::LIGHT_PIN, config::CLIMATE_RELAY_PIN, config::SONAR_TRIG_PIN}) {pinMode(pin, OUTPUT); digitalWrite(pin, LOW);}
  for (unsigned d = 0; d < 2; d++) {
    ledcSetup(SERVO_CHANNELS[d], 50, SERVO_RESOLUTION);
    ledcAttachPin(config::DOOR_SERVO_PINS[d], SERVO_CHANNELS[d]);
    writeServo(d, servoAngle[d]);
  }
  ledcSetup(BUZZER_CHANNEL, config::BUZZER_HZ, 8);
  ledcAttachPin(config::BUZZER_PIN, BUZZER_CHANNEL);
  ledcWriteTone(BUZZER_CHANNEL, 0);
}

std::array<bool,7> readInputs() {
  const uint32_t now = millis();
  fireSonars(now);
  std::array<bool,7> raw;
  for(unsigned i=0;i<raw.size();i++) {
    const int door = beamSlotDoor(i);
    raw[i] = door >= 0 ? beamClear(unsigned(door), now) : digitalRead(INPUT_PINS[i])==HIGH;
  }
  // Serial evidence of what each curtain sees, printed only when its clear/blocked reading flips.
  static int shown[2] = {-1, -1};
  for (unsigned d = 0; d < 2; d++) {
    const bool clear = raw[config::BEAM_SLOTS[d]];
    if (int(clear) == shown[d]) continue;
    shown[d] = clear;
    Serial.printf("SONAR %s cm=%lu %s\r\n", config::DOOR_IDS[d], static_cast<unsigned long>(sonars[d].widthUs / 58), clear ? "clear" : "blocked");
  }
  return raw;
}

void writeOutputs(const kg::Controller &controller, const kg::Outputs &out, uint32_t now) {
  for (unsigned d = 0; d < 2; d++) digitalWrite(config::LOCK_RELAY_PINS[d], out.lock[d] ? HIGH : LOW);
  digitalWrite(config::LIGHT_PIN, out.light ? HIGH : LOW);
  // The changeover relay lights the heater (NO) or the fan (NC); controller.h guarantees fan == !heater.
  digitalWrite(config::CLIMATE_RELAY_PIN, out.heater ? HIGH : LOW);
  if (out.buzzer != buzzing) {
    buzzing = out.buzzer;
    ledcWriteTone(BUZZER_CHANNEL, buzzing ? config::BUZZER_HZ : 0);
  }
  static uint32_t lastAt = now;
  const float step = float(now - lastAt) * float(config::SERVO_OPEN_DEG - config::SERVO_CLOSED_DEG) / float(config::SERVO_TRAVEL_MS);
  lastAt = now;
  for (unsigned d = 0; d < 2; d++) {
    const float target = servoTarget(controller, d, servoAngle[d]);
    if (servoAngle[d] < target) servoAngle[d] = min(target, servoAngle[d] + step);
    else if (servoAngle[d] > target) servoAngle[d] = max(target, servoAngle[d] - step);
    writeServo(d, servoAngle[d]);
  }
  const bool levels[]={out.lock[0],out.lock[1],out.motorOpen[0],out.motorClose[0],out.motorOpen[1],out.motorClose[1],out.light,out.buzzer,out.heater,out.fan};
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
