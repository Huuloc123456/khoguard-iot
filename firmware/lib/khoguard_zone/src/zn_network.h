#pragma once

// WiFi plus the MQTT task of a zone node: status/Last Will, telemetry every 2 s and door events, QoS 1.
// Same TLS rules as ESP-C01 (pinned demo CA, hostname checked); zone nodes never subscribe to commands.
namespace kg {
namespace zone {
namespace network {
// Joins Wokwi-GUEST, prints the boot banner and starts the MQTT task.
void start();
}  // namespace network
}  // namespace zone
}  // namespace kg
