# KhoGuard

Mô phỏng giám sát và điều khiển **một kho lạnh C, một ESP32 ESP-C01 và hai cửa D07–D08** bằng PlatformIO/Wokwi. Giao diện React tiếng Việt nền trắng, backend Node.js, MySQL, MQTT/TLS và dashboard ThingsBoard Cloud bổ sung.

Phạm vi cập nhật 24–25/10/2026. Các khu A/B/D, SIM-C02 và cửa ngoài D07–D08 đã ngừng hoạt động. Dữ liệu và seed MySQL v1 được giữ làm lịch sử, không xuất hiện trong snapshot/báo cáo/giữ chỗ hiện hành.

## Bắt đầu đọc từ đâu

| Tài liệu | Nội dung |
| --- | --- |
| [Linh kiện và nối dây](docs/LINH_KIEN_VA_NOI_DAY.md) | Toàn bộ 30 linh kiện, GPIO, nguồn và giới hạn mô phỏng |
| [Sơ đồ nối dây](docs/diagrams/so-do-noi-day.svg) | Sơ đồ tổng hợp ESP-C01 |
| [Kiến trúc](ARCHITECTURE.md) | Dữ liệu, lệnh cửa, lớp lưu trữ và Cloud |
| [Cấu hình máy](docs/HUONG_DAN_CAU_HINH.md) | Cài và cấu hình lần đầu |
| [Chạy demo](docs/HUONG_DAN_DEMO.md) | Chuẩn bị, kịch bản trình diễn, kết quả đã xác nhận và kết thúc an toàn |
| [Kịch bản thuyết trình](docs/KICH_BAN_THUYET_TRINH.md) | Lời nói mẫu theo đủ 33 trang và câu trả lời thường gặp |
| [ThingsBoard](docs/THINGSBOARD.md) | Cloud phụ, setup, bridge, kiểm tra dữ liệu |
| [Đối chiếu bài thực hành](docs/DOI_CHIEU_BAI_LAB.md) | Ma trận bài thực hành từ tài liệu môn học và project |
| [Lab Python](labs/python/README.md) | GPIO/PWM/Flask giả lập và tiếp nhận hàng bằng Python |
| [Nội dung slide](docs/NOI_DUNG_SLIDE.md) | 33 trang, chia 5 chương, nội dung/hình và lời nói |
| [PowerPoint](docs/slides/KhoGuard-thuyet-trinh.pptx) | Bản thuyết trình 33 trang; nguồn bố cục ở [outline.json](docs/slides/outline.json) |
| [Tài liệu thư mục slide](docs/slides/README.md) | Deck theo template HUIT, outline và cách dựng |
| [Báo cáo Word](docs/Bao_cao_KhoGuard_mot_khu.docx) | Báo cáo đồng bộ với code hiện hành |
| [Quyết định](DESITION.md), [quá trình](QUA_TRINH.md), [công việc](tasks/todo.md) | Lý do thay đổi và kết quả kiểm tra |

## Chức năng

- Đo nhiệt độ/độ ẩm DHT22, trạng thái hai cửa, UID RFID và tín hiệu PIR/vật cản trong Wokwi.
- ESP32 quyết định liên động hai cửa, từ chối đóng khi còn người/tín hiệu chưa rõ, xử lý Panic và cảnh báo mở lâu tại chỗ.
- Website gửi yêu cầu mở, đóng hoặc đặt lại Panic. Chỉ ACK từ firmware mới xác nhận lệnh đã áp dụng.
- MySQL lưu telemetry, sự kiện, cảnh báo, lệnh, tài khoản, lịch ca và giữ chỗ. Viewer xem, operator vận hành, admin xem thêm nhật ký xác thực.
- Kho C có 80 vị trí vật lý, 2 vị trí xả đá, **78 vị trí khả dụng**. Bản seed có 60 vị trí đã chứa. Nhận hàng chỉ dành cho hàng đông lạnh, cảnh báo từ 85%, từ chối yêu cầu mới làm vượt 95%. Chỉ tiêu hàng hóa là demo, chưa có WMS/cảm biến pallet.
- ThingsBoard nhận bản sao snapshot theo quyền viewer mỗi 10 giây. Một bảng khu C và hai biểu đồ môi trường, tổng 3 widget.

## Kiến trúc

```text
DHT22 / RFID / PIR / contact / Panic / HC-SR04
                         │
                    ESP-C01 (Wokwi)
                         │ MQTT/TLS
                    Mosquitto riêng
                         │
                    Backend Node.js ── MySQL
                         ├── REST + WebSocket ── React
                         └── Snapshot viewer ── Bridge ── ThingsBoard Cloud
```

Lệnh cửa đi ngược từ React qua API/MQTT đến ESP32. Firmware kiểm tra an toàn và phản hồi ACK. ThingsBoard hiện chỉ giám sát.

## Công cụ cần có

Windows, Node.js 24, npm, Git, MySQL Server, Mosquitto, VS Code với PlatformIO và Wokwi. Python 3.10+ cùng Flask chỉ cần cho [các bài lab Python](labs/python/README.md), không phải runtime của website/backend. MQTTX/MySQL Workbench là tùy chọn. Cloud không cần Docker/PostgreSQL.

Firmware khóa platform `espressif32@7.0.1`, MQTT 2.5.3, ArduinoJson 7.4.3, DHT 1.4.7, Adafruit Unified Sensor 1.1.15 và MFRC522 1.4.11. PlatformIO cài theo `firmware/platformio.ini`. DHT library hiện giữ theo bản đã build; nếu gặp đọc lỗi, telemetry phải về null, không sửa thành số 0 để che lỗi.

## Cấu hình lần đầu

Mở PowerShell tại thư mục dự án:

```powershell
npm.cmd ci
npm.cmd run infra:setup
# Mở .local/mysql-admin.env, tự điền tài khoản MySQL admin trên máy và lưu.
npm.cmd run infra:db:init
npm.cmd run db:migrate
npm.cmd run auth:setup
# Chạy khi broker dự án chưa bật:
npm.cmd run infra:tls:setup
npm.cmd run firmware:gateway:setup
npm.cmd run firmware:build
```

Máy đã cấu hình không cần chạy lại các bước tạo tài khoản/chứng chỉ. `db:migrate` kiểm tra journal và checksum, không reset DB. `.local/dashboard-users.json` chứa thông tin đăng nhập demo trên máy. Không gửi mật khẩu/key vào chat hay đưa `.local` vào file nộp.

## Khởi động hằng ngày

```powershell
.\run.bat
```

Launcher mở broker, backend, website, gateway và **một** project VS Code `firmware`. Nếu có cấu hình Cloud, nó bật bridge. Trong VS Code nhấn F1 → **Wokwi: Start Simulator**, giữ tab Simulator hiển thị.

```powershell
.\run.bat web     # Chỉ mở dịch vụ/web, chưa bật Wokwi
.\run.bat status  # Xem cổng dịch vụ
.\close.bat       # Dừng tiến trình KhoGuard, giữ MySQL và broker service 1883
```

Có thể mở mỗi lệnh ở terminal riêng: `npm.cmd run infra:mqtt:start`, `npm.cmd run backend:start`, `npm.cmd run dev -- --strictPort`, `npm.cmd run firmware:gateway:start`, `npm.cmd run thingsboard:bridge`.

| Dịch vụ | Địa chỉ |
| --- | --- |
| React | http://127.0.0.1:5173 |
| Backend | http://127.0.0.1:3001 |
| Health / readiness | `/api/health`, `/api/ready` |
| MQTT dự án | 127.0.0.1:18884, TLS 18885 |
| MySQL | 127.0.0.1:3306, schema `khoguard_demo` |
| Wokwi gateway | localhost:9011; forward 9080 theo công cụ upstream |
| Serial Wokwi | localhost:4000 theo `firmware/wokwi.toml` |

Chọn nguồn **Backend / MQTT** và đăng nhập để dùng dữ liệu lưu trong MySQL. **Demo giao diện** là dữ liệu mẫu trong trình duyệt, không điều khiển firmware.

## Thao tác mô phỏng

- MFRC522: chọn Blue Card = DEMO-017, Green = DEMO-018, Red = DEMO-999 (thu hồi). Công tắc chiều HIGH = IN, LOW = OUT.
- Hai công tắc contact: HIGH = mở, LOW = đóng. Servo không tự đổi công tắc.
- HC-SR04: <100 cm là bị chắn, >=100 cm và echo còn mới là thông. Mất echo quá 250 ms được coi là bị chắn.
- PIR: bấm Simulate Motion. Nó chỉ báo chuyển động, không đo người bất động.
- Panic D07/D08: nút đỏ hoặc phím 7/8. Nhả nút không tự xóa latch. Khi đủ điều kiện, operator gửi Đặt lại khẩn cấp trên web.
- Serial hỗ trợ `RFID D07 DEMO-017 IN` và `RFID D07 DEMO-017 OUT` cho kiểm tra tự động.

Các ngưỡng: input debounce 30 ms, DHT/telemetry 2 s, dữ liệu live tối đa 10 s, lệnh cửa TTL 10 s, hành trình contact timeout 10 s, servo biểu diễn hành trình 1,5 s, cảnh báo mở từ 30 s, còi sau 60 s, nghi mắc kẹt sau 5 phút tín hiệu PIR khi hai cửa đóng.

## ThingsBoard Cloud

Tự đăng nhập Cloud, tạo API key theo [hướng dẫn](docs/THINGSBOARD.md), lưu vào `.local/thingsboard-cloud.env` trên máy rồi chạy:

```powershell
npm.cmd run thingsboard:setup
npm.cmd run thingsboard:bridge
# Terminal khác:
npm.cmd run thingsboard:check
```

URL dashboard được in sau setup. Dữ liệu số giữ timestamp gốc; offline/stale/unknown được ghi rõ. Các key nhiều khu cũ còn là lịch sử trên Cloud, dashboard mới chỉ dùng `ESP_C01_*`. Dừng bridge sau demo nếu không cần gửi liên tục.

## Kiểm tra

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run firmware:build
# Broker và MySQL đang chạy; dừng backend, Vite, bridge và Wokwi trước runner:
npm.cmd run verify:all
# Kiểm tra nhanh khi backend, broker và MySQL đang chạy:
npm.cmd run scope:check
```

Runner dùng dữ liệu kiểm thử, có thể giả lập ESP-C01. Không chạy cạnh Wokwi vì cùng danh tính thiết bị. Kết quả trong `.local/verify-all.json`; bằng chứng bản một khu ở `docs/evidence/SINGLE-ZONE-2026-10-24.md`. Kiểm tra tự động không thay thế thao tác Wokwi với linh kiện tương tác.

`close.bat` nhận diện cửa sổ do `run.bat` mở và các tiến trình mang đường dẫn tuyệt đối của dự án. Nếu tự chạy bằng lệnh tương đối trong terminal riêng, dùng Ctrl+C tại terminal đó để dừng. Mã nguồn nhiều khu đã chuyển vào `.local/single-zone-backup-20261024/retired/`; không còn được build hoặc gọi từ launcher.

## Cấu trúc mã nguồn

```text
contracts/       Registry hoạt động, schema và fixtures
firmware/        Một bản ESP-C01, Wokwi, config GPIO và logic C++
server/          API, WebSocket, MQTT ingest, auth và nghiệp vụ
src/             Dashboard React
db/              Migration bất biến, seed v1 và rollback thủ công
integrations/    Chuyển snapshot sang ThingsBoard và tạo dashboard
scripts/         Cấu hình, chạy dịch vụ và kiểm tra
tests/           Kiểm thử JavaScript
docs/            Hướng dẫn, sơ đồ, slide, báo cáo và bằng chứng
tasks/           Kế hoạch và tiến độ thay đổi một khu
.local/          Secret, firmware build, log và bản sao lưu riêng, không vào Git
```

## Xử lý lỗi thường gặp

| Hiện tượng | Kiểm tra |
| --- | --- |
| Web không mở | Chạy Vite, kiểm tra cổng 5173, chạy lại `npm.cmd ci` nếu thiếu module |
| `/api/ready` trả 503 | Xem database/MQTT trong JSON. Bật broker dự án 18885, không nhầm service 1883 |
| ESP offline/stale | Gateway 9011, tab Simulator đang hiển thị, build đúng `.local/firmware-build/esp32dev` |
| Không đóng được cửa | Count/PIR/vật cản/Panic/input/revision. Không có nút ép bỏ liên động |
| Servo quay nhưng cửa chưa đổi | Tự gạt contact đúng trạng thái trước timeout 10 s |
| ThingsBoard báo dữ liệu cũ | Backend, broker, bridge và Wokwi phải chạy. Xem `freshness` và `last_seen_at` |
| DB checksum không khớp | Không sửa migration cũ/reset schema. Giữ nguyên seed v1 và xem nhật ký |

## Giới hạn

Đây là đồ án mô phỏng. PIR LOW không chứng minh kho trống; cách xác minh count khi khởi động dựa trên giả định mô hình. HC-SR04 không phải rèm quang bảo vệ người. Mạch Wokwi không kiểm chứng mức điện áp/cấp dòng/khởi động chân strapping. Đọc [lưu ý nối dây](docs/LINH_KIEN_VA_NOI_DAY.md) trước khi sử dụng sơ đồ ngoài simulator. Chưa đo thời gian đến DOM, chưa chứng nhận an toàn công nghiệp và chưa nghiệm thu phần cứng thật.
