#include "zn_display.h"
#include <Arduino.h>
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include "zn_config.h"
#include "zn_node.h"

namespace kg {
namespace zone {
namespace display {
namespace {
LiquidCrystal_I2C lcd(LCD_ADDRESS, 16, 2);

// Pads to the full 16 columns so a shorter text overwrites the previous one without clearing (no flicker).
void line(uint8_t row, const char *text) {
  char padded[17];
  snprintf(padded, sizeof(padded), "%-16s", text);
  lcd.setCursor(0, row);
  lcd.print(padded);
}
}  // namespace

void begin() {
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();
  char title[17];
  snprintf(title, sizeof(title), "KhoGuard khu %s", ZONE_ID);
  line(0, title);
  line(1, DEVICE_ID);
}

void update(uint32_t now) {
  static uint32_t drawnAt = 0;
  if (now - drawnAt < LCD_REFRESH_MS) return;
  drawnAt = now;
  const Snapshot s = snapshot();
  char text[17];
  if (isfinite(s.temperature) && isfinite(s.humidity)) snprintf(text, sizeof(text), "%s %5.1fC %3.0f%%", ZONE_ID, s.temperature, s.humidity);
  else snprintf(text, sizeof(text), "%s nhiet do: --", ZONE_ID);
  line(0, text);
  char people[6];
  if (s.countVerified) snprintf(people, sizeof(people), "%lu", static_cast<unsigned long>(s.count));
  else snprintf(people, sizeof(people), "?");
  int longest = -1;
  uint32_t openFor = 0;
  for (unsigned d = 0; d < 3; d++) {
    if (!s.contactKnown[d] || !s.open[d] || now - s.openSince[d] < openFor) continue;
    longest = int(d);
    openFor = now - s.openSince[d];
  }
  if (longest < 0) snprintf(text, sizeof(text), "Ng:%s Cua dong", people);
  else snprintf(text, sizeof(text), "Ng:%s %s mo %lus", people, DOOR_IDS[longest], static_cast<unsigned long>(openFor / 1000));
  line(1, text);
}
}  // namespace display
}  // namespace zone
}  // namespace kg
