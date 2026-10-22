#pragma once
#include <stddef.h>
#include <stdint.h>

// Lab 8 - Bai 1: hang so dinh danh cac kenh du lieu giua firmware ESP-C01 va platform (MQTT broker + dashboard).
// Moi module trong lib/khoguard doc cau hinh tu day; bang anh xa bien -> topic/field JSON: firmware/MAPPING.md.
// Thong tin xac thuc broker (MQTT_HOST, MQTT_PORT, MQTT_USER, MQTT_PASSWORD, MQTT_CA_CERT) KHONG nam o day ma o
// .local/firmware/kg_secrets.h do `npm run firmware:prepare` sinh ra, de mat khau khong vao git.
// File nay khong phu thuoc Arduino nen controller.h va test C++ tren may tinh van dung duoc.

// ---- Dinh danh thiet bi: phai khop contracts/devices.json ----
#define KG_WAREHOUSE_ID "WH01"
#define KG_DEVICE_ID "ESP-C01"
// Prefix topic theo contracts/README.md: khoguard/v1/{warehouse}/devices/{device}/{kind}
#define KG_TOPIC_PREFIX "khoguard/v1/" KG_WAREHOUSE_ID "/devices/" KG_DEVICE_ID "/"

namespace kg {
namespace config {
constexpr char WAREHOUSE_ID[] = KG_WAREHOUSE_ID;
constexpr char DEVICE_ID[] = KG_DEVICE_ID;  // cung la MQTT client ID
constexpr char ZONE_ID[] = "C";
constexpr const char *DOOR_IDS[2] = {"D07", "D08"};  // cua so 0 / cua so 1 trong Controller

// ---- Kenh MQTT (tuong duong "Virtual Pin" cua Blynk) ----
// Huong            Topic                                   QoS  Retain
constexpr char TOPIC_TELEMETRY[] = KG_TOPIC_PREFIX "telemetry";  // ESP -> App    1    co  (snapshot day du)
constexpr char TOPIC_STATUS[] = KG_TOPIC_PREFIX "status";        // ESP -> App    1    co  (online / Last Will offline)
constexpr char TOPIC_EVENTS[] = KG_TOPIC_PREFIX "events";        // ESP -> App    1    khong (cua, panic, RFID)
constexpr char TOPIC_COMMANDS[] = KG_TOPIC_PREFIX "commands";    // App -> ESP    1    khong (open/close/reset_panic)
constexpr char TOPIC_ACKS[] = KG_TOPIC_PREFIX "acks";            // ESP -> App    1    khong (ket qua lenh)

constexpr int MQTT_QOS = 1;
constexpr bool RETAIN_TELEMETRY = true;
constexpr bool RETAIN_STATUS = true;
constexpr bool RETAIN_EVENTS = false;
constexpr bool RETAIN_ACKS = false;

// ---- MQTT client ----
constexpr size_t MQTT_BUFFER_BYTES = 4096;  // bo dem client = gioi han kich thuoc mot frame JSON
constexpr int MQTT_KEEPALIVE_S = 10;
constexpr bool MQTT_CLEAN_SESSION = true;   // lenh cua phien cu khong duoc giao lai sau reconnect
constexpr int MQTT_TIMEOUT_MS = 1000;
constexpr int TCP_CONNECT_TIMEOUT_MS = 1000;
constexpr int TLS_HANDSHAKE_TIMEOUT_S = 5;

// ---- WiFi (Wokwi) ----
constexpr char WIFI_SSID[] = "Wokwi-GUEST";
constexpr char WIFI_PASSWORD[] = "";
constexpr int WIFI_CHANNEL = 6;

// ---- Chu ky (ms) ----
constexpr uint32_t TELEMETRY_PERIOD_MS = 2000;    // gui snapshot dinh ky
constexpr uint32_t RECONNECT_INTERVAL_MS = 5000;  // thu ket noi lai broker, khong chan vong lap
constexpr uint32_t SENSOR_PERIOD_MS = 2000;       // doc DHT22 (cam bien can >= 2 s)
constexpr uint32_t SENSOR_STALE_MS = 5000;        // mau cu hon muc nay gui null
constexpr uint32_t INPUT_DEBOUNCE_MS = 30;        // chong doi cho moi input so
constexpr uint32_t LOOP_DELAY_MS = 10;            // vong lap dieu khien (core Arduino)
constexpr uint32_t NETWORK_TASK_DELAY_MS = 20;    // vong lap task MQTT

// ---- GPIO: khop firmware/diagram.json (tests/diagram.test.js kiem tra) ----
// Thu tu slot input la hop dong cua Controller: moi cua gom contact, beam, panic; cuoi cung la presence dung chung.
// contact: cong tac gat (HIGH = mo). panic: nut nhan do noi 3V3 + tro keo xuong 10k ra GND, nhan = HIGH
// (Wokwi chi mo phong dien tro keo noi o chan RTC; 18/22 khong phai chan RTC nen INPUT_PULLDOWN chi la du phong).
// presence: cam bien PIR (OUT HIGH khi co chuyen dong, giu HIGH trong delayTime) (DEC-044).
// beam: cam bien sieu am HC-SR04, chan ECHO noi vao slot beam; "thong" = co echo va xa hon BEAM_BLOCKED_CM (DEC-045).
constexpr int INPUT_PINS[] = {16, 17, 18, 19, 21, 22, 23};
constexpr int PANIC_SLOTS[] = {2, 5};
constexpr int BEAM_SLOTS[] = {1, 4};
constexpr int SONAR_TRIG_PIN = 5;           // mot xung TRIG chung cho ca hai HC-SR04
constexpr uint32_t SONAR_PERIOD_MS = 60;    // khoang cach giua hai lan phat (HC-SR04 can >= 60 ms)
constexpr uint32_t SONAR_TIMEOUT_MS = 250;  // khong co echo moi trong thoi gian nay -> coi la bi che (an toan khi hong)
constexpr uint32_t BEAM_BLOCKED_CM = 100;   // vat gan hon 1 m trong khung cua = rem bi che
// Dau ra: relay giu khoa D07/D08 (den xanh la tai cua relay), servo canh cua D07/D08, den, buzzer.
constexpr int LOCK_RELAY_PINS[] = {25, 26};
constexpr int DOOR_SERVO_PINS[] = {27, 14};
constexpr int LIGHT_PIN = 32;
constexpr int BUZZER_PIN = 33;
// Quat luon nguoc voi suoi (controller.h: fan = !emergency, heater = emergency), nen mot relay chuyen mach lo ca hai:
// NO -> den suoi, NC -> den quat. Chan GPIO5 cu cua quat duoc dung lam TRIG cho HC-SR04 (DEC-045).
constexpr int CLIMATE_RELAY_PIN = 4;
constexpr int DHT_PIN = 15;
// Servo chi de nhin: 0 do = dong, 90 do = mo. Vi tri cua van do cong tac contact bao (cam bien doc lap voi motor).
constexpr int SERVO_CLOSED_DEG = 0;
constexpr int SERVO_OPEN_DEG = 90;
constexpr uint32_t SERVO_TRAVEL_MS = 1500;  // thoi gian canh servo quay het 90 do
constexpr uint32_t BUZZER_HZ = 2000;

// ---- RFID MFRC522 (dat o cua D07) ----
// SPI mac dinh (18/19/23) trung chan input nen dung GPIO matrix; RST noi thang 3V3 vi het chan trong.
// GPIO12 la chan strapping: tren board that phai giu LOW luc khoi dong; trong Wokwi khong anh huong.
constexpr int RFID_SCK_PIN = 2;
constexpr int RFID_MOSI_PIN = 13;
constexpr int RFID_MISO_PIN = 34;  // GPIO34 chi la input, du cho MISO
constexpr int RFID_SS_PIN = 12;
constexpr int RFID_DIRECTION_PIN = 35;  // cong tac gat: HIGH = vao, LOW = ra (GPIO35 khong co dien tro keo trong)
constexpr unsigned RFID_DOOR = 0;       // chi so cua trong Controller: 0 = D07
constexpr uint32_t RFID_POLL_MS = 100;
// The mau cua Wokwi -> ma the trong bang CARDS cua controller.h. The khac bao "UID-<hex>" va bi tu choi.
struct RfidCard {uint8_t uid[4]; const char *card;};
constexpr RfidCard RFID_CARDS[] = {
  {{0x01, 0x02, 0x03, 0x04}, "DEMO-017"},  // Blue Card
  {{0x11, 0x22, 0x33, 0x44}, "DEMO-018"},  // Green Card
  {{0xAA, 0xBB, 0xCC, 0xDD}, "DEMO-999"},  // Red Card (the bi thu hoi)
};
}  // namespace config
}  // namespace kg
