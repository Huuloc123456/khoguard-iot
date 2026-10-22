# ESP-C01 — probe PlatformIO/Wokwi (M03)

ESP32 mô phỏng khu C, đọc DHT22 trên GPIO15. Mỗi khoảng 2 giây gửi telemetry QoS1/retain cho `ESP-C01`, gồm đủ phần thiết bị sở hữu theo registry: môi trường, occupancy và D07/D08. Các input an toàn chưa nối nên count/presence/beam/panic là null, cửa unknown, input chưa khỏe. Firmware chưa điều khiển cửa hoặc nhận command.

## Build và chạy trong VS Code

Từ thư mục gốc `D:\huit\iot\source\khoguard-iot`:

```powershell
npm run firmware:build
npm run firmware:gateway:setup
code --new-window firmware
```

Trong cửa sổ firmware, nhấn **F1 → Wokwi: Start Simulator**. Extension Wokwi 4.0.0 và PlatformIO đã cài trên máy. License hiện có phải cho phép chạy; không suy từ việc cài extension. Giữ tab simulator hiển thị trong khi kiểm tra.

`firmware:build` lấy duy nhất account ESP-C01 từ `.local/mosquitto/accounts.json`, sinh header vào `.local/firmware/kg_secrets.h`, rồi gọi PlatformIO Core đã cài. Không cần copy mật khẩu vào source. Nếu dùng nút PlatformIO Build ở VS Code trên checkout mới, chạy `npm run firmware:prepare` từ root trước. Thư viện tải ở lần build đầu.

Platform khóa **platformio/espressif32 7.0.1 / Arduino 2.0.17 / IDF 4.4.7**; MQTT 2.5.3, ArduinoJson 7.4.3, DHT sensor library 1.4.7, Adafruit Unified Sensor 1.1.15. Core PlatformIO trên máy 6.2.0. Build/artifact chứa password đều trong `.local/firmware-build`, không đưa vào Git hoặc Vite. `.pio` chỉ cache thư viện và được ignore.

## Đường mạng và kiểm tra

Broker riêng phải đang chạy trong terminal khác:

```powershell
npm run infra:mqtt:start
```

Trong terminal riêng nữa, chạy gateway đã đối chiếu SHA-256:

```powershell
npm run firmware:gateway:start
```

ESP32 vào WiFi `Wokwi-GUEST`, channel 6, password rỗng. `host.wokwi.internal:18884` qua gateway trỏ tới máy chạy VS Code; không dùng `127.0.0.1` từ ESP32 và không mở broker ra LAN. `wokwi.toml` chọn gateway native 2.0.1 tại `ws://127.0.0.1:9011`. Publish/reconnect đã đạt với gateway này. Gateway tích hợp gửi được dữ liệu nhưng thử reconnect chưa đạt; chưa chứng minh nguyên nhân nội bộ của extension.

Gateway upstream còn lắng nghe cổng **9080 trên mọi interface** để chuyển HTTP vào simulator. Tham số `--forward=` không tắt cổng này. Firmware M03 không có HTTP server; không cấp quyền Firewall rộng hoặc thêm HTTP server trước khi giới hạn ingress. Script start từ chối cổng đang bị chiếm, không dừng process khác. Các script dùng Windows PowerShell 5.1/.NET và curl.exe sẵn có, không cần PowerShell 7. Dừng terminal gateway bằng Ctrl+C sau khi thử.

Lấy `boot=...` từ dòng `KHOGUARD_M03` trong Serial Monitor, rồi ở terminal root:

```powershell
npm run firmware:check -- <boot-ID-32-ký-tự>
```

Observer chỉ đọc; không tự publish giả ESP32. Kiểm tra ba frame live cùng boot/session, đúng schema, QoS1, seq/uptime tăng, có DHT22 reading và không báo an toàn giả. Retained cũ/duplicate không tính. Deadline 45 giây, lỗi trả exit code 1. Kết quả không secret ở `.local/firmware-observation.json`. Chạy không truyền boot chỉ chứng minh frame device hợp lệ, chưa đối chiếu nguồn với Serial Monitor.

M03 chưa có NTP: `clock_synced=false`, `sent_at=null`, uptime dùng timer 64-bit. Last Will offline QoS1/retain gắn boot/session chuẩn bị trước connect; seq=0/uptime=0 không phải thời điểm mất kết nối. Boot đổi khi reboot, session đổi mỗi lần reconnect. Telemetry sequence tiếp tục trong cùng boot, không phát lại dữ liệu cũ sau mất mạng; lưu/replay event thuộc các mốc sau.

MQTT chạy trong task riêng, retry cách 5 giây, timeout TCP/ACK cấu hình 1 giây. Sensor/heartbeat có loop riêng và snapshot bảo vệ bằng critical section. Đây là cấu trúc code; nghiệm thu không treo vẫn phải ngắt/khôi phục broker trên simulator thật.

## Sơ đồ và kiểm thử lỗi

| Linh kiện | Nối vào ESP32 | Nguồn dữ liệu |
| --- | --- | --- |
| DHT22 VCC/GND | 3V3/GND | Linh kiện Wokwi, mặc định −18,4°C / 55% |
| DHT22 SDA | GPIO15, pull-up 10 kΩ lên 3V3 | Chỉnh nhiệt/ẩm bằng bảng điều khiển DHT22 |
| Serial | TX0/RX0 → Serial Monitor | Boot/session, PUBACK và heartbeat; không log password |
| D07/D08 contact, beam, panic; presence | GPIO16(RX2),17(TX2),18 / 19,21,22 / 23, slide switch, `INPUT_PULLUP` | M07: debounce 30 ms, panic latch; contact là cảm biến vị trí cửa (DEC-019) |
| Output (LED) | GPIO25 khóa D07, 26 khóa D08, 27/14 motor mở/đóng D07, 2/13 motor mở/đóng D08, 32 đèn, 33 còi, 4 sưởi, 5 quạt | M10: mô phỏng, không phải actuator thật (DEC-021) |
| RFID | Serial Monitor: `RFID D07\|D08 <thẻ> IN\|OUT` | M08: DEMO-017/018 được phép, DEMO-999 và thẻ lạ bị từ chối; count chưa xác minh sau boot |

Để nghiệm thu reconnect: lưu boot/session/seq ban đầu; dừng **chỉ broker dự án** trên 18884, kiểm tra `SENSOR_HEARTBEAT` vẫn tăng; mở lại broker và chạy observer với cùng boot. Session phải đổi, seq/uptime phải tiến và cửa vẫn unknown. Không dừng Mosquitto service cũ 1883 hoặc MySQL 3306. Khi simulator bị ẩn/thu nhỏ hoặc gateway không hoạt động, ghi kết quả chưa đạt; không coi timeout là pass.

Để nghiệm thu thay đổi cảm biến: chỉnh DHT22 trong simulator và quan sát reading mới tới observer. Nếu đọc lỗi/giá trị không hợp lệ hoặc sample quá 5 giây, telemetry gửi null. Dashboard vẫn là demo đến M06.

Ngày 12/10/2026: đã đối chiếu boot, ba frame live trước/sau broker restart và thay đổi DHT22 −18,4 → 39,4°C / 55%. Sensor loop tiếp tục khi broker mất; boot giữ nguyên, session đổi, seq/uptime tiến. [Bằng chứng M03](../docs/evidence/M03-2026-10-12.md). Sau thử đã dừng simulator/gateway; broker dự án và Vite vẫn chạy. Khi chạy lại, bật gateway trước **Wokwi: Start Simulator**; nếu extension cũ bị kẹt, dùng **Developer: Reload Window** rồi khởi động lại.

## Nguồn chính thức

- [Wokwi: config, gateway, tab visibility](https://docs.wokwi.com/vscode/project-config), [khởi động/license](https://docs.wokwi.com/vscode/getting-started), [WiFi/host.wokwi.internal](https://docs.wokwi.com/guides/esp32-wifi), [DHT22](https://docs.wokwi.com/parts/wokwi-dht22).
- [PlatformIO Espressif đã khóa](https://github.com/platformio/platform-espressif32/releases/tag/v7.0.1).
- [MQTT: setWill/options/publish QoS](https://github.com/256dpi/arduino-mqtt#api), [ArduinoJson 7](https://arduinojson.org/v7/api/jsondocument/), [Adafruit DHT](https://github.com/adafruit/DHT-sensor-library/blob/1.4.7/examples/DHTtester/DHTtester.ino).
- [Gateway native và cấu hình VS Code](https://github.com/wokwi/wokwigw/tree/v2.0.1), [default forwarding](https://github.com/wokwi/wokwigw/blob/v2.0.1/cmd/wokwigw/config.go).
- [ESP-IDF tasks/critical sections](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/system/freertos.html), [64-bit timer](https://docs.espressif.com/projects/esp-idf/en/v4.4.7/esp32/api-reference/system/esp_timer.html).

## RFID mô phỏng (M08)

Wokwi không có đầu đọc RC522, nên mỗi dòng gõ vào Serial Monitor là một lượt quẹt:

```text
RFID D07 DEMO-017 IN
RFID D07 DEMO-017 OUT
RFID D08 STRANGER-1 IN
```

Serial in `RFID_EVENT ... result=<0 accepted|1 duplicate|2 unauthorized> count=... verified=...` và gửi event `rfid` kèm `result`. Sau boot số người là *chưa xác minh* (gửi `null`) cho tới khi mmWave clear và không thẻ nào đang ở trong. Dòng dài hơn 63 ký tự bị bỏ và làm mất xác minh. Test quy tắc thuần: `g++ -std=c++17 firmware/test/controller_test.cpp -o controller_test && ./controller_test`.


## Quy tắc an toàn, lệnh và timer (M09–M11)

- Linh kiện Wokwi (DEC-044): khu C có đầu đọc RFID MFRC522 ở D07 (thẻ Blue = DEMO-017, Green = DEMO-018, Red = DEMO-999; công tắc chọn chiều vào/ra), PIR, nút panic đỏ, servo cánh cửa, relay khóa, buzzer; khu A/B/D có PIR và LCD1602. Chân xem `include/config.h` và `MAPPING.md`.
- Nút khu A/B/D (DEC-043): `src/zone_main.cpp` gọi `lib/khoguard_zone/src`; build 3 bản `zone_a`, `zone_b`, `zone_d` (cùng `npm run firmware:build`), chạy bằng project Wokwi trong `wokwi/zone-a|b|d`.
- `src/main.cpp` chỉ gọi thư viện `lib/khoguard/src` (state, board, environment, events, edge, rfid, commands, messages, network); `platformio.ini` thêm `-Iinclude` để thư viện thấy `controller.h`.
- Quy tắc thuần ở `include/controller.h`; test: `g++ -std=gnu++11 firmware/test/safety_test.cpp -o safety_test && ./safety_test` (6 nhóm M09/M10/M11).
- Lệnh từ dashboard chỉ bật LED motor. Trong Wokwi, **tự gạt switch contact** của cửa đó trong 10 s để mô phỏng cửa tới nơi; quá 10 s thì dừng và báo lỗi input. Rèm quang bị chắn hoặc mmWave bật khi đang đóng → cửa mở lại.
- Thiết bị chỉ chạy lệnh đúng boot/session hiện tại và đúng revision; lệnh trùng ID chỉ ack lại. Serial in `COMMAND_IGNORED: ...` khi lệnh sai dạng.
- Timer: đèn sáng khi cửa mở ≥ 30 s, còi khi > 60 s; presence liên tục khi hai cửa đóng > 5 phút → khẩn cấp (đèn, còi, sưởi bật, quạt tắt). Timer chạy cả khi mất broker.

Cần nghiệm thu trên Wokwi (chưa làm): xem danh sách trong [bằng chứng M10](../docs/evidence/M10-2026-10-13.md) và [M11](../docs/evidence/M11-2026-10-13.md).

## TLS (M12)

- Sau `npm run infra:tls:setup`, `npm run firmware:prepare` ghi CA demo vào `.local/firmware/kg_secrets.h` (`MQTT_CA_CERT`) và đặt port 18885. Firmware dùng `WiFiClientSecure` + `setCACert`, handshake timeout 5 s; không có CA thì dùng 18884 như trước. Không dùng `setInsecure()`.
- Banner: `KHOGUARD_M12 ... transport=tls|plain`. ESP32 trong Wokwi không chạy NTP; cần xác nhận mbedTLS chấp nhận chứng chỉ khi chạy thật — **chưa build/chạy**.
- Hàng đợi event 32, ack 4; đầy thì in `EVENT_GAP` và backend thấy gap theo `seq`. Clean session: lệnh của phiên cũ không được giao lại.
