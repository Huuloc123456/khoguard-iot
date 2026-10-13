#pragma once

// DHT22 temperature/humidity, sampled every 2 s into kg::state.
namespace kg {
namespace environment {
void begin();
void poll();
}  // namespace environment
}  // namespace kg
