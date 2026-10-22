#pragma once
#include <stdint.h>

// One firmware image per zone node, chosen by the platformio.ini env (zone_a / zone_b / zone_d). The device ID must
// match contracts/devices.json, and kg_secrets.h for that env carries only this device's MQTT account (DEC-043).
namespace kg {
namespace zone {
#if defined(KG_ZONE_A)
constexpr char DEVICE_ID[] = "SIM-A01";
constexpr char ZONE_ID[] = "A";
constexpr const char *DOOR_IDS[3] = {"D01", "D02", "D03"};
#elif defined(KG_ZONE_B)
constexpr char DEVICE_ID[] = "SIM-B01";
constexpr char ZONE_ID[] = "B";
constexpr const char *DOOR_IDS[3] = {"D04", "D05", "D06"};
#elif defined(KG_ZONE_D)
constexpr char DEVICE_ID[] = "SIM-D01";
constexpr char ZONE_ID[] = "D";
constexpr const char *DOOR_IDS[3] = {"D10", "D11", "D12"};
#else
#error "Build a zone node with -DKG_ZONE_A, -DKG_ZONE_B or -DKG_ZONE_D"
#endif

// Wiring of firmware/wokwi/zone-*/diagram.json (checked by tests/diagram.test.js).
constexpr int CONTACT_PINS[3] = {16,17,18};   // slide switch, HIGH = door open
constexpr int PRESENCE_PIN = 19;              // slide switch, HIGH = person detected
constexpr int IN_BUTTON_PIN = 21;             // push button to GND, pressed = LOW
constexpr int OUT_BUTTON_PIN = 22;
constexpr int DHT_PIN = 15;
constexpr int WARNING_LED_PIN = 25;           // a door open for 30 s or more
constexpr int CRITICAL_LED_PIN = 26;          // a door open for more than 60 s

// Same door timers as include/controller.h (ESP-C01).
constexpr uint32_t DOOR_WARNING_MS = 30000, DOOR_CRITICAL_MS = 60000;
}  // namespace zone
}  // namespace kg
