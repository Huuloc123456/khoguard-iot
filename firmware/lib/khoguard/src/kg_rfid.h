#pragma once

// Wokwi has no RC522 part: one Serial line "RFID D07|D08 <card> IN|OUT" is one card read.
namespace kg {
namespace rfid {
void poll();
}  // namespace rfid
}  // namespace kg
