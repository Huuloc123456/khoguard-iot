#include "kg_network.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <MQTT.h>
#include <WiFi.h>
#include <esp_arduino_version.h>
#include "kg_secrets.h"
// kg_secrets.h defines MQTT_CA_CERT after infra:tls:setup + firmware:prepare.
#ifdef MQTT_CA_CERT
#include <WiFiClientSecure.h>
#endif
#include "kg_commands.h"
#include "kg_events.h"
#include "kg_messages.h"
#include "kg_state.h"

namespace kg {
namespace network {
namespace {
bool publish(MQTTClient &client, const char *topic, JsonDocument &doc, bool retain=true) {
  if (doc.overflowed() || measureJson(doc) > 4096) {
    Serial.println("JSON_LIMIT: frame not sent");
    return false;
  }
  String json;
  serializeJson(doc, json);
  return client.publish(topic, json, retain, 1);
}

void networkTask(void *) {
#ifdef MQTT_CA_CERT
  // M12: verify broker certificate chain and hostname host.wokwi.internal against the pinned demo CA; never setInsecure().
  WiFiClientSecure net;
  net.setCACert(MQTT_CA_CERT);
  net.setHandshakeTimeout(5);
#else
  WiFiClient net;
#endif
  MQTTClient client(4096);
  client.begin(MQTT_HOST, MQTT_PORT, net);
  client.setOptions(10, true, 1000);
  client.onMessage(commands::onMessage);
  uint64_t telemetrySeq = 0, statusSeq = 0, ackSeq = 0;
  uint32_t attemptedAt = millis() - 5000, publishedAt = millis() - 2000;
  events::EdgeEvent pending;bool hasPending=false;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      net.stop();
    } else if (!client.connected()) {
      if (millis() - attemptedAt >= 5000) {
        attemptedAt = millis();
        state::randomId(state::sessionId);
        JsonDocument will;
        messages::envelope(will, "status", 0, true);
        will["payload"]["state"] = "offline";
        String willJson;
        serializeJson(will, willJson);
        client.setWill(messages::STATUS_TOPIC, willJson.c_str(), true, 1);
        net.stop();
        if (net.connect(MQTT_HOST, MQTT_PORT, 1000) && client.connect("ESP-C01", MQTT_USER, MQTT_PASSWORD, true)) {
          JsonDocument online;
          messages::envelope(online, "status", ++statusSeq);
          online["payload"]["state"] = "online";
          // Clean session: commands queued for an older session are never delivered after reconnect.
          commands::clear();
          if (!publish(client, messages::STATUS_TOPIC, online) || !client.subscribe(messages::COMMAND_TOPIC, 1)) net.stop();
          else Serial.printf("MQTT_ONLINE boot=%s session=%s\r\n", state::bootId, state::sessionId);
          publishedAt = millis() - 2000;
        } else {
          net.stop();
          Serial.printf("MQTT_RETRY error=%d code=%d\r\n", client.lastError(), client.returnCode());
        }
      }
    } else {
      client.loop();
      if (client.connected() && millis() - publishedAt >= 2000) {
        publishedAt = millis();
        JsonDocument doc;
        messages::telemetry(doc, ++telemetrySeq);
        if (!publish(client, messages::TELEMETRY_TOPIC, doc)) net.stop();
        else Serial.printf("TELEMETRY_ACK seq=%llu\r\n", static_cast<unsigned long long>(telemetrySeq));
      }
      const commands::PendingAck *ack;
      while(client.connected() && (ack=commands::front())) {
        JsonDocument doc;messages::ackFrame(doc,*ack,++ackSeq);
        if(!publish(client,messages::ACK_TOPIC,doc,false)) {net.stop();break;}
        commands::pop();
      }
      if(client.connected()) {
        if(!hasPending) hasPending=events::next(pending);
        if(hasPending) {JsonDocument doc;messages::eventFrame(doc,pending);if(publish(client,messages::EVENT_TOPIC,doc,false)) hasPending=false;else net.stop();}
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}
}  // namespace

void start() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin("Wokwi-GUEST", "", 6);
#ifdef MQTT_CA_CERT
  constexpr char TRANSPORT[]="mqtts:18885 CA-verified";constexpr uint32_t NETWORK_STACK=12288; // mbedTLS handshake needs more stack
#else
  constexpr char TRANSPORT[]="mqtt:18884 localhost-only";constexpr uint32_t NETWORK_STACK=8192;
#endif
  Serial.printf("KHOGUARD_M12 boot=%s core=%d.%d.%d transport=%s; local interlock/panic/timers active; RFID via serial \"RFID D07 DEMO-017 IN\"; outputs are LEDs\r\n",
                state::bootId, ESP_ARDUINO_VERSION_MAJOR, ESP_ARDUINO_VERSION_MINOR, ESP_ARDUINO_VERSION_PATCH, TRANSPORT);
  if (xTaskCreate(networkTask, "mqtt", NETWORK_STACK, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("MQTT_TASK_FAILED; sensor loop continues");
  }
}
}  // namespace network
}  // namespace kg
