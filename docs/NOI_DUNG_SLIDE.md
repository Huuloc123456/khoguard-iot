# Nội dung thuyết trình KhoGuard một khu

Nội dung từng trang của [BaoCaoPowerPoint.pptx](slides/BaoCaoPowerPoint.pptx), 11 trang. Mỗi trang dùng nền mẫu HUIT (logo, đường dẫn huit.edu.vn), chữ Times New Roman, tiêu đề 45 pt. Phạm vi: khu C, một ESP32 ESP-C01, hai cửa D07 và D08. Số liệu khớp với báo cáo [BaoCao_DoAn_IOT_KhoGuard.docx](BaoCao_DoAn_IOT_KhoGuard.docx) và mã nguồn ngày 17/11/2026. Lời nói cho từng trang nằm ở [KICH_BAN_THUYET_TRINH.md](KICH_BAN_THUYET_TRINH.md).

Bộ 37 trang cũ (`KhoGuard-thuyet-trinh.pptx`) đã gỡ ngày 17/11/2026; nội dung của bộ đó còn trong lịch sử git của file này.

## Trang 1 Trang bìa

- Trường Đại học Công Thương TP.HCM, Khoa Công nghệ Thông tin
- Báo cáo đồ án môn Internet of Things
- Đề tài 42: Hệ thống quản lý kho hàng thông minh
- KhoGuard: mô hình kho lạnh với ESP32 và Wokwi
- Giảng viên hướng dẫn: Thầy Đinh Huy Hoàng
- Nhóm 17: Bùi Hữu Lộc (2001230467), Đỗ Lê Thanh Mẫn (2001230510), Đinh Thái Viết Long (2001230460)

**Hình:** Banner và logo HUIT theo mẫu.

## Trang 2 Bài toán: bảo quản hàng và kiểm soát cửa

- Theo dõi môi trường kho; kiểm tra người, vật cản và trạng thái cửa trước khi điều khiển.
- 01 Môi trường bảo quản: cửa mở lâu có thể làm thay đổi điều kiện trong kho lạnh.
- 02 Người trong kho: RFID và PIR bổ sung thông tin trước khi cho phép đóng cửa.
- 03 Cửa và vật cản: contact, sonar và Panic quyết định việc chấp nhận hay từ chối lệnh.
- Chú thích ảnh: ESP32 quyết định tại chỗ, máy chủ lưu lịch sử để người vận hành truy vết.

**Hình:** Ảnh chụp trang Sơ đồ kho của website (khu C, D07, D08), nguồn dữ liệu demo, có CO₂ 650 ppm.

## Trang 3 Phạm vi: một khu lạnh và hai cửa

- Ba con số: 1 khu lạnh C, 1 ESP32 ESP-C01, 2 cửa D07 và D08.
- Mục tiêu triển khai:
  1. Thu thập tín hiệu và đánh dấu chất lượng dữ liệu.
  2. Kiểm tra điều kiện cửa, xử lý Panic tại thiết bị.
  3. Lưu lịch sử, phân quyền và hỗ trợ nhận hàng.
- Ranh giới của đồ án: mô phỏng trên Wokwi, dải nhiệt độ −22 đến −16 °C. Servo, relay và LED biểu diễn đầu ra; chưa có tải công suất hay cơ cấu cửa thật.

**Hình hoặc bảng:** Ba ô số liệu lớn và hai khung chữ.

## Trang 4 Kiến trúc tổng thể hệ thống KhoGuard

- Cảm biến gửi dữ liệu lên website; lệnh từ website được ESP32 kiểm tra trước khi thực hiện.
- Bốn cột:
  - Tại kho: ESP32 ESP-C01 kèm 2 safety relay (điều khiển cửa, Panic); cảm biến và đầu ra DHT, MQ-2, RFID, PIR…
  - Truyền thông: Mosquitto chuyển bản tin qua MQTT/TLS.
  - Xử lý dữ liệu: Node.js kiểm tra quyền, xử lý và lưu dữ liệu; MySQL lưu trạng thái và lịch sử.
  - Vận hành: website React 6 trang để theo dõi và gửi lệnh; ThingsBoard nhận bản sao dữ liệu.
- Ghi chú: điều kiện cửa được xử lý tại ESP32. Cloud nhận bản sao quan trắc, MySQL lưu dữ liệu nghiệp vụ.

**Hình hoặc bảng:** Sơ đồ khối vẽ bằng shape trong PowerPoint, mũi tên theo chiều dữ liệu.

## Trang 5 Linh kiện được tổ chức theo đường tín hiệu

- 33 phần tử điện trong mạch Wokwi, gồm cả công tắc và điện trở phụ trợ.
- Đầu vào:
  - DHT22 × 1: nhiệt độ và độ ẩm.
  - MFRC522 × 1: đọc thẻ tại D07, chiều vào/ra.
  - PIR × 1, MQ-2 × 1: chuyển động; MQ-2 đóng vai cảm biến CO₂.
  - Contact, sonar, Panic: mỗi loại × 2, mỗi cửa một bộ.
- Điều khiển: ESP32 ESP-C01.
- Đầu ra:
  - Servo × 2: biểu diễn hành trình cửa.
  - Relay × 5: 2 khóa, sưởi/quạt, 2 safety relay.
  - LED × 5, buzzer × 1: trạng thái và cảnh báo.
- Phụ trợ: 1 công tắc chọn chiều RFID, 3 điện trở 10 kΩ, 5 điện trở 220 Ω.

**Hình hoặc bảng:** Ba cột Đầu vào → Điều khiển → Đầu ra.

## Trang 6 Hai cửa liên động, đóng có điều kiện

- Firmware luôn dùng đầu vào hiện tại để chấp nhận hoặc trả lý do từ chối.
- Mở thường: contact phải xác định; cửa còn lại đã đóng và không chuyển động. D07 mở thì chặn mở D08, D08 mở thì chặn mở D07.
- Khi đóng, kiểm tra theo thứ tự:
  1. Panic đang chốt: `PANIC_ACTIVE`
  2. Đầu vào hoặc số người chưa xác minh: `INPUT_UNKNOWN`
  3. Còn người trong kho: `OCCUPIED`
  4. PIR còn báo chuyển động: `PRESENCE_DETECTED`
  5. Sonar bị chắn hoặc không có mẫu mới: `BEAM_BLOCKED`

**Hình hoặc bảng:** Khung liên động hai cửa và danh sách năm bước có mã lý do.

## Trang 7 Panic: xử lý nút khẩn cấp tại ESP32

- Nhả nút không tự xóa chốt khẩn cấp; cần gửi lệnh đặt lại (reset) khi nút đã nhả hợp lệ.
- Panic tại D07 hoặc D08:
  1. Nhả khóa cả hai cửa; safety relay cắt nguồn khóa khi nút còn giữ.
  2. Bật đầu ra khẩn cấp: đèn, còi, sưởi bật; quạt tắt (mô phỏng).
  3. Giữ chốt sau khi nhả nút; reset chỉ khi nút đã nhả hợp lệ.
- Mốc thời gian trong mô hình:
  - 10 giây: contact chưa tới đích thì báo lỗi hành trình.
  - Từ 30 giây: cửa mở thì bật đèn, cảnh báo.
  - Trên 60 giây: cửa vẫn mở thì thêm còi.
  - Trên 5 phút: PIR hoặc CO₂ tăng, hai cửa đóng thì cảnh báo nghi mắc kẹt.
- Ghi chú: tiếp nhận cảnh báo chỉ ghi nhận "đã xem"; reset Panic mới thay đổi trạng thái chốt.

**Hình hoặc bảng:** Ba bước Panic bên trái, dòng thời gian bốn mốc bên phải.

## Trang 8 Website gắn theo công việc của người vận hành

- Ảnh thật của trang Giám sát cửa, nguồn Backend/MQTT.
- Sáu trang:
  - Tổng quan: cảnh báo và sức chứa.
  - Sơ đồ kho: khu C, D07 và D08.
  - Giám sát cửa: lệnh, ACK và điều kiện cửa.
  - Môi trường: DHT22, CO₂ (MQ-2) và dải bảo quản.
  - Nhận hàng: chọn vị trí, giữ chỗ.
  - Nhật ký: tra cứu, lọc và xuất CSV.
- Phân quyền: Viewer xem giới hạn, Operator vận hành, Admin xem thêm nhật ký xác thực.

**Hình:** Ảnh chụp trang Giám sát cửa và danh sách sáu trang.

## Trang 9 Giám sát bổ sung trên ThingsBoard

- Chương trình trung gian (bridge) đọc dữ liệu từ backend bằng tài khoản chỉ có quyền xem.
- Luồng: Backend (dữ liệu trạng thái đã kiểm tra) → Bridge (đọc bằng tài khoản viewer) → ThingsBoard (thiết bị KhoGuard-WH01).
- 10 giây là chu kỳ bridge đọc dữ liệu trạng thái.
- Ba thành phần của dashboard:
  - Bảng khu C: độ mới, môi trường, CO₂, số người và cửa.
  - Biểu đồ nhiệt độ theo thời điểm gốc.
  - Biểu đồ độ ẩm theo thời điểm gốc.

**Hình hoặc bảng:** Ba khối luồng dữ liệu và ba dòng thành phần dashboard.

## Trang 10 Sức chứa và quy tắc nhận hàng

- Chỉ nhận hàng đông lạnh; mỗi yêu cầu tương ứng một vị trí phù hợp kích thước và tải trọng.
- Bốn con số: 80 vị trí vật lý, 2 vị trí xả đá (không tính), 78 khả dụng (= 80 − 2), tối đa 74 đã chứa và đang giữ chỗ.
- Vì sao là 74: 74/78 ≈ 94,87% còn trong ngưỡng, 75/78 ≈ 96,15% vượt ngưỡng. Không nhận thêm nếu tổng đã chứa và đang giữ chỗ sau yêu cầu mới vượt 95% sức chứa khả dụng.
- Dữ liệu khởi tạo: 60 vị trí đang có hàng.
- Vòng đời giữ chỗ: chờ xác nhận (pending) 15 phút; xác nhận thì thành vị trí đã chứa; hủy hoặc hết hạn thì giải phóng.
- Cảnh báo từ 85% và từ chối nếu vượt 95%, tính cả vị trí đã chứa và đang giữ chỗ.

**Hình hoặc bảng:** Bốn ô số liệu, khung giải thích ngưỡng và khung vòng đời giữ chỗ.

## Trang 11 Kết quả kiểm thử được ghi trong báo cáo

- Kiểm tra tự động:
  - JavaScript: 135/135 test đạt.
  - Kiểm tra tích hợp: 19 bước đạt.
  - C++ qua WSL: 2 bộ controller/safety đạt.
  - Bài thực hành Python: 4/4 test đạt.
  - Web và ESP32: biên dịch thành công.
- Thử tải với 1 danh tính thiết bị: 58/58 bản tin đã lưu (8 mẫu gửi đều và một đợt gửi dồn 50 bản tin), độ trễ P95 499 ms.
- Hiệu chuẩn MQ-2: sai số ≤ 1% trên 20 điểm.
- Safety relay npn: 20/20 ca đúng.

**Hình hoặc bảng:** Bảng hai cột kết quả tự động và khung thử tải. Bộ slide không có trang cảm ơn riêng; lời cảm ơn nằm cuối kịch bản trang 11.
