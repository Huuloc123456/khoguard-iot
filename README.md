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
