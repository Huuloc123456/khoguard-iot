#include "kg_network.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <MQTT.h>
#include <WiFi.h>
#include <esp_arduino_version.h>
#include "config.h"
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
bool publish(MQTTClient &client, const char *topic, JsonDocument &doc, bool retain) {
  if (doc.overflowed() || measureJson(doc) > config::MQTT_BUFFER_BYTES) {
    Serial.println("JSON_LIMIT: frame not sent");
    return false;
  }
  String json;
  serializeJson(doc, json);
  return client.publish(topic, json, retain, config::MQTT_QOS);
}

void networkTask(void *) {
#ifdef MQTT_CA_CERT
  // M12: verify broker certificate chain and hostname host.wokwi.internal against the pinned demo CA; never setInsecure().
  WiFiClientSecure net;
  net.setCACert(MQTT_CA_CERT);
  net.setHandshakeTimeout(config::TLS_HANDSHAKE_TIMEOUT_S);
#else
  WiFiClient net;
#endif
  MQTTClient client(config::MQTT_BUFFER_BYTES);
  client.begin(MQTT_HOST, MQTT_PORT, net);
  client.setOptions(config::MQTT_KEEPALIVE_S, config::MQTT_CLEAN_SESSION, config::MQTT_TIMEOUT_MS);
  client.onMessage(commands::onMessage);
  uint64_t telemetrySeq = 0, statusSeq = 0, ackSeq = 0;
  uint32_t attemptedAt = millis() - config::RECONNECT_INTERVAL_MS, publishedAt = millis() - config::TELEMETRY_PERIOD_MS;
  events::EdgeEvent pending;bool hasPending=false;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      net.stop();
    } else if (!client.connected()) {
      if (millis() - attemptedAt >= config::RECONNECT_INTERVAL_MS) {
        attemptedAt = millis();
        state::randomId(state::sessionId);
        JsonDocument will;
        messages::envelope(will, "status", 0, true);
        will["payload"]["state"] = "offline";
        String willJson;
        serializeJson(will, willJson);
        client.setWill(config::TOPIC_STATUS, willJson.c_str(), config::RETAIN_STATUS, config::MQTT_QOS);
        net.stop();
        if (net.connect(MQTT_HOST, MQTT_PORT, config::TCP_CONNECT_TIMEOUT_MS) && client.connect(config::DEVICE_ID, MQTT_USER, MQTT_PASSWORD, true)) {
          JsonDocument online;
          messages::envelope(online, "status", ++statusSeq);
          online["payload"]["state"] = "online";
          // Clean session: commands queued for an older session are never delivered after reconnect.
          commands::clear();
          if (!publish(client, config::TOPIC_STATUS, online, config::RETAIN_STATUS) || !client.subscribe(config::TOPIC_COMMANDS, config::MQTT_QOS)) net.stop();
          else Serial.printf("MQTT_ONLINE boot=%s session=%s\r\n", state::bootId, state::sessionId);
          publishedAt = millis() - config::TELEMETRY_PERIOD_MS;
        } else {
          net.stop();
          Serial.printf("MQTT_RETRY error=%d code=%d\r\n", client.lastError(), client.returnCode());
        }
      }
    } else {
      client.loop();
      if (client.connected() && millis() - publishedAt >= config::TELEMETRY_PERIOD_MS) {
        publishedAt = millis();
        JsonDocument doc;
        messages::telemetry(doc, ++telemetrySeq);
        if (!publish(client, config::TOPIC_TELEMETRY, doc, config::RETAIN_TELEMETRY)) net.stop();
        else Serial.printf("TELEMETRY_ACK seq=%llu\r\n", static_cast<unsigned long long>(telemetrySeq));
      }
      const commands::PendingAck *ack;
      while(client.connected() && (ack=commands::front())) {
        JsonDocument doc;messages::ackFrame(doc,*ack,++ackSeq);
        if(!publish(client,config::TOPIC_ACKS,doc,config::RETAIN_ACKS)) {net.stop();break;}
        commands::pop();
      }
      if(client.connected()) {
        if(!hasPending) hasPending=events::next(pending);
        if(hasPending) {JsonDocument doc;messages::eventFrame(doc,pending);if(publish(client,config::TOPIC_EVENTS,doc,config::RETAIN_EVENTS)) hasPending=false;else net.stop();}
      }
    }
    vTaskDelay(pdMS_TO_TICKS(config::NETWORK_TASK_DELAY_MS));
  }
}
}  // namespace

void start() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(config::WIFI_SSID, config::WIFI_PASSWORD, config::WIFI_CHANNEL);
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
