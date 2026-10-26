# Rút gọn KhoGuard còn một khu vực

## Nghiệm thu toàn bộ bản một khu - 25/10/2026

Người dùng yêu cầu nghiệm thu thực sự mọi trường hợp của project mô phỏng. Tiếp tục phần nghiệm thu đang mở; không dùng kết quả nhiều khu cũ thay kết quả mới. Phạm vi là các yêu cầu T01-T24, chức năng hiện có và nhánh lỗi trong controller/API/UI/Cloud; không thể suy thành mọi tổ hợp vô hạn hoặc chứng nhận phần cứng thật.

1. Lập ma trận từ Agent.md, harness và test hiện có; ghi từng lớp bằng chứng (unit, API, firmware Wokwi thật, UI).
2. Chạy Wokwi bình thường: RFID hợp lệ/lặp/thu hồi/lạ/sai định dạng, count/PIR, liên động, sonar đảo chiều, Panic/ack/reset/ưu tiên thoát, mất broker và gửi bù, lệnh trùng/sai phiên, timer 30/60/300 s. Kiểm tra relay/servo/contact trực tiếp.
3. Chạy private fault image từ controller không đổi: reboot, input unknown, mất dòng RFID, stale, CA sai/hostname sai, positive control và phục hồi firmware gốc. Không thêm đường test vào firmware demo.
4. Dừng nguồn thiết bị và bridge trước runner FakeEdge; kiểm tra unit, C++ biên dịch mới, build web/ESP32, MQTT/TLS/DB/auth/report/reservation/writefault/recovery/load. Chỉ dừng đúng dịch vụ dự án; giữ DB lịch sử.
5. Khôi phục nguồn bình thường; thử sáu trang React, các vai trò/thao tác/lỗi dữ liệu, console và bố cục desktop/mobile. Kiểm tra Cloud bằng API và giao diện, mất backend/phục hồi; đo DOM khi công cụ cho phép.
6. Lưu kết quả từng ca, ảnh/Serial/API và các lỗi đã sửa, tổng kết đạt/trượt/chưa kiểm chứng. Phục hồi firmware, broker, backend, Vite và bridge; không ghi đạt những ca chưa chạy.

Rủi ro kiểm thử: các lỗi kết nối có chủ đích tạm làm web/Cloud stale; mọi thao tác khôi phục đặt trong finally của harness. Wokwi chỉ chạy một tab để giữ cổng 4000. Không nới điều kiện an toàn, không xóa lịch sử DB, không xuất secret.

Cập nhật 24/10/2026 theo yêu cầu trực tiếp của người dùng.

## Phạm vi

Giữ khu C (kho lạnh), ESP-C01 và hai cửa D07–D08. Giữ React, backend, MySQL, MQTT/TLS, ThingsBoard Cloud và liên động tại ESP32. Bỏ cấu hình hoạt động A/B/D và SIM-C02. Đây là mô phỏng Wokwi, không phải thiết kế an toàn được chứng nhận.

## Thứ tự thực hiện

1. Chốt registry một khu và bộ linh kiện; đóng băng seed MySQL v1 để không làm đổi checksum hay mất lịch sử.
2. Đồng bộ snapshot, API, báo cáo, tiếp nhận hàng, demo React, firmware, ACL và ThingsBoard theo registry mới. Các dữ liệu cũ ở khu đã bỏ không xuất hiện trong chức năng hoạt động.
3. Bỏ firmware/mô phỏng nhiều khu không còn dùng; sửa script kiểm tra liên quan và kiểm thử bảo vệ dữ liệu cũ.
4. Rà chân GPIO, nguồn, điện trở, linh kiện thay thế trong mô phỏng; tạo bảng dây và sơ đồ nối dây có thể đọc độc lập.
5. Viết lại README và hướng dẫn hiện hành. Cập nhật slide Markdown, PowerPoint và báo cáo Word theo cùng quy mô.
6. Chạy unit, build web/ESP32, kiểm tra DB/API/Cloud; render và xem PowerPoint/Word. Ghi rõ phần Wokwi tương tác chưa chạy nếu công cụ không kết nối.

## Điều kiện hoàn thành

- Snapshot và demo có đúng 1 khu, 1 thiết bị và 2 cửa; registry cũ bị từ chối ở đầu vào.
- Không xóa lịch sử MySQL, không sửa SQL/checksum migration đã áp dụng, không đưa secret vào tài liệu.
- GPIO, linh kiện và dây trong diagram.json khớp firmware và bảng dây; tên PIR/siêu âm đúng chức năng.
- README, PPTX, DOCX, sơ đồ và ThingsBoard thống nhất phạm vi mới.
- Các kiểm tra phù hợp đạt và có kết quả ghi trong QUA_TRINH.md.

## Rủi ro

- DB có dữ liệu nhiều khu cũ: giữ seed v1 như chứng từ lịch sử, lọc phạm vi hoạt động bằng registry hiện tại.
- Không coi PIR là cảm biến hiện diện tĩnh hay HC-SR04 là rèm quang an toàn. Wokwi không kiểm chứng cấp nguồn, mức điện áp hay an toàn phần cứng.
- Cloud lưu telemetry cũ: dashboard chỉ chọn các khóa ESP-C01, không xóa lịch sử trên Cloud.
