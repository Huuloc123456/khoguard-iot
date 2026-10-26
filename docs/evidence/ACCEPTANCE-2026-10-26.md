# Nghiệm thu KhoGuard — 26/10/2026

Phạm vi: project mô phỏng một khu C, ESP-C01, hai cửa D07–D08. Firmware và trạng thái dịch vụ đã được phục hồi sau các ca fault injection. Đây không phải nghiệm thu phần cứng thật.

## Kiểm tra tự động

| Kiểm tra | Kết quả |
| --- | --- |
| `npm.cmd test` | 130 đạt, 0 lỗi, 0 bỏ qua |
| `npm.cmd run build` | Vite build đạt, 104 module |
| `npm.cmd run verify:all` | 17 bước đạt; nhánh C++ bỏ qua trên Windows vì `g++` không nằm trong PATH |
| Firmware C++ qua WSL Ubuntu / g++ 15.2 | `controller_test.cpp` và `safety_test.cpp` biên dịch, chạy đạt |
| Python lab | 4/4 test đạt |
| `npm.cmd audit` | 0 lỗ hổng sau khi cập nhật `fast-uri` 3.1.8 → 3.1.9 trong lockfile |
| PlatformIO ESP32 | Firmware build đạt trong lượt nghiệm thu; binary sản xuất không bị fault-suite sửa |

`verify:all` bao gồm MQTT, MySQL, TLS, secret-route checks, backend, scope, telemetry, events, control, auth, reservations, write-fault, bốn kịch bản demo/20 bước, recovery, reports và load. Lượt đầu cần chạy lại vì Vite đang giữ cổng 5173; lượt sau chạy với điều kiện đúng và đạt.

## Wokwi fault-suite trên ESP32

- Reboot thật bằng `ESP.restart`: boot ID đổi, count về chưa xác minh khi presence đang HIGH; lệnh đóng bị từ chối `INPUT_UNKNOWN`.
- Beam, presence hoặc contact unknown; firmware từ chối đóng.
- Mất dòng RFID: count chuyển unknown; lệnh đóng bị từ chối.
- Telemetry stale: API trả `409 DEVICE_NOT_LIVE`, không publish lệnh MQTT.
- ESP32 mbedTLS từ chối CA sai và hostname sai; không phát `MQTT_ONLINE` hoặc telemetry từ boot lỗi. CA đúng kết nối lại được.
- Firmware thường được khôi phục đúng SHA-256; snapshot trả ESP-C01 online/fresh. Sau lượt chạy tổng hợp, Restart Wokwi để phát retained status mới; snapshot sau đó fresh.

Log đầy đủ được giữ cục bộ trong `.local/wokwi-remaining/runs/2026-10-26T02-03-46-008Z/` và không có secret được đưa vào tài liệu này.

## Còn chưa nghiệm thu

- Đảo chiều khi HC-SR04 bị chắn trong lúc cửa đang đóng.
- Chuỗi thao tác Panic hiện hành: nhả nút, reset đúng điều kiện, kiểm tra D07/D08.
- Panic khi broker dừng, reconnect và xác nhận event vào MySQL; command trùng và command từ phiên cũ trên firmware.
- Timer mở cửa 30/>60 giây và presence liên tục trên 5 phút ở Wokwi hiện hành.
- Bố cục React/ThingsBoard trên điện thoại, sáu trang/role, luồng lỗi và console sau khi rút gọn một khu.
- Mất nguồn vật lý không thử; phạm vi hiện tại chỉ mô phỏng.
