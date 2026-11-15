#include "kg_environment.h"
#include <Arduino.h>
#include <DHT.h>
#include <esp_timer.h>
#include "kg_board.h"
#include "kg_state.h"

namespace kg {
namespace environment {
namespace {
DHT dht(config::DHT_PIN, DHT22);
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
    const int gasRaw = analogRead(config::GAS_AOUT_PIN);
    const float c = co2Ppm(gasRaw);
    portENTER_CRITICAL(&state::sampleLock);
    state::temperature = t;
    state::humidity = h;
    state::co2 = c;
    state::sampleAt = millis();
    portEXIT_CRITICAL(&state::sampleLock);
    // gas_raw is the calibration reading for config.h CO2_CAL_*.
    Serial.printf("SENSOR_HEARTBEAT ms=%llu temperature=%.1f humidity=%.1f gas_raw=%d co2=%.0f\r\n",
                  static_cast<unsigned long long>(esp_timer_get_time() / 1000), t, h, gasRaw, c);
  }
}
}  // namespace environment
}  // namespace kg
