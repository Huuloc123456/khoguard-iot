# KhoGuard

Giao diện React nền trắng để mô phỏng giám sát nhiều khu vực và nhiều cửa trong kho hàng.

## Chạy trên máy

```powershell
npm install
npm run dev
```

Mở địa chỉ Local được Vite in trong terminal, thường là `http://127.0.0.1:5173`.

## Kiểm tra và build

```powershell
npm test
npm run build
```

## Có trong bản đầu

- Tổng quan 4 khu vực và 12 cửa; chọn khu vực trên sơ đồ để xem chi tiết.
- Lọc và tìm cửa, xem môi trường, lọc nhật ký, xuất nhật ký CSV.
- Tiếp nhận cảnh báo; thao tác này không xóa điều kiện gây cảnh báo.
- Nút **Mô phỏng** mở 4 kịch bản: ra/vào hợp lệ, mmWave phát hiện còn người, nút khẩn cấp và kho đạt ngưỡng 95%.
- **Đặt lại** khôi phục toàn bộ dữ liệu mẫu. Mỗi kịch bản bắt đầu từ một bản dữ liệu mẫu độc lập.

Các số liệu, sơ đồ và nhật ký là dữ liệu giả lập trong bộ nhớ trình duyệt; tải lại trang sẽ đặt lại phiên. Chưa kết nối MQTT, WMS, cơ sở dữ liệu hoặc Wokwi. Logic liên động hiện tại phục vụ trình diễn giao diện, không điều khiển phần cứng.

## Kế hoạch và tiến độ

- [Agent.md](Agent.md): công cụ, kiến trúc, các mốc triển khai và ma trận kiểm thử.
- [DESITION.md](DESITION.md): quyết định và lý do; đã chốt giữ MySQL.
- [QUA_TRINH.md](QUA_TRINH.md): việc đã làm, kiểm tra, lỗi và phần còn thiếu.
- [contracts/README.md](contracts/README.md): hợp đồng MQTT/API snapshot và cách chạy bộ kiểm tra M01. Fixture và validator đã có; backend/firmware/DB chưa được tích hợp.

## Môi trường IoT cục bộ đã chuẩn bị ở M02

Đã có broker riêng `127.0.0.1:18884`, ACL/tài khoản theo thiết bị và schema MySQL `khoguard_demo` với runtime/migration account riêng. Dashboard vẫn là demo frontend, chưa nhận dữ liệu từ broker/database.

Xem [infra/README.md](infra/README.md) để setup/start và kiểm tra MQTT, MySQL, bảo vệ secret. Cấu hình thật nằm trong `.local/` được bảo vệ, không vào Git. Trước `npm ci` trên Windows cần dừng Vite của dự án để tránh khóa thư viện native.

## Firmware mô phỏng M03

[firmware/README.md](firmware/README.md) hướng dẫn build PlatformIO và chạy ESP32/DHT22 trong Wokwi. Telemetry ESP-C01 tới broker thật; reconnect qua gateway native và đổi nhiệt độ đã đạt. Các tín hiệu cửa/occupancy vẫn unknown và dashboard vẫn dùng dữ liệu mẫu. [Bằng chứng](docs/evidence/M03-2026-10-12.md).

## Backend và inventory M04

Đã có backend HTTP localhost:3001, pool MySQL, migration/seed 4 khu–12 cửa–5 thiết bị. Health/readiness đã kiểm tra kết nối thật và mất/phục hồi DB/MQTT. Backend chưa subscribe/lưu telemetry; tiếp theo M05 rồi M06 mới nối dashboard.

```powershell
npm run db:migrate
npm run backend:start
```

Broker dự án cần chạy ở terminal riêng. [server/README.md](server/README.md) có đầy đủ lệnh và API; `npm run backend:check` chạy 9 integration check. [Bằng chứng M04](docs/evidence/M04-2026-10-13.md).
