#include "kg_edge.h"
#include <Arduino.h>
#include "kg_board.h"
#include "kg_events.h"
#include "kg_state.h"

namespace kg {
namespace edge {
void step() {
  const std::array<bool,7> raw=board::readInputs();
  portENTER_CRITICAL(&state::sampleLock);
  const auto before=state::controller;
  const uint32_t now=millis();
  state::controller.update(raw,now);
  state::controller.tick(now);
  const auto after=state::controller;
  portEXIT_CRITICAL(&state::sampleLock);
  // Outputs follow local rules only; broker/backend loss never changes them.
  board::writeOutputs(after,after.outputs(now),now);
  events::reportChanges(before,after);
}
}  // namespace edge
}  // namespace kg
