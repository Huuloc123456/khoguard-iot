# KhoGuard — kế hoạch triển khai và kiểm thử

Cập nhật: **12/10/2026**. Phạm vi: đồ án **mô phỏng**, lập trình ESP32 bằng **PlatformIO trong VS Code**, chạy bằng **Wokwi**, dashboard **React nền trắng**, quản lý nhiều cửa và nhiều khu vực. Tài liệu này là kế hoạch; ô chưa đánh dấu là công việc chưa hoàn thành.

## 1. Sau giao diện, làm gì trước?

**M01 và M02 đã đạt ngày 12/10/2026: hợp đồng/validator, broker riêng và schema/account MySQL đã kiểm tra thật. Tiếp theo M03: kiểm tra Wokwi kết nối broker trên máy. Sau đó xây một luồng nhỏ: cảm biến → MQTT → backend → MySQL → dashboard.** Chỉ khi luồng này hoạt động mới bổ sung RFID, liên động cửa, sức chứa và lịch làm việc.

Quyết định: [DESITION.md](DESITION.md). Công việc và kết quả thực tế: [QUA_TRINH.md](QUA_TRINH.md). Hợp đồng M01: [contracts/README.md](contracts/README.md). Người dùng đã chốt **giữ MySQL**; không chuyển MongoDB.

Nguồn yêu cầu:

- `D:\huit\iot\doc\Nhóm_17_42_Phần_1_updated.docx`: kiến trúc IoT, quản lý kho, quyền ra/vào, giám sát môi trường và dashboard.
- `D:\huit\iot\doc\Nhóm_17_42_Phần_2.docx`: kho lạnh, bảo vệ người bên trong, liên động cửa, sức chứa, ca làm việc và bốn kịch bản demo.
- Yêu cầu trực tiếp của người dùng: mô phỏng, không làm phần cứng thực tế; dùng PlatformIO/VS Code; React; quản lý toàn kho; giao diện cơ bản nền trắng.

Nội dung tài liệu Word là yêu cầu tham khảo cho mô hình. Các thiết bị công nghiệp, AI ảnh nhiệt, Safety PLC, VLAN và chứng nhận trong tài liệu không được coi là đã có hoặc đã triển khai trên máy. Mô phỏng phải ghi rõ tín hiệu nào được giả lập.

## 2. Điểm xuất phát đã có

| Hạng mục | Trạng thái và bằng chứng hiện có |
| --- | --- |
| Dashboard React/Vite | Đã có tổng quan, sơ đồ, cửa, môi trường, nhật ký; lọc/tìm kiếm, tiếp nhận cảnh báo, CSV, bốn nút kịch bản |
| Quy mô dữ liệu mẫu | 4 khu vực A–D, 12 cửa; tổng 308 vị trí, 240 vị trí đang sử dụng; dữ liệu trong bộ nhớ trình duyệt |
| Logic mẫu | `src/demo.js`: `createDemo`, `canCloseDoor`, `isTemperatureWarning`, `getSummary` |
| Kiểm thử hiện có | `tests/demo.test.js`: 7 kiểm thử đã đạt ở lần hoàn thiện giao diện; build production đã đạt |
| Hợp đồng M01 | Registry/schema/fixture/validator ở `contracts/`; 23 test contract + 7 test giao diện = 30 test đạt ngày 12/10/2026; chưa là kết nối IoT thật |
| Kiểm tra trình duyệt | Các màn hình và kịch bản đã được kiểm tra; bố cục ở chiều rộng 320, 390, 825 và 1440 px |
| Firmware | Đã build thử ESP32 ở bước kiểm tra công cụ; **chưa có firmware của KhoGuard trong repository** |
| MQTT | Broker dự án 127.0.0.1:18884, 7 account/ACL riêng; 11 kiểm tra MQTT thật đạt. Dashboard/backend/ESP32 chưa nối; TLS chưa cấu hình |
| MySQL | Đã tạo khoguard_demo/infra_meta, runtime/migration account riêng; 6 kiểm tra DB thật đạt. Chưa bảng/dữ liệu nghiệp vụ |
| Chưa có | Backend/API/WebSocket dữ liệu thật, xác thực ứng dụng, TLS, lưu telemetry nghiệp vụ, WMS, liên động edge, kiểm thử Wokwi/end-to-end |

Các kịch bản hiện tại tạo lại snapshot mẫu, không phải chuỗi sự kiện từ firmware. Nút tiếp nhận chỉ đánh dấu đã xem, không xóa điều kiện nguy hiểm. Test panic hiện tại có cửa mẫu vốn đang mở; cần test riêng chuyển trạng thái **đóng → nhấn panic → mở** khi xây bộ điều khiển.

## 3. Công cụ: đã có, cần cấu hình, có thể bỏ qua

Phiên bản dưới đây là kết quả kiểm tra môi trường trong phiên làm việc ngày 12/10/2026; kiểm tra lại trước khi khóa phiên bản cho bản bàn giao.

| Công cụ | Tình trạng | Việc tiếp theo |
| --- | --- | --- |
| VS Code 1.141 | Đã cài | Mở workspace KhoGuard, dùng terminal tích hợp |
| PlatformIO extension 3.3.4 / Core 6.2.0 | Đã cài, build ESP32 thành công | Tạo `firmware/platformio.ini`, khóa platform/thư viện đã kiểm chứng |
| Wokwi extension 4.0.0 | Đã cài | Kiểm tra license/quyền chạy, tạo sơ đồ và kiểm tra private gateway |
| Node.js 24.19 / npm 11.17 | Đã cài | Dùng cho frontend, backend và script giả lập các node còn lại |
| Git 2.55 | Đã cài; repository đã có commit giao diện | Ghi từng thay đổi có thể kiểm chứng; không đổi cấu hình Git toàn máy |
| Python 3.12.10 | Đã cài | Công cụ phụ để đọc tài liệu; không bắt buộc cho runtime |
| Mosquitto 2.1.2 | Dịch vụ cũ và broker dự án riêng đang chạy | ACL/account đã có; cấu hình TLS ở M12 |
| MQTTX 1.13.1 | Đã cài | Quan sát topic/payload, thử dữ liệu hợp lệ/sai, kiểm tra quyền truy cập |
| MySQL Server 26.7.0 / service `MySQL267` | Đang chạy 3306; schema/account riêng đã tạo | Migration/seed nghiệp vụ ở M04 |
| MySQL Workbench 8.0.47 / TablePlus 26.10.2 | Đã cài | Chọn một công cụ để xem bảng; không cần dùng cả hai |
| Postman 12.29 | Đã cài | Lưu bộ request API và biến môi trường không chứa secret trong Git |
| React / Vite | Đã có trong dự án | Giữ cấu trúc giao diện hiện tại; dùng `package-lock.json` |
| Docker Desktop 4.90, CLI 29.7, Compose 5.5.1 | Đã cài; engine chưa chạy ở lần kiểm tra | Tùy chọn đóng gói sau; không phải điều kiện để bắt đầu |
| WSL2 / Ubuntu | Đã có | Tùy chọn; ưu tiên chạy native Windows đang có |
| Arduino IDE 2.3.10 | Đã cài | Không cần cho luồng PlatformIO |

**Chưa cần cài thêm phần mềm hệ thống.** M01 có Ajv/ajv-formats dev dependency; M02 có mqtt/mysql2 ở manifest gốc cho kết nối. Express/ws chưa có, bổ sung ở mốc backend. .npmrc chặn install lifecycle scripts, clean install đã kiểm chứng. Validator dùng runtime phải có dependency runtime tương ứng. Chọn thư viện MQTT firmware sau thử tương thích ESP32, QoS, reconnect và TLS; không chọn chỉ vì ví dụ ngắn.

Kiểm thử dùng `node:test` đã có. Kiểm thử firmware thuần logic dùng PlatformIO/native khi toolchain tương ứng khả dụng; adapter ESP32 vẫn phải build và chạy Wokwi. Chỉ thêm Playwright vào dev dependency khi viết kiểm thử trình duyệt có thể chạy lại. Không cần Redis, Kubernetes, Node-RED, driver USB hay phần mềm PLC cho phạm vi mô phỏng.

Tham khảo chính thức: [Express](https://expressjs.com/en/starter/installing/), [MQTT.js](https://github.com/mqttjs/MQTT.js), [mysql2](https://sidorares.github.io/node-mysql2/docs).

## 4. Phạm vi mô hình và điều kiện hoàn thành

- Giữ 4 khu vực/12 cửa làm bộ dữ liệu demo; thử tải bằng 50 node logic để đánh giá khả năng mở rộng.
- Một ESP32 Wokwi mô phỏng bộ điều khiển khu C với hai cửa liên động. Các khu/cửa còn lại do script Node gửi MQTT cùng hợp đồng dữ liệu; mỗi thiết bị có ID và nguồn riêng.
- Tín hiệu cửa, beam, hiện diện mmWave, panic, RFID được mô phỏng bằng nút/công tắc/sự kiện. CO₂, ảnh nhiệt và kết quả AI dùng giá trị giả lập nếu Wokwi không có linh kiện tương ứng; không tuyên bố đo hay nhận diện thực tế.
- Dashboard hiển thị nguồn `Wokwi`, `node giả lập` hoặc `demo giao diện`; trạng thái kết nối và thời điểm cập nhật phải nhìn thấy được.
- Bộ điều khiển cục bộ quyết định cho phép đóng cửa; backend/dashboard không được bỏ qua điều kiện an toàn.
- Dữ liệu và nhật ký tồn tại sau khi tải lại trang hoặc khởi động lại backend. Kho dữ liệu demo có thể reset bằng thao tác rõ ràng, chỉ trong môi trường demo.
- Đủ bốn kịch bản trong tài liệu và các kiểm thử lỗi; có hướng dẫn để người khác chạy lại trên máy Windows.

Đây là mô hình phần mềm để trình diễn nguyên lý. Nó không thay thế Safety PLC/relay độc lập, cơ cấu mở bằng tay hay kiểm định thiết bị của hệ thống thật. Không đưa thời gian phản ứng mô phỏng thành cam kết an toàn phần cứng.

## 5. Kiến trúc và cấu trúc dự kiến

```text
ESP32 trong Wokwi ── MQTT ──┐
                           ├── Mosquitto riêng ── Node backend ── MySQL riêng
Script node giả lập ─ MQTT ─┘                         │
                                              REST + WebSocket
                                                    │
                                              React dashboard
```

Luồng điều khiển: người vận hành → API có quyền → MQTT command có hạn dùng → edge kiểm tra điều kiện → thực hiện hoặc từ chối → ack + telemetry → dashboard. Publish thành công không có nghĩa cửa đã thực hiện lệnh.

Giữ frontend ở `src/`. Cấu trúc bổ sung theo từng mốc, không tạo sẵn các thư mục rỗng:

```text
contracts/            JSON Schema, ví dụ message/API và bảng topic
server/               HTTP, WebSocket, MQTT, DB, quy tắc và kiểm thử backend
firmware/             platformio.ini, wokwi.toml, diagram.json, src/, test/
scripts/              giả lập các node, chạy kịch bản và kiểm tra kết nối
db/migrations/        migration SQL có thứ tự
db/seeds/             dữ liệu demo, chỉ chạy vào schema KhoGuard
infra/mosquitto/      cấu hình mẫu, ACL mẫu; secret/chứng chỉ riêng không vào Git
tests/integration/    kiểm thử broker–backend–DB
tests/e2e/            kiểm thử trình duyệt
docs/evidence/        kết quả, ảnh và số liệu kiểm thử đã thực sự chạy
```

Quyết định: dùng Node vì máy và dự án đã có; MySQL/Mosquitto native để giảm công cụ cần bật; SQL migration trực tiếp đủ cho quy mô đồ án. Tách quy tắc thuần khỏi adapter I/O để kiểm thử. Chỉ thêm abstraction hoặc dịch vụ khác khi một yêu cầu cụ thể cần đến.

## 6. Cấu hình môi trường riêng và bảo mật

### 6.1. Broker

Broker hiện tại có listener `1883` trên `0.0.0.0`, `allow_anonymous false` và password file riêng. Chưa xác nhận cấu hình TLS. **Không sửa password file, mở anonymous, dừng dịch vụ hay thay cấu hình hiện tại để tiện demo.**

Tạo broker riêng từ executable đã cài, chạy foreground để thấy lỗi. Cổng dự kiến: `18884` cho thử cục bộ có xác thực, `18885` cho MQTT/TLS; kiểm tra cổng trống trước. Bind loopback nếu private gateway truy cập được; chỉ mở địa chỉ LAN cụ thể khi đã chứng minh cần thiết. Không mở cổng Internet.

- Tài khoản theo thiết bị; ACL chỉ cho publish/subscribe topic được gán. Backend có quyền tổng hợp, không dùng tài khoản admin broker.
- Dùng CA demo riêng và chứng chỉ có SAN phù hợp hostname thật sự được client dùng. Kiểm tra đúng/sai CA và hostname; không dùng `setInsecure()` làm trạng thái hoàn thành.
- Password, private key và cấu hình chứa secret lưu ngoài Git. Cấu hình mẫu chỉ có placeholder.
- Chỉ cho phép listener thử không TLS trong môi trường localhost demo; mốc bàn giao MQTT/TLS phải có test xác minh riêng.

Nguồn cấu hình: [Mosquitto — listener, authentication, ACL và TLS](https://mosquitto.org/man/mosquitto-conf-5.html).

### 6.2. MySQL và ứng dụng

- Đã tạo schema `khoguard_demo` bằng account được phép; có marker ownership và runtime/migration account riêng, không sửa schema khác.
- Tài khoản migration có quyền DDL riêng; tài khoản runtime chỉ có quyền cần thiết trên schema KhoGuard. Dùng pool và prepared statements.
- Backend bind `127.0.0.1`, cổng dự kiến `3001`; frontend Vite `5173`. Dùng Vite proxy `/api` và `/ws` để tránh cấu hình CORS rộng.
- Secret ở `.env` backend hoặc file local bị ignore; `.env.example` chỉ mô tả biến. Mọi biến `VITE_*` có thể xuất hiện ở trình duyệt nên không chứa password/token broker/DB.
- Dashboard không kết nối trực tiếp broker bằng tài khoản có quyền điều khiển. API/WebSocket phải kiểm tra quyền, input, origin và kích thước message.
- Phiên đăng nhập dùng cookie HttpOnly, giới hạn thời gian và bảo vệ request thay đổi trạng thái. Nếu truy cập ngoài localhost phải cấu hình HTTPS và cookie Secure trước.
- Log không chứa password, khóa bí mật hoặc toàn bộ token; thẻ RFID demo dùng mã giả, không thông tin cá nhân thật.

### 6.3. Wokwi và PlatformIO

Tạo `wokwi.toml` và `diagram.json` trong `firmware/`; build trước khi khởi động simulator. Đường dẫn firmware dự kiến `.pio/build/esp32dev/firmware.bin` và ELF tương ứng, dùng dấu `/` trong TOML. [Cấu hình Wokwi cho VS Code](https://docs.wokwi.com/vscode/project-config).

ESP32 ảo không dùng `127.0.0.1` để chỉ máy Windows. Khi dùng private gateway, hostname truy cập máy là `host.wokwi.internal`. Public gateway không truy cập được mạng cục bộ. Phải kiểm tra license, gateway trong VS Code và publish thực tế trước khi coi đường truyền đã xong. Không tự mua gói trả phí. [Mạng ESP32 trong Wokwi](https://docs.wokwi.com/guides/esp32-wifi).

Nếu Wokwi chưa chạy/kết nối được do license, vẫn phát triển backend bằng script MQTT và đánh dấu tích hợp Wokwi chưa đạt. Script không thay thế bằng chứng firmware chạy trong simulator. Cảm biến không được hỗ trợ dùng input giả lập có chú thích; không dựng AI nhận diện ảnh chỉ để đủ tên trong sơ đồ.

## 7. Hợp đồng dữ liệu phải chốt ở M01

### 7.1. Định danh và topic

ID ổn định: `WH01`, khu `A/B/C/D`, cửa `D01..D12`, thiết bị như `ESP-C01`. Bảng cấu hình gán thiết bị–khu–cửa là nguồn kiểm tra quyền; không tin `zone_id` do client tự khai.

| Topic dự kiến | Nội dung | Chính sách |
| --- | --- | --- |
| `khoguard/v1/WH01/devices/{id}/telemetry` | Snapshot cảm biến và trạng thái bộ điều khiển | QoS 1; chỉ retain snapshot có timestamp, boot ID và sequence |
| `khoguard/v1/WH01/devices/{id}/events` | RFID, panic, thay đổi cửa, từ chối lệnh | QoS 1, không retain; có event ID để chống trùng |
| `khoguard/v1/WH01/devices/{id}/status` | Online/offline, boot ID, heartbeat | Retain; Last Will offline; offline không đồng nghĩa hết người |
| `khoguard/v1/WH01/devices/{id}/commands` | Yêu cầu điều khiển | Không retain; command ID, TTL, expected revision |
| `khoguard/v1/WH01/devices/{id}/acks` | Kết quả lệnh và lý do từ chối | Không retain; tham chiếu command ID |

Envelope đã chốt ở M01: `schema_version`, `warehouse_id`, `device_id`, `boot_id`, `session_id`, `seq`, `kind`, `clock_synced`, `sent_at`, `uptime_ms`, `payload`; event thêm `event_id`. `sent_at` là UTC ISO 8601, độ chính xác tối đa mili giây khi clock đã đồng bộ; nếu chưa đồng bộ thì null, không bịa timestamp. Backend luôn ghi `received_at` riêng. Session ID đổi mỗi reconnect, boot ID đổi khi reboot; Last Will phiên cũ không được đánh offline phiên mới.

Payload gồm cửa open/closed/unknown, beam clear/blocked/unknown, presence true/false/unknown, occupancy và độ tin cậy, panic latch, nhiệt độ °C, độ ẩm %, CO₂ ppm nếu mô phỏng. Không dùng `0` thay cho null/mất cảm biến. Ràng buộc kiểu, miền giá trị, độ dài, trường bắt buộc và giới hạn kích thước được định nghĩa trong schema.

QoS 1 có thể giao trùng: khóa chống trùng `(device_id, boot_id, kind, seq)` cho data stream và `(device_id, event_id)` cho event; message cũ không ghi đè snapshot mới. Đổi boot ID phải tạo phiên mới hợp lệ, không chấp nhận boot cũ quay lại làm trạng thái hiện hành. Status/Last Will xử lý theo phiên, không lấy thứ tự seq telemetry để quyết định. Retained message không tự chứng minh thiết bị đang online. Ingest/dedupe thực tế làm ở M05/M12; M01 mới chốt quy tắc.

Đề xuất telemetry mỗi 2 giây, stale sau 10 giây; thông số cấu hình và kiểm thử được. Sequence bảo vệ thứ tự, thời gian nhận hỗ trợ freshness nhưng không được làm message retained cũ trở thành mới. Khi không xác định được độ mới sau reboot, hiển thị unknown cho tới xác nhận phiên hoạt động.

### 7.2. API và cập nhật giao diện

| API dự kiến | Chức năng và giới hạn |
| --- | --- |
| `GET /api/health` | Liveness backend; không lộ secret |
| `GET /api/ready` | Readiness DB/broker; trả trạng thái suy giảm rõ ràng |
| `GET /api/snapshot` | Kho, khu, cửa, cảnh báo, connection/freshness và revision |
| `GET /api/events` | Filter thời gian/khu/loại, phân trang, giới hạn số bản ghi |
| `GET /api/telemetry` | Lịch sử theo thiết bị và khoảng thời gian có giới hạn |
| `POST /api/alerts/{id}/ack` | Đánh dấu tiếp nhận, lưu người/thời gian; không reset panic hoặc xóa điều kiện |
| `POST /api/doors/{id}/commands` | Yêu cầu hợp lệ có quyền, deadline, kiểm tra revision; trả command ID |
| `GET /api/commands/{id}` | Pending/applied/rejected/expired; reason code cụ thể |
| `POST /api/admissions` | Kiểm tra quyền/sức chứa và giữ chỗ nguyên tử |
| `POST /api/reservations/{id}/confirm` hoặc `/cancel` | Chuyển trạng thái đúng một lần; idempotent |
| API phiên đăng nhập/lịch ca | Chỉ thêm ở mốc phân quyền; role viewer/operator/admin |
| `POST /api/demo/scenarios/{id}` | Chỉ bật trong môi trường demo, có quyền; reset dữ liệu demo được ghi audit |

WebSocket `/ws`: gửi snapshot ban đầu và update có revision. Khi phát hiện mất revision, client tải lại snapshot; reconnect có backoff và giới hạn buffer. Backend quyết định trạng thái, frontend chỉ hiển thị và gửi yêu cầu. Không đổi biểu tượng cửa thành mở chỉ vì HTTP trả 202. Hiển thị lỗi, chờ ack và timeout bằng tiếng Việt.

Tách nguồn dữ liệu giao diện qua một adapter nhỏ: demo snapshot hiện tại và API/WebSocket. Các component đang có tiếp tục được dùng. Không tự rơi về số liệu giả khi API lỗi; phải hiển thị mất kết nối hoặc cho người dùng chủ động chọn demo.

### 7.3. Lưu trữ

Tạo bảng theo mốc, không tạo toàn bộ ngay: cấu hình warehouse/zones/doors/devices; telemetry, current state, events; alerts/acknowledgments; command history; users/roles/cards/access events/shifts; slots/reservations/inbound records. Dùng khóa ngoại, unique key chống trùng, index theo thiết bị/khu/thời gian và migration có phiên bản.

Ghi event, cập nhật trạng thái và tạo cảnh báo liên quan trong transaction phù hợp. MQTT transport ack không đồng nghĩa DB đã lưu; không hứa không mất log khi DB hỏng. Nếu yêu cầu sự kiện quan trọng được gửi lại, thêm application ack **sau commit** và hàng đợi/replay có giới hạn ở nguồn gửi. Khi hàng đợi đầy phải báo gap, không âm thầm coi dữ liệu đầy đủ.

## 8. Quy tắc nghiệp vụ và an toàn cần triển khai

### 8.1. Cửa kho lạnh và hiện diện

Điều kiện cho phép đóng cửa bình thường:

```text
close_allowed = count_known AND current_occupants == 0
                AND beam_known AND beam_clear
                AND presence_known AND NOT presence
                AND NOT panic_latched
                AND local_inputs_healthy
```

- Mất/unknown cảm biến hoặc số người chưa đáng tin cậy → chặn đóng, báo rõ lý do. Nút trên dashboard không được bỏ qua cổng này.
- RFID ra/vào phải gắn hướng, chống đọc lặp, kiểm tra quyền và không đưa số người âm. Khởi động lại không mặc định count = 0 là an toàn; cần khôi phục/xác minh trạng thái.
- `current_occupants = 0` nhưng mmWave còn người → chặn đóng và cảnh báo sai lệch; không tự xóa presence cho khớp RFID.
- Hai cửa khu C liên động: bình thường không cho cùng mở; quy tắc thoát hiểm ưu tiên khi panic. Chốt thứ tự chuyển trạng thái, test hai lệnh đến đồng thời.
- Beam bị chặn khi đang đóng → hủy đóng/đảo chiều trong mô phỏng; khi dùng thực tế cần đường bảo vệ phần cứng độc lập.
- Panic tại hai vị trí nút mô phỏng → latch khẩn cấp, nhả khóa/mở theo mô hình, bật đèn/còi/sưởi theo cấu hình; không cần broker/backend còn hoạt động.
- Tiếp nhận cảnh báo không reset panic. Reset là thao tác riêng có quyền và chỉ được thực hiện khi điều kiện cục bộ cho phép; log mọi lần reset/từ chối.
- Chạy timer cục bộ không blocking; debounce nút/công tắc. Dùng thời gian monotonic cho khoảng chờ, không phụ thuộc đồng hồ hệ thống bị chỉnh.

### 8.2. Timer và môi trường

- Chọn ngưỡng demo rõ ràng: cửa mở **từ 30 giây** cảnh báo, **trên 60 giây** tăng mức; cấu hình có thể đổi mức đầu trong khoảng 30–45 giây theo tài liệu.
- Hiện diện liên tục khi cửa đóng **trên 5 phút** → cảnh báo mắc kẹt, thông báo tại chỗ và sự kiện backend; ghi rõ trạng thái quạt/đèn theo mô hình.
- Đóng cửa, hết hiện diện hoặc đổi phiên phải reset timer đúng quy tắc; kiểm tra ranh giới bằng clock giả. Có chế độ chạy nhanh demo nhưng giao diện/log phải ghi hệ số, không âm thầm đổi ngưỡng chính thức.
- Nhiệt độ ngoài giới hạn của từng khu → cảnh báo; thêm hysteresis/cooldown có cấu hình để tránh báo liên tục. Mất dữ liệu là cảnh báo thiết bị, không coi nhiệt độ 0 °C.
- Thông báo tại chỗ và dashboard bắt buộc; SMS/Telegram là phần mở rộng cần tài khoản/secret và kênh người nhận được cho phép, chưa có trong phạm vi tích hợp ban đầu.

### 8.3. Sức chứa và vị trí

- Trạng thái vị trí: Empty, Reserved, Occupied, Cooling/Defrost; vị trí không đủ điều kiện không được phân bổ.
- Vị trí phù hợp phải thỏa nhiệt độ, kích thước và tải trọng theo dữ liệu cấu hình demo. Thông số chưa có trong tài liệu cần ghi là giả định, không trình bày như đo thực tế.
- Mức sử dụng phục vụ quyết định phải tính cả Occupied + Reserved trên tổng vị trí khả dụng, không dùng phần trăm đã làm tròn của UI. Các vị trí Cooling/Defrost loại khỏi khả dụng theo quy tắc đã chốt.
- Từ 85% cảnh báo vàng; từ 95% đỏ và từ chối nhận thêm, hoặc từ chối sớm nếu không có vị trí phù hợp. Chốt kiểm tra tỷ lệ **dự kiến sau giữ chỗ** để không vượt mức tối đa; tránh khóa nhầm trước ranh giới do làm tròn.
- Giữ chỗ 15 phút, confirm/cancel/expire chỉ có một kết quả cuối. Thời gian tính ở backend/DB, không lấy clock trình duyệt.
- Transaction khóa hàng quản lý sức chứa kho trước, rồi vị trí theo thứ tự ổn định để hai yêu cầu vào hai slot khác nhau không cùng vượt ngưỡng. Có timeout/deadlock retry giới hạn và kiểm thử đồng thời.
- Buffer 5–10% và vùng staging dùng cấu hình riêng; giải thích quan hệ với ngưỡng 95% để không trừ buffer hai lần. Staging ùn tắc chặn nhận thêm dù tổng kho còn trống.

### 8.4. Quyền ra/vào và ca làm việc

- Role viewer chỉ xem; operator tiếp nhận cảnh báo/yêu cầu được phép; admin quản lý cấu hình và quyền. Kiểm tra quyền trên backend, không chỉ ẩn nút.
- Thẻ và lịch ra/vào demo thay cho WMS thật; adapter WMS thật chỉ triển khai khi có API và dữ liệu hợp lệ.
- Ca bắt đầu 06:00 và 18:00 theo Asia/Bangkok; chốt kết thúc, quyền và quy tắc ca qua nửa đêm. Dùng khoảng `[start, end)` để không có hai ca trùng tại mốc đổi ca. Lưu UTC, hiển thị giờ địa phương.
- Trong ca vẫn Armed dù count = 0. Ngoài ca và không có lịch tiếp theo có thể chuyển chế độ tiết kiệm theo cấu hình; không tắt panic/beam/bảo vệ người.
- Ra/vào trái phép là sự kiện an ninh riêng; điều kiện nguy hiểm là cảnh báo an toàn. Không vì thẻ không hợp lệ mà ngăn người bên trong thoát hiểm.

## 9. Lộ trình chi tiết, phụ thuộc và nghiệm thu

Mỗi mốc là một phần có thể trình diễn và kiểm tra riêng. Ưu tiên một mốc đang làm; nếu phải sửa nhiều tầng, chia commit theo luồng dữ liệu. Thời lượng chỉ lập sau khi biết license Wokwi và quyền DB, không cam kết thời hạn trước khi kiểm tra hai điểm này.

### M00 — Giao diện hiện tại

- [x] Dashboard nền trắng, 4 khu/12 cửa và bốn kịch bản mẫu.
- [x] 7 test logic mẫu, build và kiểm tra trình duyệt ở lần hoàn thiện giao diện.
- Giới hạn: frontend local; không dùng các ô này để đánh dấu tích hợp IoT đã hoàn thành.

### M01 — Khóa hợp đồng và quy tắc

- [x] Định nghĩa schema message, topic/ACL dự kiến, device mapping, API snapshot, reason code và freshness.
- [x] Ghi quy tắc đóng cửa, panic/interlock, tỷ lệ sức chứa và ca làm việc thành bảng ví dụ input/output.
- Phụ thuộc: M00. Phạm vi: `contracts/`, fixture kiểm thử; chưa thay UI.
- Nghiệm thu: JSON mẫu hợp lệ được nhận; sai kiểu/ID/phiên bản bị từ chối; ví dụ có unknown, trùng seq, reboot và timeout. Lựa chọn ngưỡng/giả định được ghi rõ.
- Kết quả ngày 12/10/2026: 30/30 test đạt, build đạt; [bằng chứng M01](docs/evidence/M01-2026-10-12.md). Validator stateless kiểm tra contract; chưa triển khai consumer, DB, command execution hay safety controller. Các API ngoài snapshot sẽ chốt chi tiết ở mốc triển khai tương ứng.

### M02 — Môi trường broker và DB riêng

- [x] Tạo cấu hình broker, tài khoản/ACL, .env.example, kiểm tra cổng; tạo schema/bootstrap infrastructure bằng quyền được cấp.
- [x] Kiểm tra publish/subscribe hợp lệ, từ chối sai mật khẩu/topic; tạo kết nối DB bằng tài khoản runtime.
- Phụ thuộc: M01. Phạm vi: `infra/mosquitto/`, `db/`, cấu hình local bị ignore.
- Nghiệm thu: không ảnh hưởng broker/schema cũ; không có secret trong Git; có hướng dẫn start/stop broker riêng và test DB. TLS phải có bằng chứng riêng ở M12.
- Kết quả: 35 unit/contract test, 11 MQTT probe, 6 MySQL probe và 5 URL secret bị chặn đạt; clean install/build đạt. [Hướng dẫn infra](infra/README.md), [bằng chứng M02](docs/evidence/M02-2026-10-12.md). Chưa schema nghiệp vụ/ingest/UI dữ liệu thật; làm M04–M06.

### M03 — Probe PlatformIO/Wokwi và mạng

- [ ] Tạo firmware tối thiểu, `diagram.json`, `wokwi.toml`; xác minh license/gateway.
- [ ] Publish một message hợp schema từ ESP32 Wokwi vào broker dự án và xem bằng MQTTX.
- Phụ thuộc: M01, broker ở M02. Phạm vi: `firmware/`, hướng dẫn cấu hình gateway.
- Nghiệm thu: build lặp lại được; simulator thật chạy và message có đúng device ID; broker mất rồi khôi phục thì reconnect không treo loop. Nếu license chặn, đánh dấu mốc chưa đạt và tiếp tục backend bằng script.

### M04 — Backend nền tảng và migration

- [ ] Tạo server HTTP, config validation, pool DB, migration/seed khu–cửa–thiết bị và health/readiness.
- [ ] Tạo kiểm thử lỗi cấu hình, DB mất kết nối và migration lặp lại.
- Phụ thuộc: M02. Phạm vi: `server/`, `db/migrations/`, `db/seeds/`.
- Nghiệm thu: thiếu secret thì fail rõ ràng; query có parameter; DB lỗi không trả dữ liệu thành công giả; không có endpoint điều khiển mở công khai.

### M05 — Luồng môi trường đầu tiên đến DB/API

- [ ] Backend subscribe một node; validate/dedupe, lưu telemetry và trả snapshot/API lịch sử.
- [ ] Script tạo nhiệt độ/humidity hợp lệ và dữ liệu sai, cũ, trùng.
- Phụ thuộc: M01, M04. Phạm vi: MQTT ingest, schema adapter, repository DB, integration test.
- Nghiệm thu: một message đi tới DB/API; trùng không nhân đôi event; message sai không đổi current state; API lịch sử có giới hạn.

### M06 — Dashboard nhận dữ liệu backend

- [ ] Tạo adapter API/WebSocket và mode demo rõ ràng; giữ component/bố cục đang có.
- [ ] Hiển thị loading, lỗi, stale, nguồn thiết bị; reconnect/resync khi thiếu revision.
- Phụ thuộc: M05. Phạm vi: adapter mới, `src/App.jsx`, component trạng thái kết nối và test.
- Nghiệm thu: đổi nhiệt độ MQTT thấy trên UI mà không reload; reload vẫn có dữ liệu DB; dừng backend thấy mất kết nối, không tự dùng số giả.

**Checkpoint A:** chứng minh message → DB → API → UI. Nếu M03 đạt, dùng chính Wokwi làm nguồn; nếu chưa đạt, ghi nguồn script và điểm bị chặn.

### M07 — Firmware đọc input và đưa trạng thái cửa

- [ ] Nối input mô phỏng beam, door contact, presence, panic và cảm biến môi trường; gán chân/input trong sơ đồ.
- [ ] Tách hàm quyết định thuần khỏi GPIO/MQTT, publish snapshot và event đúng schema.
- Phụ thuộc: M03, M05. Phạm vi: adapter firmware, pin config, sơ đồ, test mapping.
- Nghiệm thu: từng input chỉ ảnh hưởng thiết bị được gán; debounce đúng; ngắt broker vẫn đọc input và xử lý loop.

### M08 — RFID và số người

- [ ] Xử lý thẻ giả lập với hướng vào/ra, whitelist, chống lặp và sự kiện bị từ chối.
- [ ] Số người không âm; reboot/lost events chuyển count sang chưa xác minh khi cần.
- Phụ thuộc: M07. Phạm vi: occupancy rule, firmware adapter, event ingest, test.
- Nghiệm thu: một lượt vào tăng một, ra giảm một; đọc lặp không tăng thêm; thẻ trái phép không cấp quyền; count 0 + presence vẫn chặn đóng.

### M09 — Bộ quy tắc an toàn cục bộ

- [ ] Triển khai close gate, beam reverse, panic latch/reset và interlock hai cửa trong module thuần.
- [ ] Kiểm thử toàn bộ tổ hợp cổng đóng, hai yêu cầu đồng thời, unknown và ưu tiên panic.
- Phụ thuộc: M01, M08. Phạm vi: module rule và test firmware; không gom API/UI vào mốc này.
- Nghiệm thu: một điều kiện không an toàn đủ chặn đóng; panic mở từ trạng thái đóng; ack không reset latch; hai cửa không cùng mở trong chế độ bình thường.

### M10 — Gắn quy tắc vào Wokwi và lệnh có ack

- [ ] Adapter áp dụng output giả lập khóa/đèn/còi/sưởi/quạt; backend gửi command có ID, TTL và expected revision.
- [ ] UI hiển thị pending/applied/rejected/expired, reason code; edge từ chối lệnh không an toàn/hết hạn.
- Phụ thuộc: M06, M09. Phạm vi: firmware adapter, command service, UI trạng thái lệnh, integration test.
- Nghiệm thu: gửi lệnh không tự đổi cửa trên UI; lệnh trùng không thực hiện lại; lệnh cũ không chạy sau reconnect; panic hoạt động khi backend/broker dừng.

### M11 — Cảnh báo, timer và tiếp nhận

- [ ] Timer cửa mở, trapped-person, môi trường/hysteresis; trạng thái active/acknowledged/resolved riêng.
- [ ] Lưu audit tiếp nhận và hiển thị cùng điều kiện tại khu/cửa; giới hạn phát cảnh báo lặp.
- Phụ thuộc: M07, M09, M10. Phạm vi: rule timer, alerts DB/API, adapter UI, test.
- Nghiệm thu: đúng ranh giới 30 s, >60 s, >5 phút; tiếp nhận không xóa nguy hiểm; điều kiện hết thì resolve đúng; timer local vẫn chạy khi mất mạng.

### M12 — TLS, offline và phục hồi

- [ ] Hoàn thiện TLS, ACL và lỗi CA/hostname; last will, heartbeat, stale, restart/reconnect.
- [ ] Giới hạn queue/retry; xác định dữ liệu nào replay được, phát hiện gap và ứng xử khi DB không ghi được.
- Phụ thuộc: M05, M10, M11. Phạm vi: cấu hình TLS, MQTT session, firmware reconnect, fault test.
- Nghiệm thu: sai CA/quyền bị từ chối; retained cũ không thành online; reboot không tự count 0; phục hồi không áp dụng lệnh hết hạn hay nhân đôi RFID.

**Checkpoint B:** demo bảo vệ người trong Wokwi với broker bật/tắt, các trạng thái unknown và bằng chứng panic đóng → mở. Chưa đạt checkpoint này thì không trình bày như đã hoàn thành bảo vệ cục bộ.

### M13 — Phiên đăng nhập, quyền, ca và an ninh

- [ ] Thêm viewer/operator/admin, thẻ demo, lịch ca và access audit; seed tài khoản qua secret local.
- [ ] Bảo vệ REST/WebSocket, request thay đổi trạng thái và mode demo; thử ca qua nửa đêm.
- Phụ thuộc: M04, M10, M12. Chia hai phần nhỏ: xác thực/quyền trước, ca/thẻ sau.
- Nghiệm thu: viewer bị backend từ chối thao tác; API không đăng nhập bị từ chối; mốc 06:00/18:00 đúng; ngoài ca không tắt bảo vệ người; chưa gọi WMS thật.

### M14 — Giữ chỗ và điều kiện nhận hàng

- [ ] Seed slot có nhiệt độ/kích thước/tải trọng; tính available/occupied/reserved; transaction giữ chỗ, confirm/cancel/expire.
- [ ] Kiểm tra 85%/95%, buffer/staging, không có slot phù hợp và hai request đồng thời.
- Phụ thuộc: M04, M13. Chia rule/transaction trước, API/UI sau.
- Nghiệm thu: không cấp một slot hai lần; không vượt sức chứa sau hai request; hết hạn 15 phút đúng; tỷ lệ làm tròn trên UI không quyết định nhận hàng.

### M15 — Lịch sử, báo cáo và CSV

- [ ] Nối nhật ký hiện có với DB; filter/phân trang, lịch sử cảnh báo, lệnh và nhận hàng.
- [ ] Xuất CSV từ tập dữ liệu đã chọn, UTF-8, escape delimiter/quote và phòng ô bị hiểu là công thức.
- Phụ thuộc: M11, M13, M14. Phạm vi: events/report API, `src/DataTables.jsx`, export helper và test.
- Nghiệm thu: filter trên UI khớp dữ liệu lưu; dữ liệu còn sau restart; CSV có tiếng Việt đúng và không chứa secret.

### M16 — Tích hợp toàn kho, tải và lỗi

- [ ] Script tái hiện 12 cửa/4 khu và mở rộng 50 node; kịch bản quyết định được với seed/clock rõ ràng.
- [ ] Chạy ma trận mục 10, kiểm tra UI responsive, quyền, reboot, broker/DB/backend lỗi và tài nguyên.
- Phụ thuộc: M12–M15; M03 phải đạt trước khi đánh dấu tích hợp Wokwi hoàn thành.
- Nghiệm thu: bốn demo đi qua nguồn MQTT/DB; không chỉ thay mảng frontend; kết quả tải/lỗi có số liệu và bằng chứng.

### M17 — Đóng gói và bàn giao đồ án

- [ ] README hướng dẫn từ máy sạch đã đủ công cụ: cấu hình secret, migration, start, build firmware, Wokwi, reset demo, test và xử lý lỗi.
- [ ] Lưu collection Postman không secret; sơ đồ/topic/bảng dữ liệu, checklist demo và evidence; khóa dependency đã thử.
- Phụ thuộc: M16. Phạm vi: README, docs, mẫu config và kết quả thực tế.
- Nghiệm thu: người khác chạy lại bốn demo theo hướng dẫn; clean checkout build/test được; hạn chế mô phỏng được nêu; mọi ô hoàn thành có bằng chứng.

## 10. Ma trận kiểm thử bắt buộc

Các dòng sau là **kế hoạch**, chưa phải kết quả đã chạy. Unit kiểm tra quy tắc; integration dùng broker/DB riêng; E2E kiểm tra trình duyệt; Wokwi kiểm tra firmware và input/output mô phỏng.

| ID | Trường hợp | Kết quả phải có | Lớp kiểm tra |
| --- | --- | --- | --- |
| T01 | JSON hợp lệ/sai kiểu/thiếu trường/quá lớn/device lệch topic | Chỉ nhận dữ liệu hợp lệ và đúng quyền; log lỗi có giới hạn | Unit + integration |
| T02 | Trùng event/seq; message đảo thứ tự; đổi boot | Không nhân đôi, không lùi trạng thái; boot cũ bị loại | Unit + integration |
| T03 | MQTT → DB → API → UI; tải lại trang | Giá trị đúng nguồn và còn sau reload | Integration + E2E |
| T04 | RFID vào/ra hợp lệ, đọc lặp, ra khi count 0 | Count đúng, không âm; quyền và hướng được kiểm tra | Unit + Wokwi |
| T05 | Count 0, presence = true | Chặn đóng, cảnh báo sai lệch hiện diện | Unit + Wokwi + E2E |
| T06 | Count/beam/presence unknown hoặc stale | Không được coi là clear; chặn đóng | Unit + integration + Wokwi |
| T07 | Cửa đang đóng, kích hoạt từng nút panic | Chuyển sang mở/nhả khóa và latch; đèn/còi theo cấu hình | Unit + Wokwi |
| T08 | Panic trong khi broker/backend dừng | Output an toàn cục bộ vẫn được áp dụng | Wokwi fault injection |
| T09 | Ack cảnh báo khi panic/điều kiện vẫn active | Chỉ đổi acknowledged; không reset latch hay trạng thái nguy hiểm | Integration + E2E |
| T10 | Beam bị chặn giữa quá trình đóng | Hủy đóng/đảo chiều, event và output đúng | Unit + Wokwi |
| T11 | Hai cửa bình thường, hai lệnh mở đồng thời, rồi panic | Giữ interlock bình thường; ưu tiên thoát hiểm đã định nghĩa | Unit + Wokwi |
| T12 | Timer 29.999/30 s, 60/>60 s, 300/>300 s | Cảnh báo đúng ranh giới, không báo lặp vô hạn | Unit clock giả + Wokwi |
| T13 | Nhiệt độ min/max, ngoài biên, null; dao động quanh ngưỡng | Biên hợp lệ, ngoài biên cảnh báo; null là lỗi dữ liệu; hysteresis đúng | Unit + E2E |
| T14 | 84.9/85/94.9/95/100%, phép tính sau reservation | Đúng màu/cổng nhận hàng; không quyết định từ số đã làm tròn | Unit + integration |
| T15 | Hai request cùng slot hoặc khác slot sát ngưỡng | Chỉ reservation hợp lệ commit; không vượt trần | Integration với request đồng thời |
| T16 | Reservation hết hạn 15 phút cùng lúc confirm/cancel | Một trạng thái cuối; không nhân đôi/giải phóng nhầm | Unit + integration |
| T17 | Không slot đúng nhiệt độ/kích thước/tải trọng, staging đầy | Từ chối có reason code dù phần trăm kho còn thấp | Unit + integration + E2E |
| T18 | 05:59:59, 06:00, 17:59:59, 18:00, ca qua nửa đêm | Một ca đúng, quyền đúng, không hở mốc đổi ca | Unit + integration |
| T19 | Thẻ lạ/ngoài ca/đột nhập; có người cần thoát | Log an ninh; không ngăn thoát hiểm | Unit + Wokwi |
| T20 | Sai password, ACL topic khác, CA sai/hostname sai | Kết nối/publish bị từ chối; không tắt xác minh để vượt test | Integration + Wokwi TLS |
| T21 | Viewer gọi API điều khiển, anonymous REST/WebSocket, origin lạ | Backend từ chối; UI không phải hàng rào duy nhất | Integration + E2E |
| T22 | Broker mất, retained cũ, simulator pause, device reboot | Offline/stale/unknown đúng; không mặc định an toàn | Integration + Wokwi + E2E |
| T23 | Command trùng/hết hạn/revision sai/ack không tới | Không thực hiện lại; rejected/expired/timeout rõ ràng | Unit + integration + Wokwi |
| T24 | DB dừng/đầy lỗi ghi, backend restart, queue đạt giới hạn | Readiness lỗi; không báo đã lưu giả; phục hồi/gap được ghi | Integration fault injection |
| T25 | CSV có tiếng Việt, dấu quote/newline, chuỗi bắt đầu =,+,-,@ | File mở đúng, không lộ secret, xử lý nguy cơ formula | Unit + E2E |
| T26 | 320/390/825/1440 px; keyboard, focus, trạng thái không chỉ màu | Không tràn trang; cửa/cảnh báo/thao tác dùng được | E2E + kiểm tra trực quan |
| T27 | 12 rồi 50 node, mỗi node gửi snapshot/2 s, burst/reconnect | Đúng tổng hợp; đo latency, lỗi, backlog và memory | Load + integration |

Mục tiêu hiệu năng **đề xuất, chưa đo**: P95 từ publish tới hiển thị ≤2 giây trên máy demo cho 50 node × một snapshot/2 giây (khoảng 25 message/s bình thường), đo tối thiểu 1.000 message và tách pha burst/reconnect. Ghi cấu hình máy, cách đo và sample bị mất; không thay ngưỡng sau khi chạy chỉ để đạt. Không dùng độ trễ WebSocket làm thời gian phản ứng an toàn cục bộ.

## 11. Bốn kịch bản trình diễn cuối

1. **Ra/vào hợp lệ:** thẻ được phép vào đúng ca → count tăng đúng một → đi ra đúng hướng → count về 0; beam/presence clear thì mới cho đóng. Đối chiếu serial, MQTT, DB và dashboard.
2. **RFID báo 0 nhưng còn người:** count 0 + presence true → yêu cầu đóng bị từ chối; UI hiện lý do/cảnh báo. Chuyển presence clear và kiểm tra lại cổng đóng.
3. **Khẩn cấp:** bắt đầu từ cửa đóng, nhấn từng nút panic → edge nhả khóa/mở, bật output giả lập và latch. Lặp lại khi broker dừng; ack không reset; khôi phục kết nối và đối chiếu log/gap theo khả năng replay.
4. **Kho đầy:** seed đúng ngưỡng 95% → tạo yêu cầu nhận hàng → bị từ chối có lý do; thử sát ngưỡng bằng hai yêu cầu đồng thời và chứng minh không vượt giới hạn/đặt trùng.

Mỗi kịch bản cần dữ liệu đầu vào xác định, cách reset, kết quả mong đợi, ảnh/video hoặc serial log và truy vấn DB đối chiếu. Nút demo phải tạo sự kiện vào mô hình backend/nguồn giả lập được ghi tên, không chỉ sửa màn hình.

## 12. Lệnh hiện có và lệnh sẽ bổ sung

**Hiện đã dùng được** trong thư mục dự án:

```powershell
npm ci
npm test
npm run build
npm run dev
```

**Chỉ dùng sau khi các thư mục/script tương ứng được triển khai**:

```powershell
& 'C:\Users\LECOO\.platformio\penv\Scripts\pio.exe' run -d firmware
& 'C:\Users\LECOO\.platformio\penv\Scripts\pio.exe' test -d firmware -e native
npm run server:migrate
npm run server:test
npm run server:dev
npm run test:integration
npm run test:e2e
```

Tên environment `native` và các script server/migration/integration/E2E phải được tạo tại mốc tương ứng; hiện chưa tồn tại. M02 chốt dùng manifest/lockfile gốc, không có server manifest riêng. Chạy Wokwi bằng Start Simulator trong VS Code sau build, không upload vào ESP32 thật. [PlatformIO — lệnh build và project directory](https://docs.platformio.org/en/latest/core/userguide/cmd_run.html).

Các lệnh M02 đã có: `infra:setup`, `infra:mqtt:start`, `infra:db:init`, `infra:mqtt:check`, `infra:db:check`, `infra:secrets:check`; dùng `npm run <tên>` theo [hướng dẫn](infra/README.md). Dừng Vite trước `npm ci` trên Windows.

Thứ tự khởi động bản tích hợp: MySQL → broker riêng → migration/seed lần đầu → backend → nguồn Wokwi/script → frontend. Trước reset/migration phải kiểm tra tên schema và môi trường demo. Khi dừng, dừng các tiến trình dự án; không dừng dịch vụ người dùng đang sử dụng.

## 13. Cách ghi kết quả và làm việc theo kế hoạch

- Chỉ sửa mốc đang triển khai cùng caller/config/test cần thiết; giữ các component giao diện và helper phù hợp, không viết lại dashboard.
- Trước mỗi mốc đọc source liên quan và trạng thái Git; không ghi đè thay đổi của người dùng. Không cài hàng loạt dependency chỉ vì có trong kế hoạch.
- Test quy tắc thuần trước; kiểm tra trust boundary, transaction và lỗi có thể mất dữ liệu. Không giảm test/validation, tắt TLS/auth hay bỏ unknown state để demo chạy.
- Đánh dấu `[x]` sau khi có kết quả nghiệm thu, không phải sau khi tạo file. Ghi ngày, command/cách chạy, kết quả và đường dẫn evidence; nếu thiếu Wokwi/license thì ghi rõ chưa đạt.
- Bằng chứng dự kiến `docs/evidence/<moc>-<ngay>/`: log đã loại secret, kết quả test, ảnh, thông số tải và lỗi còn lại. Không tạo báo cáo pass khi chưa chạy.
- Kiểm thử có tác động chỉ chạy vào broker/schema demo riêng. Unit/build không thay đổi dữ liệu ngoài dự án; test lỗi không được dừng dịch vụ hiện có.
- Cuối mỗi checkpoint cập nhật README và trạng thái kế hoạch; kiểm tra `git diff --check`, test liên quan, build nếu sửa UI/firmware. Commit từng phần hoàn chỉnh có mô tả rõ.
- Mỗi bước bổ sung quyết định vào `DESITION.md` và việc thực tế/test/lỗi vào `QUA_TRINH.md`; phân biệt quyết định đã chốt, code đã có và tích hợp chưa kiểm chứng.
- Chưa cần deploy Internet, gửi tin cho người khác, mua license, làm phần cứng, AI ảnh nhiệt hay nối WMS thật. Những bước đó cần yêu cầu và thông tin riêng khi phát sinh.

Mẫu cập nhật một mốc:

```text
Mốc: Mxx — tên
Ngày / trạng thái: chưa làm | đang làm | đã đạt | còn vướng
Thay đổi: file và hành vi thực tế
Kiểm tra: command hoặc thao tác; pass/fail và số liệu
Bằng chứng: đường dẫn trong docs/evidence/
Còn thiếu: điều kiện chưa xác minh; bước tiếp theo
```

## 14. Điểm cần xác minh khi bắt đầu triển khai

| Điểm chưa chắc | Cách xử lý | Chặn phần nào? |
| --- | --- | --- |
| Wokwi license và đường mạng private gateway | Thử chạy/publish ở M03; không suy từ extension đã cài | Chặn nghiệm thu Wokwi, không chặn backend bằng script |
| Quyền đăng nhập/tạo schema MySQL | Đã có cấu hình local và account/schema riêng M02; không gửi password vào chat | Đã gỡ điểm chặn; schema nghiệp vụ chưa làm |
| Chứng chỉ/hostname và listener riêng | Tạo CA demo có SAN đúng, kiểm tra lỗi CA/hostname | Chặn mốc TLS, không chấp nhận bỏ verify |
| Kích thước/tải trọng slot, buffer, ca kết thúc và chính sách reset | Ghi bộ giá trị demo có nhãn giả định; hỏi khi ảnh hưởng quy tắc | Chặn nghiệm thu quy tắc tương ứng |
| Linh kiện mmWave/CO₂/thermal không có trong Wokwi | Dùng input giả lập được ghi nguồn | Không chặn kiểm thử logic; không chứng minh độ chính xác cảm biến |
| Log khi nguồn/DB mất và giới hạn replay | Chốt application ack/gap policy, thử T24 | Chặn tuyên bố lưu trữ đầy đủ khi mất kết nối |

**Việc tiếp theo cụ thể:** M03 probe PlatformIO/Wokwi tới broker riêng. Quyền/schema MySQL đã có; chưa cần mở rộng giao diện trước khi chứng minh luồng dữ liệu đầu tiên.
