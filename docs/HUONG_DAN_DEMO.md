# Kịch bản demo KhoGuard

Phạm vi demo: **một kho C, một ESP32 ESP-C01, hai cửa D07–D08**. Thời lượng trình bày khoảng 8–10 phút. Chỉ mô phỏng bằng PlatformIO/Wokwi, không nối khóa, quạt hoặc sưởi thật.

## 1. Chuẩn bị trước khi trình bày

1. Chạy `run.bat`; chờ MySQL, MQTT, backend, giao diện và cầu nối cần thiết báo sẵn sàng.
2. Trong VS Code mở **một** Wokwi Simulator và giữ tab đó hiển thị.
3. Mở `http://127.0.0.1:5173`, đăng nhập operator, chọn **Backend / MQTT**.
4. Kiểm tra trang Giám sát: ESP-C01 mới (fresh), D07 và D08 đóng/khóa, cả hai khoảng cách khoảng 400 cm, PIR không báo chuyển động, Panic đã nhả, số người bằng 0.
5. Môi trường ban đầu bình thường (mô hình dùng −19 °C); đèn/còi/sưởi tắt, quạt bật. ThingsBoard là màn hình quan sát bổ sung, website KhoGuard/MySQL vẫn là hệ thống chính.
6. Nếu trạng thái ban đầu khác, khôi phục như mục **Kết thúc an toàn** trước khi bắt đầu.

> Nếu chạy riêng một ca nghiệm thu, dùng lệnh/công tắc nêu trong từng bước. Khi thuyết trình, đừng nhấn Ctrl khi bấm Panic: Ctrl+bấm giữ nút trong Wokwi.

## 2. Kịch bản trình bày 8–10 phút

| Thời gian | Thao tác | Lời nói gợi ý | Kết quả cần thấy |
| --- | --- | --- | --- |
| 0:00–0:45 | Chỉ bản đồ kho và hai cửa | “Đây là mô hình một khu C. ESP32 nhận tín hiệu ở cửa và môi trường, xử lý quy tắc an toàn tại chỗ. Website giúp người vận hành theo dõi; MySQL giữ lịch sử.” | Chỉ một ESP-C01, hai cửa D07/D08; số liệu mới. |
| 0:45–1:45 | Trong Wokwi chỉnh DHT22 lên khoảng −9 °C | “Nhiệt độ ra ngoài dải đặt trước sẽ tạo cảnh báo. Đây là cảnh báo môi trường, không tự điều khiển sưởi hay quạt.” | Cảnh báo TEMPERATURE_OUT_OF_RANGE xuất hiện. |
|  | Đưa nhiệt độ về −19 °C; chỉnh độ ẩm khoảng 70% | “Khi nhiệt độ trở lại vùng cho phép, cảnh báo được giải quyết. Độ ẩm chỉ được đo và ghi nhận.” | Cảnh báo được gỡ; giá trị độ ẩm cập nhật. |
| 1:45–2:45 | Đặt chiều RFID IN, chạm thẻ Blue `DEMO-017` vào đầu đọc MFRC522 | “Thẻ hợp lệ ghi nhận một lượt vào. Mô hình theo dõi thẻ nào đang ở trong kho để tránh đếm lặp.” | Số người tăng lên 1. |
|  | Thử đóng cửa; đặt chiều OUT và chạm lại thẻ Blue | “Khi còn người, đóng cửa bị chặn. Ghi nhận lượt ra làm số người trở về 0.” | Lệnh đóng bị chặn lúc count=1; sau OUT count=0. |
|  | Chạm thẻ Red `DEMO-999` | “Thẻ bị thu hồi bị từ chối và lưu thành sự kiện.” | Báo thẻ không hợp lệ/không được phép; sự kiện xuất hiện trong lịch sử. |
| 2:45–3:30 | PIR → Simulate Motion, yêu cầu đóng cửa; sau đó bỏ chuyển động | “PIR báo có chuyển động. Nó không nhận biết chắc chắn người đứng yên; đây là đầu vào bổ sung cho quy tắc đóng cửa.” | Đóng bị chặn `PRESENCE_DETECTED`; khi PIR hết tín hiệu, điều kiện được gỡ. |
| 3:30–4:10 | Đặt sonar D07 hoặc D08 ở 50 cm, yêu cầu đóng; trả lại 400 cm | “Siêu âm báo vật cản gần nên lệnh đóng bị từ chối. Đây là kiểm tra vật cản tĩnh, không phải rèm quang an toàn.” | Đóng bị chặn `BEAM_BLOCKED`; sau khôi phục, khoảng cách thông thoáng. |
| 4:10–5:00 | Mở D07, thử mở D08; sau đó lần lượt đóng/mở bằng lệnh và gạt contact | “Hai cửa có liên động: cửa này đang mở thì cửa kia không được mở. Servo chỉ minh họa chuyển động; công tắc contact là tín hiệu vị trí mà người demo gạt tay.” | D08 bị chặn `INTERLOCK_ACTIVE`; contact/khóa phản ánh trạng thái sau khi gạt. |
| 5:00–6:00 | Nhấn Panic D07, quan sát; reset bằng nút **Đặt lại khẩn cấp** trên web khi điều kiện cho phép. Lặp lại D08 nếu còn thời gian | “Panic ưu tiên mở lối thoát. Tín hiệu được chốt lại để người vận hành phải xem xét và đặt lại.” | Mở khóa/cửa theo mô hình, đèn và còi bật, trạng thái khẩn hiện trên web. D08 cũng đã được chạy thử riêng. |
| 6:00–7:15 | Gạt contact D07 sang mở và giữ hơn 30 giây; chờ qua 60 giây nếu có thời gian, rồi gạt về đóng | “Cửa mở quá lâu tạo hai mức cảnh báo. Đóng lại thì cảnh báo được giải quyết.” | `DOOR_OPEN_WARNING` sau 30 giây, `DOOR_OPEN_CRITICAL` sau hơn 60 giây; đèn/còi cảnh báo; đóng cửa thì hết. |
| 7:15–8:00 | Chỉ ThingsBoard rồi kết thúc ở trang tổng quan | “ThingsBoard Cloud là bảng quan trắc phụ. Website KhoGuard và MySQL vẫn xử lý thao tác và lưu nghiệp vụ.” | Cùng một thiết bị C, dữ liệu có thời điểm cập nhật; kết thúc ở trạng thái an toàn. |

## 3. Cách giải thích đơn giản về linh kiện

- **ESP32 là bộ não:** đọc tín hiệu, quyết định có cho phép đóng/mở không và gửi trạng thái lên hệ thống.
- **Nút, thẻ, cảm biến là mắt/tai:** báo người vừa quẹt thẻ, có chuyển động, có vật cản hay nhiệt độ bao nhiêu.
- **Dây tín hiệu là đường đưa tin:** cảm biến báo 0/1 hoặc một con số cho chân GPIO của ESP32.
- **Relay là công tắc điện được ESP32 bấm hộ:** trong mô phỏng nó chỉ bật LED để minh họa tải.
- **Servo là cánh cửa đồ chơi:** nó quay để minh họa mở/đóng; nó không đẩy được một cánh cửa kho thật.
- **Website là bảng theo dõi; MySQL là sổ ghi; ThingsBoard là màn hình phụ trên Cloud.**

## 4. Kết quả đã nghiệm thu trực tiếp ngày 25/10/2026

**Đã quan sát đạt:** thẻ Blue IN/OUT bằng MFRC522; thẻ Red bị từ chối và ghi MySQL; PIR chặn đóng; sonar tĩnh chặn đóng riêng D07 và D08; liên động D07 mở rồi D08 mở bị từ chối; contact/lệnh cửa D07 và D08; DHT22 cảnh báo nhiệt độ và phục hồi, cập nhật độ ẩm; cảnh báo cửa mở 30/>60 giây và tự gỡ; Panic D07/D08, gồm D08 khi D07 đang mở; khi broker dự án ngắt, đầu ra Panic cục bộ vẫn hoạt động và sự kiện được MySQL nhận sau khi MQTT kết nối lại.

**Một phần:** reset khi nút Panic vẫn bị giữ đã bị từ chối đúng `PANIC_ACTIVE`. Chưa xác nhận trọn vẹn thao tác nhả nút rồi reset trong cùng phiên; có lần nút mô phỏng bị giữ và cần khởi động lại Simulator.

**Chưa đạt/chưa có bằng chứng:** chưa kích hoạt được vật cản động đúng lúc cửa đang đóng để chứng minh cửa đảo chiều; ba lần thử đều lỡ khoảng thời gian ngắn. Chỉ kết luận ca sonar tĩnh chặn lệnh đóng là đạt. Chưa nghiệm thu phần cứng thật, tải khóa/quạt/sưởi thật hoặc giao diện trên điện thoại. Không dùng số liệu tải một thiết bị để khẳng định chịu tải 50 thiết bị.

## 5. Kết thúc an toàn

1. Nhả cả hai nút Panic và đặt lại cảnh báo khẩn nếu đang bật.
2. Gạt contact D07/D08 về **đóng**; sonar về khoảng **400 cm**; tắt mô phỏng chuyển động.
3. Đưa DHT22 về khoảng **−19 °C**; xác nhận số người 0 và không còn cảnh báo đang hoạt động.
4. Xác nhận đầu ra bình thường: đèn/còi/sưởi tắt, quạt bật; broker và MySQL vẫn sẵn sàng.
5. Khi muốn dừng demo, chạy `close.bat`. Không xóa `.local` vì nơi đó có cấu hình cục bộ và thông tin đăng nhập.

## 6. Ca tùy chọn, chỉ dành cho nghiệm thu

Thử mất broker/reconnect bằng hướng dẫn tại [ThingsBoard](THINGSBOARD.md) và công cụ acceptance hiện hành; chỉ dừng broker riêng của project, không dừng MySQL hay Mosquitto dùng chung. Reboot, chứng chỉ sai, mất echo và đảo chiều động phải ghi kết quả riêng theo log thực tế, không suy ra từ unit test hoặc FakeEdge.
