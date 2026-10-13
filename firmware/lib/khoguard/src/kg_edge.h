#pragma once

// One pass of the local safety loop: inputs -> controller rules -> outputs -> events. Needs no network.
namespace kg {
namespace edge {
void step();
}  // namespace edge
}  // namespace kg
