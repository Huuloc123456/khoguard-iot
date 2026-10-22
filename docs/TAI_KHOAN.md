# Danh sách tài khoản KhoGuard

Áp dụng cho máy demo từ 13/10/2026 (DEC-041): **mọi tài khoản của dự án dùng mật khẩu `1234`**. Mọi dịch vụ chỉ nghe ở `127.0.0.1`; trước khi mở ra mạng phải đổi lại mật khẩu dài ngẫu nhiên.

Giá trị thật mà hệ thống đọc nằm trong thư mục `.local/` (ngoài Git). File này chỉ là bảng tra cứu. Nếu đổi mật khẩu, sửa cả hai nơi.

## 1. Dashboard — <http://127.0.0.1:5173>

Chọn **Nguồn dữ liệu → Backend / MQTT** rồi đăng nhập.

| Tài khoản | Mật khẩu | Vai trò | Được làm |
| --- | --- | --- | --- |
| `viewer` | `1234` | Chỉ xem | Xem tổng quan, sơ đồ, cửa, môi trường, giữ chỗ, lịch sử |
| `operator` | `1234` | Vận hành | Như viewer, thêm: lệnh cửa (mở/đóng/đặt lại khẩn cấp), tiếp nhận cảnh báo, giữ chỗ/nhập kho/hủy, xem nhật ký ra vào. **Dùng tài khoản này khi demo** |
| `admin` | `1234` | Quản trị | Như operator, thêm: xem nhật ký đăng nhập |

- Lưu ở: `.local/dashboard-users.json`. DB chỉ giữ hash scrypt.
- Đổi mật khẩu: sửa file trên (4–128 chữ/số), chạy `npm.cmd run auth:setup`. Phiên cũ của tài khoản đó bị đăng xuất.
- Sai 5 lần liên tiếp: khóa tên đăng nhập 60 giây.

## 2. MQTT — broker dự án `127.0.0.1:18884` (thường), `127.0.0.1:18885` (TLS)

| Tài khoản | Mật khẩu | Ai dùng | Quyền (ACL) |
| --- | --- | --- | --- |
| `khoguard-backend` | `1234` | Backend | Đọc `telemetry`, `events`, `status`, `acks` của mọi thiết bị; ghi `commands` |
| `khoguard-observer` | `1234` | Script kiểm tra, MQTTX để quan sát | Chỉ đọc 4 topic trên và `commands`; không ghi được gì |
| `ESP-C01` | `1234` | ESP32 trên Wokwi (khu C, cửa D07/D08) | Ghi `telemetry`, `events`, `status`, `acks` của chính nó; đọc `commands` của chính nó |
| `SIM-A01` | `1234` | Nút khu A trên Wokwi (`firmware/wokwi/zone-a`) | Như ESP-C01, trên topic của chính nó |
| `SIM-B01` | `1234` | Nút khu B trên Wokwi (`firmware/wokwi/zone-b`) | Như trên |
| `SIM-C02` | `1234` | Script mô phỏng khu C (cửa D09) | Như trên |
| `SIM-D01` | `1234` | Nút khu D trên Wokwi (`firmware/wokwi/zone-d`) | Như trên |

- Topic: `khoguard/v1/WH01/devices/<tài khoản thiết bị>/<loại>`.
- Kết nối TLS dùng CA demo ở `.local/tls/ca.crt`, hostname `localhost` hoặc `127.0.0.1`.
- Lưu ở: `.local/mosquitto/accounts.json`; backend đọc `MQTT_PASSWORD` trong `.local/runtime.env`; ESP32 nhận mật khẩu khi `npm.cmd run firmware:build`.
- Đổi mật khẩu:
  1. Sửa `accounts.json` (và `MQTT_PASSWORD` nếu là backend).
  2. Xóa `.local/mosquitto/passwords`.
  3. Chạy `node scripts/setup-mqtt.mjs`.
  4. Khởi động lại broker và backend.
  5. Nếu đổi ESP-C01: `npm.cmd run firmware:build`, rồi bật lại Wokwi Simulator.

## 3. MySQL — `127.0.0.1:3306`, schema `khoguard_demo`

| Tài khoản | Mật khẩu | Ai dùng | Quyền |
| --- | --- | --- | --- |
| `khoguard_runtime` | `1234` | Backend khi chạy | `SELECT, INSERT, UPDATE, DELETE` trên `khoguard_demo` |
| `khoguard_migrate` | `1234` | `npm.cmd run db:migrate` | Thêm `CREATE, ALTER, DROP, INDEX, REFERENCES` trên `khoguard_demo` |

- Lưu ở: `.local/mysql-users.json` và `DB_PASSWORD` / `DB_MIGRATION_PASSWORD` trong `.local/runtime.env`.
- Đổi mật khẩu: đăng nhập bằng chính tài khoản đó, chạy `ALTER USER CURRENT_USER() IDENTIFIED BY '<mới>';`, rồi sửa cả hai file trên và khởi động lại backend.

## 4. Không thuộc dự án — không đổi

| Tài khoản | Ghi chú |
| --- | --- |
| Admin MySQL (`root` hoặc tài khoản bạn dùng khi cài) | Dùng chung với ứng dụng khác. Chỉ cần lúc tạo schema lần đầu (`infra:db:init`). `.local/mysql-admin.env` đang để trống mật khẩu |
| Service Mosquitto cổng `1883` | Broker có sẵn của máy, KhoGuard không dùng |
| License Wokwi | Gắn với tài khoản Wokwi của bạn, kích hoạt qua F1 → **Wokwi: Request a New License** |

## 5. Thẻ RFID demo (không phải tài khoản đăng nhập)

Gõ vào Serial Monitor của Wokwi: `RFID D07 <thẻ> IN|OUT`.

| Thẻ | Kết quả |
| --- | --- |
| `DEMO-017` | Hợp lệ |
| `DEMO-018` | Hợp lệ |
| `DEMO-999` | Bị từ chối (`unauthorized`), vẫn ghi nhật ký |
