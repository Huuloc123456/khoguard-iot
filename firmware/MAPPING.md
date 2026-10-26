# Bảng ánh xạ Firmware ↔ Platform (Lab 8 – Bài 1)

Thiết bị: **ESP-C01** (khu C, cửa airlock D07–D08). Platform: MQTT broker Mosquitto → backend Node (`server/mqtt.mjs`) → WebSocket → dashboard React (`src/useLiveWarehouse.js`).
MQTT topic đóng vai trò "Virtual Pin" của Blynk. Mọi hằng số dưới đây khai báo trong [`include/config.h`](include/config.h); schema JSON đầy đủ ở [`contracts/mqtt.schema.json`](../contracts/mqtt.schema.json).

## 1. Kênh dữ liệu (topic)

Prefix `khoguard/v1/WH01/devices/ESP-C01/`

| Hằng số trong `config.h` | Topic | Hướng | QoS | Retain | Khi nào gửi |
|---|---|---|---|---|---|
| `TOPIC_TELEMETRY` | `…/telemetry` | ESP → App | 1 | có | Mỗi `TELEMETRY_PERIOD_MS` (2 s) và ngay sau khi kết nối |
| `TOPIC_STATUS` | `…/status` | ESP → App | 1 | có | `online` khi kết nối; `offline` do broker gửi (Last Will) khi mất kết nối |
| `TOPIC_EVENTS` | `…/events` | ESP → App | 1 | không | Ngay khi trạng thái cửa / panic / RFID đổi |
| `TOPIC_COMMANDS` | `…/commands` | App → ESP | 1 | không | Người dùng bấm mở/đóng/reset panic trên dashboard |
| `TOPIC_ACKS` | `…/acks` | ESP → App | 1 | không | Sau khi xử lý xong mỗi lệnh |

## 2. Biến trạng thái → field JSON

### Telemetry (`…/telemetry`, field nằm trong `payload`)

| Biến firmware | Field JSON | Kiểu | Ghi chú |
|---|---|---|---|
| `state::temperature` | `environment.temperature_c` | số / `null` | DHT22, `null` nếu mẫu cũ hơn `SENSOR_STALE_MS` |
| `state::humidity` | `environment.humidity_pct` | số / `null` | như trên |
| `controller.occupancy.count` | `occupancy.current_occupants` | số / `null` | `null` khi chưa xác minh phòng trống |
| `controller.occupancy.verified` | `occupancy.count_verified` | bool | |
| `controller.inputs[6]` | `occupancy.presence` | bool / `null` | cảm biến hiện diện |
| `controller.revision` | `controller_revision` | số | tăng mỗi lần trạng thái đổi; lệnh phải gửi kèm giá trị này |
| `controller.doorState(d)` | `doors[d].state` | `open/closed/opening/closing/unknown` | d = 0 → D07, 1 → D08 (`DOOR_IDS`) |
| `controller.locked(d)` | `doors[d].locked` | bool | |
| `controller.openSince[d]` | `doors[d].open_ms` | số | chỉ có khi cửa đang mở |
| `controller.inputs[d*3+1]` | `doors[d].beam_clear` | bool / `null` | |
| `controller.panic[d]` | `doors[d].panic_latched` | bool / `null` | |
| `controller.healthy(d)` | `doors[d].local_inputs_healthy` | bool | |
| `controller.alarms()` | `alarms[]` | mảng `{code, door_id}` | `DOOR_OPEN_WARNING/CRITICAL`, `TRAPPED_PERSON` |
| `outputs().light / buzzer / heater / fan` | `outputs.light / buzzer / heater / fan` | bool | |

### Event (`…/events`)

| Nguồn trong firmware | `payload.event_type` | Field chính |
|---|---|---|
| `inputs[d*3]` (contact) đổi | `door` | `door_id`, `state` (`open/closed`) |
| `panic[d]` chuyển sang `true` | `panic` | `door_id`, `input = panic_high` |
| `reversals[d]` / `faults[d]` tăng | `door` | `state`, `reason` (vd. `BEAM_BLOCKED`, `LOCAL_INPUT_FAILURE`) |
| Dòng serial `RFID D07 DEMO-017 IN` | `rfid` | `card_id`, `direction`, `result` |

### Lệnh và phản hồi

| Topic | Field | Biến/hàm firmware |
|---|---|---|
| `…/commands` | `payload.action` = `open` / `close` / `reset_panic` | `kg::Action` → `controller.command()` |
| | `payload.door_id` | `DOOR_IDS[0/1]` → `CommandIn.door` |
| | `payload.expected_revision` | so với `controller.revision` (lệch → `REVISION_MISMATCH`) |
| | `boot_id`, `session_id` | so với `state::bootId/sessionId` (lệch → `COMMAND_EXPIRED`) |
| `…/acks` | `payload.status` = `applied` / `rejected` / `expired`, `payload.reason` | `CommandOut.reason` |

## 3. Chân GPIO (`config.h` → `diagram.json`)

| Mảng | Vị trí | GPIO | Ý nghĩa |
|---|---|---|---|
| `INPUT_PINS` | 0–2 | 16, 17, 18 | D07: contact (công tắc, HIGH = mở), beam (ECHO của HC-SR04), panic (nút đỏ) |
| | 3–5 | 19, 21, 22 | D08: contact, beam, panic |
| | 6 | 23 | presence: cảm biến PIR (HIGH = có chuyển động) |
| `PANIC_SLOTS` | 2, 5 | 18, 22 | nút panic nối 3V3, chân dùng `INPUT_PULLDOWN` |
| `LOCK_RELAY_PINS` | 0–1 | 25, 26 | relay khóa D07, D08 (đèn xanh là tải của relay) |
| `DOOR_SERVO_PINS` | 0–1 | 27, 14 | servo cánh cửa D07, D08 (chỉ để nhìn; vị trí cửa vẫn do contact báo) |
| `BEAM_SLOTS` | 1, 4 | 17, 21 | vật cản siêu âm là HC-SR04: thông = có echo trong 250 ms và ≥ `BEAM_BLOCKED_CM` (100 cm) |
| `SONAR_TRIG_PIN` | – | 5 | TRIG chung, phát mỗi 60 ms |
| `LIGHT_PIN`, `BUZZER_PIN` | – | 32, 33 | đèn (LED), còi (buzzer 2 kHz) |
| `CLIMATE_RELAY_PIN` | – | 4 | relay chuyển mạch: NO = đèn sưởi, NC = đèn quạt (quạt luôn ngược sưởi) |
| `DHT_PIN` | – | 15 | DHT22 |
| `RFID_SCK/MOSI/MISO/SS_PIN` | – | 2, 13, 34, 12 | đầu đọc MFRC522 ở cửa D07 (SPI qua GPIO matrix, RST nối 3V3) |
| `RFID_DIRECTION_PIN` | – | 35 | công tắc chọn chiều quẹt: HIGH = vào, LOW = ra |

Thẻ mẫu Wokwi → mã thẻ (`RFID_CARDS`): Blue `01:02:03:04` = DEMO-017, Green `11:22:33:44` = DEMO-018, Red `AA:BB:CC:DD` = DEMO-999 (thu hồi). Thẻ khác báo `UID-<hex>` và bị từ chối. Dòng Serial `RFID D07 <thẻ> IN|OUT` vẫn dùng được cho script kiểm thử.

Mọi input đều chống dội `INPUT_DEBOUNCE_MS` (30 ms) trong `kg::Input::update()`.

## 4. Thông tin xác thực

`MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` (và `MQTT_CA_CERT` khi bật TLS) nằm trong `.local/firmware/kg_secrets.h`, sinh bằng `npm run firmware:prepare`. File này không được commit.


Phạm vi hiện hành chỉ khu C và hai cửa D07–D08. [Bảng linh kiện và lưu ý nguồn/ECHO/strapping](../docs/LINH_KIEN_VA_NOI_DAY.md). ECHO nối trực tiếp chỉ dùng mô phỏng Wokwi, không dùng ngoài thực tế.
