# Nội dung thuyết trình KhoGuard một khu

33 trang, chia 5 chương. Thiết kế nền sáng với tiêu đề navy, điểm nhấn cyan, ảnh minh họa và sơ đồ theo nội dung. Phạm vi: C / ESP-C01 / D07–D08. Nội dung cập nhật đến 25/10/2026. Xem bố cục chuẩn trong [outline.json](slides/outline.json).

## Trang 1 KhoGuard một khu lạnh

- Mô phỏng một kho lạnh C và hai cửa D07–D08
- Nhóm 17 · Đề tài 42 · Internet of Things

**Hình:** Ảnh kho lạnh minh họa được tạo riêng; không phải ảnh phần cứng thật.

## Trang 2 Nội dung chính

- Chương 1 Bài toán và phạm vi một khu
- Chương 2 Linh kiện, nối dây và quy tắc cửa
- Chương 3 Triển khai và ThingsBoard Cloud
- Chương 4 Demo và kết quả kiểm tra
- Chương 5 Kết luận và giới hạn

**Hình hoặc bảng:** Lộ trình 5 phần theo đường thời gian.

## Trang 3 Chương 1 Bài toán và phạm vi

- Trang phân chương theo mẫu HUIT.

**Hình:** Trang mở chương tối giản với số chương và mục tiêu phần.

## Trang 4 Bài toán giám sát kho lạnh

- Một khu lạnh cần theo dõi trạng thái cửa và điều kiện bảo quản.
- Người còn bên trong, vật cản và Panic là những tín hiệu quyết định thao tác cửa.
- Website cần ghi rõ dữ liệu mới, cũ hoặc chưa xác định.
- Mô hình dùng Wokwi để minh họa phản ứng của chương trình.

**Hình hoặc bảng:** So sánh tín hiệu nguy hiểm và cách hệ thống phản ứng.

## Trang 5 Mục tiêu của bản rút gọn

- Theo dõi nhiệt độ, độ ẩm và hai cửa của khu C.
- RFID ghi nhận lượt vào/ra giả lập, PIR bổ sung tín hiệu chuyển động.
- ESP32 xử lý liên động và khẩn cấp tại chỗ.
- MySQL lưu lịch sử. React điều hành. ThingsBoard bổ sung quan trắc Cloud.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 6 Phạm vi một khu và hai cửa

| Thuộc tính | Cấu hình hoạt động |
| --- | --- |
| Kho / khu | WH01 / C, kho lạnh −22 đến −16 °C |
| Bộ điều khiển | Một ESP32 ESP-C01 trong Wokwi |
| Cửa | D07 và D08, có liên động |
| Vị trí chứa hàng | 80 vật lý, 2 xả đá, 78 khả dụng |
| Dữ liệu cũ | Giữ trong MySQL, loại khỏi chức năng hiện hành |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

**Lưu ý khi trình bày:** Các khu A/B/D và SIM-C02 đã ngừng hoạt động.

## Trang 7 Kiến trúc hệ thống một khu

- ESP32 xử lý tại chỗ. Backend kiểm tra và lưu dữ liệu.
- React gửi yêu cầu cửa và chờ ACK. Cloud đọc bản sao snapshot.

**Hình hoặc bảng:** [Kiến trúc một khu](diagrams/kien-truc-mot-khu.svg), sơ đồ trong PowerPoint sửa được.

## Trang 8 Chương 2 Linh kiện và an toàn mô phỏng

- Trang phân chương theo mẫu HUIT.

**Hình hoặc bảng:** Nền và nhận diện HUIT giữ từ bản trước.

## Trang 9 Bộ linh kiện được sử dụng

| Nhóm | Số lượng và vai trò |
| --- | --- |
| Bộ điều khiển | 1 ESP32 DevKit v1 |
| Môi trường / RFID | 1 DHT22, 1 MFRC522 |
| Chuyển động / vật cản | 1 PIR, 2 HC-SR04 |
| Đầu vào thao tác | 2 contact, 1 công tắc chiều, 2 Panic |
| Chấp hành minh họa | 2 servo, 3 relay, 5 LED, 1 buzzer |
| Điện trở | 3 × 10 kΩ, 5 × 220 Ω |

**Hình:** Ảnh minh họa nhóm linh kiện; không phải ảnh chụp thiết bị đang đấu.

**Lưu ý khi trình bày:** Tổng 30 phần tử điện. Không có LCD, MQ-2, radar hoặc nút Reset vật lý.

## Trang 10 Nối dây đầu vào và RFID

| Tín hiệu | GPIO | Quy ước |
| --- | --- | --- |
| Contact D07 / D08 | 16 / 19 | HIGH mở, LOW đóng |
| Sonar ECHO D07 / D08 | 17 / 21 | Chỉ nối trực tiếp trong Wokwi |
| Sonar TRIG chung | 5 | Xung 10 µs, mỗi 60 ms |
| Panic D07 / D08 | 18 / 22 | Nhấn HIGH, kéo xuống 10 kΩ |
| PIR / DHT22 | 23 / 15 | PIR chuyển động, DHT pull-up 10 kΩ |
| RFID SCK / MOSI / MISO / CS | 2 / 13 / 34 / 12 | Nguồn và RST 3V3, SPI |
| Chiều RFID | 35 | HIGH IN, LOW OUT |

**Hình:** Sơ đồ tổng hợp chân ESP-C01; bảng giải thích từng dây nằm trong [LINH_KIEN_VA_NOI_DAY.md](LINH_KIEN_VA_NOI_DAY.md).

[Sơ đồ dây đầy đủ](diagrams/so-do-noi-day.svg).

**Lưu ý khi trình bày:** Bảng đầy đủ và sơ đồ dây độc lập ở docs/LINH_KIEN_VA_NOI_DAY.md.

**Nguồn:** Nguồn: firmware/include/config.h, firmware/diagram.json. https://docs.wokwi.com/parts/board-mfrc522 https://docs.wokwi.com/parts/wokwi-hc-sr04

## Trang 11 Nối dây đầu ra và nguồn cấp

| Đầu ra | GPIO | Tải mô phỏng |
| --- | --- | --- |
| Relay khóa D07 / D08 | 25 / 26 | COM 3V3, NO qua 220 Ω tới LED |
| Servo D07 / D08 | 27 / 14 | V+ 5 V, GND chung, 0° đóng, 90° mở |
| Đèn / buzzer | 32 / 33 | LED qua 220 Ω, còi dùng tone |
| Relay sưởi / quạt | 4 | NO sưởi, NC quạt, mỗi LED có 220 Ω |
| Nguồn logic | 3V3 | MFRC522, DHT22, công tắc và Panic |
| Nguồn mô phỏng tải | VIN 5 V | Servo, sonar, PIR và relay |

**Hình:** Sơ đồ tổng hợp chân ESP-C01; bảng giải thích từng dây nằm trong [LINH_KIEN_VA_NOI_DAY.md](LINH_KIEN_VA_NOI_DAY.md).

[Sơ đồ dây đầy đủ](diagrams/so-do-noi-day.svg).

**Lưu ý khi trình bày:** Mạch thật cần hạ mức ECHO 5 V xuống 3,3 V, nguồn tải riêng và xét chân strapping.

**Nguồn:** https://docs.wokwi.com/parts/wokwi-relay-module https://docs.wokwi.com/parts/wokwi-servo https://documentation.espressif.com/esp32_datasheet_en.html

## Trang 12 Điều kiện đóng và liên động hai cửa

- Số người đã xác minh và bằng 0.
- PIR không báo chuyển động, sonar không báo vật cản.
- Contact, Panic và input liên quan đều hợp lệ.
- Khi bình thường, cửa còn lại phải đóng trước khi mở cửa này.
- ESP32 tự kiểm tra. Tín hiệu chưa rõ không được ép thành an toàn.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

**Lưu ý khi trình bày:** PIR LOW không chứng minh không còn người. Quy tắc xác minh số 0 là giả định demo.

## Trang 13 Panic và các ngưỡng thời gian

| Điều kiện | Phản ứng của mô hình |
| --- | --- |
| Nhấn Panic | Chốt khẩn cấp, nhả khóa, yêu cầu mở |
| Nhả Panic | Latch vẫn còn, reset_panic phải hợp lệ |
| Cửa mở từ 30 s / sau 60 s | Cảnh báo đèn / cảnh báo còi |
| PIR liên tục hơn 5 phút, hai cửa đóng | Cảnh báo nguy cơ mắc kẹt |
| Contact không xác nhận trong 10 s | Lỗi hành trình, không coi servo quay là cửa đã tới |
| Mất MQTT | Bộ điều khiển cục bộ và timer tiếp tục chạy |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

## Trang 14 Sức chứa và tiếp nhận trong khu C

- 80 vị trí vật lý, loại 2 vị trí xả đá còn 78 khả dụng.
- Dữ liệu seed ban đầu có 60 vị trí đang chứa.
- Cảnh báo từ 85%. Yêu cầu mới làm vượt 95% bị từ chối.
- Với 78 vị trí, tổng đang chứa và giữ chỗ tối đa là 74.
- Giữ chỗ 15 phút, có hủy/xác nhận. Chỉ tiếp nhận hàng đông lạnh.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

**Lưu ý khi trình bày:** Sức chứa hàng hóa là dữ liệu demo và nghiệp vụ MySQL, chưa nối WMS.

## Trang 15 Chương 3 Triển khai mô hình

- Trang phân chương theo mẫu HUIT.

**Hình hoặc bảng:** Nền và nhận diện HUIT giữ từ bản trước.

## Trang 16 Công cụ và cấu trúc mã nguồn

| Thành phần | Công nghệ / thư mục |
| --- | --- |
| Firmware | C++, PlatformIO, Arduino framework, firmware/ |
| Mô phỏng | Một project Wokwi, diagram.json và wokwi.toml |
| Truyền thông | Mosquitto MQTT/TLS, hợp đồng contracts/ |
| Backend / DB | Node.js, mysql2, ws, MySQL, server/ và db/ |
| Website | React/Vite, src/ |
| Cloud phụ | ThingsBoard Cloud, integrations/ và bridge |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

**Lưu ý khi trình bày:** Không cần Docker hoặc PostgreSQL cho phương án Cloud.

## Trang 17 Luồng quan trắc và lệnh cửa

- Quan trắc từ ESP32 tới MySQL, React và Cloud.
- Lệnh chứa boot/session/revision và TTL 10 s.
- Chỉ ACK applied từ thiết bị xác nhận đã thực hiện.

**Hình hoặc bảng:** [Kiến trúc một khu](diagrams/kien-truc-mot-khu.svg), sơ đồ trong PowerPoint sửa được.

## Trang 18 MySQL và lịch sử của bản nhiều khu

- Lưu telemetry, trạng thái hiện tại, sự kiện, cảnh báo và lệnh cửa.
- Lưu phiên đăng nhập, lịch ca, access audit và giữ chỗ.
- Seed v1 và migration đã áp dụng giữ nguyên checksum.
- Snapshot, report và nghiệp vụ hiện hành chỉ chọn khu C.
- Các hàng nhiều khu cũ được giữ làm lịch sử, không xóa dữ liệu người dùng.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 19 Giao diện React của kho lạnh C

| Trang | Thông tin và thao tác |
| --- | --- |
| Tổng quan / sơ đồ | Một khu C, hai cửa, môi trường, cảnh báo |
| Giám sát cửa | D07/D08, trạng thái lệnh và ACK |
| Môi trường | DHT22 và ngưỡng −22 đến −16 °C |
| Nhận hàng | 78 vị trí khả dụng, hàng đông lạnh |
| Nhật ký | Lọc, tra cứu và xuất CSV theo phạm vi C |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

**Lưu ý khi trình bày:** Demo giao diện là dữ liệu mẫu. Backend / MQTT đọc dữ liệu lưu trong MySQL.

## Trang 20 Phân quyền và bảo vệ kết nối

- Viewer chỉ xem. Operator vận hành. Admin xem thêm nhật ký xác thực.
- Ba account MQTT hoạt động: ESP-C01, backend, observer.
- ACL giới hạn đúng topic ESP-C01, không cho lệnh tới thiết bị đã bỏ.
- MQTT/TLS kiểm tra CA và hostname, không tắt xác minh chứng chỉ.
- Mật khẩu và token nằm trong .local, bị Git bỏ qua và Vite chặn.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

**Lưu ý khi trình bày:** Cấu hình hiện tại dành cho demo local. Cần đổi mật khẩu demo ngắn trước khi triển khai ra mạng.

## Trang 21 Dashboard ThingsBoard Cloud

| Widget | Dữ liệu |
| --- | --- |
| Bảng khu C | Độ mới, môi trường, count, PIR, D07/D08 |
| Biểu đồ nhiệt độ | ESP_C01_temperature_c, timestamp nguồn |
| Biểu đồ độ ẩm | ESP_C01_humidity_pct, timestamp nguồn |
| Kết nối | Snapshot viewer, bridge mỗi 10 s, MQTT/TLS |
| Mất nguồn / dữ liệu cũ | Hiển thị unavailable/stale/unknown riêng |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

**Lưu ý khi trình bày:** Một Cloud device KhoGuard-WH01, tổng 3 widget. Bridge chỉ giám sát, không có RPC.

## Trang 22 Chương 4 Demo và kiểm tra

- Trang phân chương theo mẫu HUIT.

**Hình hoặc bảng:** Nền và nhận diện HUIT giữ từ bản trước.

## Trang 23 Demo RFID và PIR

| Tình huống | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| Vào hợp lệ | Chọn IN, quét Blue Card | Count tăng, đóng bị chặn khi còn người |
| Ra hợp lệ | Chọn OUT, quét lại | Count cập nhật, tiếp tục xét input |
| Thẻ thu hồi / đọc lặp | Red Card / quét IN lặp | Từ chối hoặc bỏ lặp, không cộng trùng |
| Count 0 và PIR HIGH | Simulate Motion | Tiếp tục chặn đóng |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

**Lưu ý khi trình bày:** Quét UID đại diện cho lượt đi qua. PIR không tự cộng/trừ số người.

## Trang 24 Demo Panic và giới hạn nhận hàng

- Nhấn Panic từ trạng thái cửa đóng, quan sát nhả khóa và yêu cầu mở.
- Nhả nút rồi tiếp nhận cảnh báo không xóa latch.
- Gửi reset_panic chỉ khi điều kiện tại thiết bị phù hợp.
- Giữ chỗ đưa tổng sử dụng lên tối đa 74/78, yêu cầu lên 75 bị từ chối.
- Chạy demo:scenarios để kiểm tra API bằng FakeEdge, phải dừng Wokwi trước.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

**Lưu ý khi trình bày:** FakeEdge kiểm tra chuỗi phần mềm, không thay bằng chứng linh kiện Wokwi.

## Trang 25 Tín hiệu chưa rõ và dữ liệu cũ

- Sonar mất echo hoặc khoảng cách <100 cm được coi là có vật cản.
- Count chưa xác minh, input không hợp lệ hoặc Panic đều chặn đóng.
- Backend từ chối lệnh khi ESP không có dữ liệu mới trong 10 s.
- Sau khởi động lại, boot ID đổi. Sau reconnect, session ID đổi.
- Lịch sử biểu đồ còn tồn tại khi thiết bị offline, phải xem freshness và lần nhận cuối.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 26 Trạng thái nghiệm thu Wokwi hiện tại

- Bản một khu đã kiểm tra chân nối, schema và build firmware.
- Kiểm thử C++ xác nhận gate đóng, Panic, liên động, timer và lệnh hết hạn.
- Bằng chứng Wokwi ngày 13/10 thuộc cấu hình trước và chỉ dùng tham khảo lịch sử.
- Cần chạy lại tương tác MFRC522, sonar, PIR, relay và servo trên diagram hiện hành.
- Không ghi linh kiện đã phản ứng thực tế chỉ từ việc build thành công.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 27 Kết quả kiểm tra bản một khu

| Hạng mục | Kết quả ngày 24/10/2026 |
| --- | --- |
| Unit JavaScript | 128/128 đạt, không bỏ qua |
| Logic C++ / build firmware | Hai bộ C++ đạt, ESP32 build thành công |
| Build website | Vite production thành công |
| Hạ tầng và nghiệp vụ | MQTT/TLS, DB, telemetry, events, control, auth, reservations, recovery, reports đạt |
| Một nguồn và 50 bản tin burst | Lưu 58/58, không mất bản tin |
| Publish đến WebSocket | P95 625 ms trên 8 mẫu, chưa đo DOM |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

**Lưu ý khi trình bày:** Kết quả tự động trên máy Windows hiện tại, không phải cam kết thời gian phần cứng.

## Trang 28 Những thay đổi để rút gọn

| Trước | Hiện hành |
| --- | --- |
| 4 khu, 5 danh tính, 12 cửa | 1 khu C, ESP-C01, D07–D08 |
| 4 project Wokwi và script khu khác | 1 project firmware, không tạo dữ liệu khu khác |
| Cloud 6 widget | Cloud 3 widget chỉ chọn ESP_C01 |
| PIR ghi mmWave, sonar ghi rèm quang | Tên linh kiện đúng chức năng mô phỏng |
| LED nối trực tiếp | 5 điện trở 220 Ω, một cho mỗi LED |
| Word có nhiều chân/tham số đề xuất | Word, GPIO và schematic khớp code hiện hành |

**Hình hoặc bảng:** Bảng trong PowerPoint, chữ và ô có thể chỉnh sửa.

## Trang 29 Chương 5 Kết luận và giới hạn

- Trang phân chương theo mẫu HUIT.

**Hình hoặc bảng:** Nền và nhận diện HUIT giữ từ bản trước.

## Trang 30 Kết quả của mô hình rút gọn

- Một cấu hình hoạt động thống nhất từ ESP32 đến React và ThingsBoard.
- Hai cửa tiếp tục minh họa liên động, vật cản và khẩn cấp tại chỗ.
- MySQL giữ lịch sử và nghiệp vụ tiếp nhận hàng trong khu C.
- Có bảng linh kiện, sơ đồ nối dây và hướng dẫn chạy lại.
- Kết quả kiểm tra tự động được lưu, tách khỏi nghiệm thu Wokwi tương tác.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 31 Giới hạn cần hiểu đúng

- PIR chỉ báo chuyển động, không bảo đảm phát hiện người đứng yên.
- HC-SR04 không phải rèm quang an toàn, servo không mô phỏng lực kẹp cửa.
- ECHO nối trực tiếp chỉ trong Wokwi. Mạch thật cần chuyển mức và nguồn tải riêng.
- Giả định xác minh count bằng PIR clear không chứng minh kho thật trống.
- Chưa nghiệm thu phần cứng, WMS, an toàn công nghiệp hoặc độ trễ tới DOM.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 32 Chạy lại và hoàn thiện demo

- Chạy run.bat, mở một Simulator và giữ tab hiển thị.
- Đăng nhập website, kiểm tra 1/1 thiết bị fresh và đúng D07–D08.
- Thực hiện bốn kịch bản, lưu ảnh hoặc log theo checklist.
- Mở ThingsBoard để đối chiếu độ mới và thời điểm dữ liệu nguồn.
- Kết thúc bằng close.bat, dừng bridge khi không còn demo.

**Hình hoặc bảng:** Trình bày chữ ngắn theo mẫu HUIT.

## Trang 33 Cảm ơn thầy cô và các bạn

- Nhóm 17 · KhoGuard · Đề tài 42
- Một khu C, hai cửa D07–D08 và một ESP32
- Demo RFID, vật cản, Panic và giữ chỗ nhận hàng

**Hình hoặc bảng:** Nền và nhận diện HUIT giữ từ bản trước.
