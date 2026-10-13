#pragma once

// WiFi plus the MQTT task (TLS with the pinned demo CA when kg_secrets.h provides MQTT_CA_CERT).
// QoS1 waits for PUBACK in that task, so the safety loop never blocks on the network.
namespace kg {
namespace network {
// Joins Wokwi-GUEST, prints the boot banner and starts the MQTT task.
void start();
}  // namespace network
}  // namespace kg
