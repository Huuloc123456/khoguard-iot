#pragma once
#include <Arduino.h>
#include "controller.h"

// Edge events (door, panic, RFID) wait in a bounded queue for the MQTT task; a full queue logs EVENT_GAP and the
// backend sees the missing seq as a gap. The local state is updated either way.
namespace kg {
namespace events {
enum class EventType : uint8_t {door,panic,rfid};
struct EdgeEvent {uint64_t seq,uptime;EventType type;uint8_t door;bool open;char card[33];bool entering;kg::ScanResult result;kg::Reason reason;bool reversal;};

// False when the queue cannot be allocated.
bool begin();
// Stamps the event with the next seq and the uptime, then queues it without blocking.
void enqueue(EdgeEvent &event);
// Takes the oldest queued event without blocking.
bool next(EdgeEvent &event);
// Door contact changes, new panic latches, closing reversals and travel faults between two controller snapshots.
void reportChanges(const kg::Controller &before, const kg::Controller &after);
}  // namespace events
}  // namespace kg
