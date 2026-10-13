#include "kg_state.h"

namespace kg {
namespace state {
kg::Controller controller;
portMUX_TYPE sampleLock = portMUX_INITIALIZER_UNLOCKED;
char bootId[33];
char sessionId[33];
float temperature = NAN;
float humidity = NAN;
uint32_t sampleAt = 0;

void randomId(char *output) {
  snprintf(output, 33, "%08lx%08lx%08lx%08lx", static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()),
           static_cast<unsigned long>(esp_random()));
}

void begin() {
  randomId(bootId);
}
}  // namespace state
}  // namespace kg
