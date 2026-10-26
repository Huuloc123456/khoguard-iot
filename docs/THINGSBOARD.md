# ThingsBoard Cloud cho KhoGuard

Cập nhật 25/10/2026. Phạm vi hoạt động: một khu C, ESP-C01, D07–D08. Người dùng chọn dashboard ThingsBoard Cloud bổ sung; giữ website React, backend, MySQL và firmware KhoGuard. Không cần Docker hoặc PostgreSQL trên máy để dùng hướng này.

## 1. Hiểu cách kết nối

```text
ESP32/Wokwi → Mosquitto → Backend → MySQL
                           ├─ REST/WebSocket → Website KhoGuard
                           └─ Snapshot (viewer) → Bridge → MQTT/TLS → ThingsBoard Cloud
```

Bridge là chương trình đọc bản tổng hợp của backend rồi gửi một bản sao lên Cloud. Nó không nhận RPC, không gửi lệnh cửa và không thay quy tắc an toàn. ThingsBoard hoặc Internet ngừng thì website/backend vẫn vận hành độc lập.

Một thiết bị Cloud tên **KhoGuard-WH01** đại diện ESP-C01 tại khu C. Mọi trường có tiền tố `ESP_C01_`, ví dụ `ESP_C01_temperature_c`, `ESP_C01_D07_state`. Dashboard có đúng **3 widget**: một bảng khu C và hai biểu đồ nhiệt độ/độ ẩm. Các key của nguồn đã bỏ còn trong lịch sử Cloud nhưng không được chọn trong dashboard hiện hành.

## 2. Tạo tài khoản — người dùng thực hiện

1. Mở [chọn vùng ThingsBoard Cloud](https://thingsboard.io/installations/choose-region/).
2. Chọn **North America** để dùng `https://thingsboard.cloud`; hoặc **Europe** nếu bạn muốn dùng `https://eu.thingsboard.cloud`.
3. Chọn đăng ký trên trang Cloud. Dùng phương thức đăng ký được trang cung cấp, tự nhập thông tin và hoàn tất xác minh email nếu được yêu cầu.
4. Đăng nhập và hoàn thành trang chào mừng nếu có. Không gửi mật khẩu hoặc mã xác minh vào chat.

Mình chưa thao tác đăng ký hoặc chấp nhận điều khoản thay người dùng. Phiên hiện tại không có trình duyệt của người dùng được kết nối để xác nhận vị trí nút; nhãn trên giao diện có thể khác theo ngôn ngữ/phiên bản.

## 3. Tạo API key để tự động tạo dashboard

Sau khi đăng nhập:

1. Bấm tên/ảnh tài khoản, chọn **Account**.
2. Mở **Security → API keys → Manage → Generate**.
3. Đặt mô tả `KhoGuard`, chọn thời hạn phù hợp buổi demo, rồi tạo key.
4. Sao chép key ngay; ThingsBoard không hiển thị lại giá trị này.
5. Mở file đã chuẩn bị: `D:/huit/iot/source/khoguard-iot/.local/thingsboard-cloud.env`.
6. Điền sau dấu `=` và lưu bằng Ctrl+S:

```dotenv
TB_CLOUD_URL=https://thingsboard.cloud
TB_CLOUD_API_KEY=DIEN_KEY_TREN_MAY
```

Nếu đăng ký ở EU, dùng `TB_CLOUD_URL=https://eu.thingsboard.cloud`. Không gửi key vào chat và không chép file `.local` vào bản nộp. API key kế thừa quyền tài khoản, được dùng để tạo/kiểm tra thiết bị và dashboard; bridge chỉ dùng device access token được lưu riêng sau setup. Có thể thu hồi API key khi không cần setup/check nữa; bridge vẫn cần device access token còn hiệu lực.

## 4. Chạy tích hợp

Từ `D:/huit/iot/source/khoguard-iot`:

```powershell
# Sau khi đã lưu API key: tạo một Cloud device và dashboard 3 widget.
npm.cmd run thingsboard:setup

# Bật broker/backend KhoGuard theo README trước, rồi mở terminal riêng:
npm.cmd run thingsboard:bridge

# Trong terminal khác: đọc lại telemetry và dashboard từ Cloud.
npm.cmd run thingsboard:check
```

- `setup` in đường dẫn dashboard, không in key/token. Metadata và device token ở `.local/thingsboard-cloud.json`.
- Dashboard có 1 bảng khu C và 2 biểu đồ nhiệt độ/độ ẩm; không có nút điều khiển cửa.
- `bridge` gửi mỗi 10 giây; Ctrl+C để dừng. Chỉ bật khi cần demo và theo dõi hạn mức dữ liệu của gói Cloud; số trường telemetry cũng được tính vào mức sử dụng.
- `check` đòi dữ liệu bridge trong vòng 30 giây và backend khả dụng. Nó vẫn phân biệt thiết bị offline/stale, không yêu cầu ép tất cả Wokwi online.
- `setup` chạy lại chỉ cập nhật dashboard có ID do nó lưu. Nếu tên thiết bị đã thuộc một tích hợp khác, nó từ chối chiếm tên đó.
- `infra/thingsboard/dashboard-template.json` là mẫu cấu trúc có ID thiết bị placeholder, **chưa gắn dữ liệu thật**. `setup` tạo `dashboard.json` theo ID thực; không coi template là kết quả nghiệm thu.

## 5. Quy tắc dữ liệu và bảo vệ kết nối

- Backend được đọc bằng tài khoản **viewer**, qua `GET /api/snapshot`; không sửa DB trực tiếp.
- Snapshot phải đúng `validateSnapshot`, không cũ quá 10 giây hoặc ở tương lai quá 1 giây so với bridge.
- MQTT tới Cloud dùng `mqtt.thingsboard.cloud:8883` hoặc `mqtt.eu.thingsboard.cloud:8883`, xác minh hostname/certificate; REST dùng HTTPS và không theo redirect mang API key. Mỗi bản tin tối đa 50 trường để tránh gói toàn kho bị Cloud từ chối.
- Chỉ nhận hai địa chỉ Cloud chính thức nêu trên. Không tắt xác minh TLS hoặc gửi key tới host tùy ý.
- Các phép đo số giữ thời điểm `last_seen_at`; thông tin hiển thị/độ mới dùng thời điểm snapshot. Dữ liệu cũ không tạo điểm nhiệt độ/độ ẩm mới.
- Null không biến thành 0/false. “Chưa rõ”, “Chưa xác minh”, “Dữ liệu cũ” hoặc “Nguồn không khả dụng” được gửi riêng để bảng hiển thị đúng.
- Khi backend/broker/DB lỗi, bridge ngừng gửi số đo mới và gửi trạng thái nguồn không khả dụng. Biểu đồ vẫn giữ lịch sử cũ; phải xem độ mới và lần nhận cuối.
- Nếu chính bridge hoặc Internet ngừng, Cloud không nhận được thông báo mới: kiểm tra thời điểm cập nhật cuối và trạng thái kết nối của thiết bị Cloud. Không dùng dashboard phụ để quyết định an toàn cửa.
- Chỉ chuyển snapshot quan trắc, không chuyển mật khẩu, danh sách người dùng, mã thẻ hay toàn bộ nhật ký ra/vào.

## 6. Kết quả và phần còn thiếu

- Đã cập nhật Cloud thật về một khu, một bảng và hai biểu đồ. `thingsboard:setup` cập nhật cả nhãn thiết bị và dashboard của dự án, giữ ID cũ.
- `thingsboard:check` đã đọc lại telemetry ESP-C01 và xác nhận 3 widget. Bridge gửi được snapshot ngay cả khi ESP đang stale và ghi đúng độ mới của nguồn.
- [Dashboard](https://thingsboard.cloud/dashboards/569b8ac0-cf55-11f1-afdc-397ada9afcbe). [Bằng chứng bản một khu](evidence/SINGLE-ZONE-2026-10-24.md). [Bằng chứng Cloud trước rút gọn](evidence/THINGSBOARD-CLOUD-2026-10-24.md) là lịch sử của 5 nguồn/6 widget.
- Khi Wokwi chưa chạy, không có số đo môi trường mới. Chưa kiểm tra lại bố cục trên điện thoại hoặc tương tác của linh kiện Wokwi trong lượt rút gọn.
- Chỉ bật bridge khi cần demo và xem hạn mức gói Cloud. Không kích hoạt gói trả phí. Nếu API key đã bị gửi vào chat, thu hồi sau setup/check; bridge dùng device token riêng.

## Tài liệu chính thức

- [Bắt đầu ThingsBoard Cloud](https://thingsboard.io/docs/paas/getting-started/).
- [Tạo và dùng API key](https://thingsboard.io/docs/paas/user-guide/security/api-keys/).
- [MQTT/TLS của Cloud](https://thingsboard.io/docs/paas/reference/mqtt-api/getting-connected/).
- [Telemetry và timestamp](https://thingsboard.io/docs/paas/reference/mqtt-api/telemetry/).
