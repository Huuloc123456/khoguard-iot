# Wokwi: tín hiệu chưa rõ, reboot và TLS sai — 13/10/2026

**9/9 nhóm đạt**, firmware bình thường đã phục hồi; 5/5 thiết bị online/fresh. Lượt nghiệm thu chính chạy 21:41–21:44 (UTC+7); kiểm tra MySQL và trạng thái cuối hoàn tất lúc 21:46. [Kết quả](WOKWI-REMAINING-2026-10-13/result.json), [Serial](WOKWI-REMAINING-2026-10-13/serial.log), [MQTT](WOKWI-REMAINING-2026-10-13/mqtt.jsonl), [bước thực hiện](WOKWI-REMAINING-2026-10-13/steps.log).

## Phương pháp

ESP32 thực thi C++ trên Wokwi, dùng MQTT/TLS với broker và backend/MySQL thật của dự án. Bản kiểm thử sinh riêng trong `.local/wokwi-remaining`: thêm adapter tạo lỗi đầu vào, pause telemetry và lệnh Serial `TEST REBOOT` gọi **ESP.restart()**. Đây là fault injection mô phỏng; không phải tháo dây/cảm biến vật lý. Không dùng FakeEdge để tạo ACK.

`controller.h` được sao chép nguyên byte, SHA-256 **71071e8f5c61d9ac312a84796a5c027407e83e187fcfa62a70736b72042b03f1**. Quy tắc chặn đóng, đếm người, debounce và panic không thay đổi. Hook `TEST` chỉ có trong nguồn sinh riêng, không thêm vào firmware demo gốc. Bin/ELF và header có credential chỉ nằm trong `.local`, không xuất trong bằng chứng công khai.

## Kết quả

| Ca | Tác động | Kết quả thật |
| --- | --- | --- |
| Reboot, có hiện diện | Count 1 đã xác minh; presence HIGH; Serial yêu cầu CPU reboot | Boot ID đổi; bản tin mới có count **null**, verified **false**, presence true; lệnh đóng trả ACK `rejected / INPUT_UNKNOWN` |
| T06 beam unknown | Adapter giữ tín hiệu rèm quang D07 chưa xác nhận | `beam_clear:null`, local input không healthy; ACK đóng `INPUT_UNKNOWN` |
| T06 presence unknown | Adapter giữ presence chưa xác nhận | `presence:null`; ACK đóng `INPUT_UNKNOWN` |
| T06 contact unknown | Adapter giữ contact D07 chưa xác nhận | Cửa `unknown`; ACK đóng `INPUT_UNKNOWN` |
| T06 mất dữ liệu RFID | Count 1, gửi dòng Serial quá giới hạn 63 ký tự | `RFID_LINE_DROPPED`, count null/unverified; ACK đóng `INPUT_UNKNOWN`; OUT và presence clear phục hồi count 0 verified |
| T06 telemetry stale | Dừng gửi telemetry, vòng cảm biến vẫn chạy | Sau cửa sổ 10 s: thiết bị stale; API đóng **409 DEVICE_NOT_LIVE**, không publish lệnh. Bốn SIM khác vẫn fresh; resume đưa ESP fresh lại không cần status online mới |
| T20 CA sai | Firmware pin CA tự ký khác, cùng endpoint/hostname/password | ESP32 mbedTLS từ chối X.509 **−9984** ít nhất 2 lần; boot thử không có MQTT_ONLINE hay telemetry. CA đúng nạp lại kết nối thành công |
| T20 hostname sai | Resolve endpoint thật; connect tới IP đó với hostname xác minh `wrong.example.invalid`, vẫn dùng CA đúng | mbedTLS từ chối X.509 **−9984** ít nhất 2 lần; không có MQTT_ONLINE/telemetry. Không đổi broker/certificate, không DNS tới hostname sai |
| Phục hồi | Nạp lại nguyên bin/ELF đã sao lưu | SHA-256 bin **35d82aa260f387e5649d071829c0dc370ac1c87afb6b5b58bdb203257a1b1dcf**, trùng bản firmware gốc; 5/5 fresh, readiness 200 |

Kiểm tra cryptographic trước TLS: chứng chỉ server được ký bởi CA dự án, không được ký bởi CA thử; SAN khớp `host.wokwi.internal`, không khớp hostname sai. [Metadata](WOKWI-REMAINING-2026-10-13/tls-metadata.json). Dùng overload `WiFiClientSecure::connect(IPAddress, port, hostname, CA, ...)` của framework Arduino ESP32 2.0.17 để tách địa chỉ đích khỏi hostname xác minh. Không gọi `setInsecure()`.

Ở ca TLS lỗi, bản tin hợp lệ cuối của bản trước có thể còn fresh trong 10 s. Bài test chờ nó hết hạn; boot bị từ chối tuyệt đối không được trở thành current.

## Lỗi backend được phát hiện và sửa

Lượt đầu ca stale: API trả đúng 409, nhưng `transaction()` bắt lỗi nghiệp vụ `DEVICE_NOT_LIVE` như lỗi DB, gọi `resetConnection()` và xóa toàn bộ `candidates/live`. Các thiết bị vẫn gửi nhưng bản tin sau đó chỉ thành backlog, không phục hồi freshness. Sửa `command()` trả null trong transaction đọc; sau commit mới ném lỗi nghiệp vụ. Lỗi DB thật vẫn đi qua rollback/destroy/reset.

- Test hồi quy `tests/telemetry-store-rejection.test.js`: mã cũ **1 lỗi / 1 đạt**; sau sửa **2/2 đạt**. Test thứ hai chứng minh lỗi DB thật vẫn bỏ xác nhận phiên.
- Toàn bộ JavaScript **109/109**, 0 skip. [TAP](WOKWI-REMAINING-2026-10-13/unit-after-fix.tap).
- Wokwi chạy lại ca stale đạt, bốn thiết bị khác vẫn fresh và ESP tự fresh khi resume.
- MySQL write-fault sau sửa **3 nhóm đạt**: khóa dòng 9,5 s, không fresh và readiness lỗi **31/31** probes; 3 frame tồn đọng lưu đúng một lần sau **418 ms**; frame live tiếp theo phục hồi. [Kết quả](WOKWI-REMAINING-2026-10-13/write-fault-after-fix.json).
- Kiểm tra cuối với firmware bình thường: cả 5 thiết bị fresh; đóng D07 đang đóng nhận ACK `applied` khoảng 110 ms. Không coi đây là phép đo hành trình cửa. [Trạng thái cuối](WOKWI-REMAINING-2026-10-13/final-live.json).

## Chạy lại

Broker, gateway, MySQL, backend và Node warehouse bật; build firmware bình thường trước. Từ gốc dự án:

```powershell
npm.cmd run wokwi:remaining -- --prepare
code --new-window .local/wokwi-remaining
```

Đóng tab Simulator khác để nhả Serial 4000. Trong cửa sổ **wokwi-remaining**, F1 → **Wokwi: Start Simulator**, giữ tab hiển thị, rồi:

```powershell
npm.cmd run wokwi:remaining
```

Script kiểm tra đúng cửa sổ bằng `code --status`, tự build/nạp từng ảnh và phục hồi ảnh ban đầu trong finally. Nếu thư mục active bị sửa bởi tiến trình khác, script từ chối ghi đè. Không chạy đồng thời nguồn ESP giả hoặc `verify:all`. Bằng chứng thô ở `.local/wokwi-remaining/runs/`; chỉ chia sẻ log/JSON đã kiểm tra, không chia sẻ firmware chứa secret.

Các lượt chuẩn bị ban đầu không đạt vì theo dõi bin nằm ngoài workspace, người thao tác chạy nhầm cửa sổ và assertion TLS kiểm tra freshness trước khi hết TTL; không tính các lượt đó là nghiệm thu. Lượt cuối có đủ 9 nhóm đạt và phục hồi thành công.

Phạm vi ba nhóm người dùng yêu cầu đã xong. M16 còn phép đo publish → hiển thị DOM; chứng nhận và phản ứng của phần cứng thực tế nằm ngoài mô hình mô phỏng.
