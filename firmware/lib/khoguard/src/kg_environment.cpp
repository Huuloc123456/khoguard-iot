#include "kg_environment.h"
#include <Arduino.h>
#include <DHT.h>
#include <esp_timer.h>
#include "kg_board.h"
#include "kg_state.h"

namespace kg {
namespace environment {
namespace {
DHT dht(board::DHT_PIN, DHT22);
}

void begin() {
  dht.begin();
}

void poll() {
  static uint32_t readAt = millis();
  if (millis() - readAt >= config::SENSOR_PERIOD_MS) {
    readAt = millis();
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    portENTER_CRITICAL(&state::sampleLock);
    state::temperature = t;
    state::humidity = h;
    state::sampleAt = millis();
    portEXIT_CRITICAL(&state::sampleLock);
    Serial.printf("SENSOR_HEARTBEAT ms=%llu temperature=%.1f humidity=%.1f\r\n",
                  static_cast<unsigned long long>(esp_timer_get_time() / 1000), t, h);
  }
}
}  // namespace environment
}  // namespace kg
