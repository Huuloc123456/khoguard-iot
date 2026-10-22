#pragma once
#include <stdint.h>

// Local LCD1602 of a zone node: temperature/humidity on line 1, people and the longest open door on line 2.
// ASCII only: the HD44780 font has no Vietnamese tone marks.
namespace kg {
namespace zone {
namespace display {
void begin();
// Redraws at most every LCD_REFRESH_MS.
void update(uint32_t now);
}  // namespace display
}  // namespace zone
}  // namespace kg
