# Linh kiện và sơ đồ nối dây KhoGuard

Phiên bản một khu C, ESP-C01, hai cửa D07–D08. Cập nhật 24/10/2026. Đối chiếu trực tiếp `firmware/diagram.json`, `firmware/include/config.h` và thư viện `firmware/lib/khoguard/src/`. Mục đích là mô phỏng Wokwi.

## Giải thích thật dễ hiểu

Hãy tưởng tượng mô hình là một bạn nhỏ trông cửa kho:

- **ESP32 là bộ não:** nó nghe các tín hiệu rồi quyết định có cho cửa mở/đóng không.
- **Cảm biến và nút là mắt, tai, bàn tay:** thẻ nói “ai đang vào/ra”; PIR nói “có chuyển động”; sonar nói “có vật ở gần”; DHT22 nói “nóng/lạnh, ẩm/khô”; nút Panic gọi trợ giúp.
- **Dây nguồn giống như đồ ăn cho linh kiện.** Dây 3V3 hoặc 5V cấp điện; dây GND là đường điện quay về. Hai thiết bị muốn nói chuyện cần nối đúng dây tín hiệu.
- **Dây tín hiệu giống như mẩu giấy nhắn:** nó mang một trạng thái bật/tắt hoặc con số về chân GPIO của ESP32. Cắm nhầm chân giống gửi thư nhầm địa chỉ.
- **Relay là công tắc được ESP32 bấm hộ.** Trong hình này nó chỉ bật LED để mình nhìn thấy; nó không thật sự chạy máy sưởi, quạt hay khóa cửa.
- **Servo giống cánh cửa đồ chơi:** nó quay để minh họa đóng/mở. Người demo tự gạt công tắc contact để báo cửa đã tới vị trí nào.
- **Website là bảng theo dõi; MySQL là cuốn sổ ghi lại; ThingsBoard là màn hình phụ trên Internet.**

```text
Thẻ / cảm biến / nút  ──báo tin──>  ESP32 (bộ não)
                                         │
                                  kiểm tra quy tắc
                                         │
                      ┌──────────────────┴──────────────────┐
                      ▼                                     ▼
             Servo / relay / LED                    MQTT → website
             (minh họa đầu ra)                      và sổ MySQL
```

**Cần nhớ:** đây là tranh mô phỏng Wokwi, chưa phải hướng dẫn cắm thiết bị công suất thật. Khi làm mạch thật, ECHO của HC-SR04 có thể đưa điện áp 5 V vào ESP32 3,3 V; phải dùng mạch chuyển mức phù hợp và người có chuyên môn kiểm tra nguồn, relay, cách ly trước khi cấp điện.

## Kết quả rà soát

- Đúng một ESP32, không trùng GPIO giữa các vai trò. GPIO34 chỉ dùng MISO, GPIO35 chỉ đọc công tắc chiều quét.
- Đúng loại đầu đọc `board-mfrc522`, có SPI và nguồn 3,3 V. SDA của module là CS, không phải I²C.
- PIR là cảm biến chuyển động, không phải radar mmWave. HC-SR04 tạo tín hiệu vật cản, không phải rèm quang an toàn. Giao diện và tài liệu đã dùng tên đúng.
- Hai nút Panic có điện trở kéo xuống ngoài 10 kΩ. DHT22 có điện trở kéo lên 10 kΩ.
- Đã bổ sung **5 điện trở 220 Ω**, mỗi LED một điện trở nối tiếp. Không coi relay là điện trở hạn dòng.
- Relay Wokwi dùng `transistor: pnp`. Theo phần Operation trong tài liệu Wokwi, cấu hình này làm HIGH nối COM–NO, LOW nối COM–NC. Firmware xuất HIGH khi cần giữ khóa hoặc bật sưởi. Mục Attributes và Operation trong tài liệu có cách mô tả cực tính khác nhau, vì vậy chưa coi việc đối chiếu cấu hình là kiểm chứng chuyển mạch khi chạy.
- Servo chỉ biểu diễn cánh cửa. Công tắc contact độc lập báo vị trí, người demo phải gạt bằng tay sau lệnh di chuyển.
- Bản Word trước có Reset vật lý, công tắc hiện diện riêng, MQ-2 và các chân đề xuất khác. Các linh kiện đó **không có trong bản đang triển khai** và đã được bỏ khỏi mô tả hiện hành.

## Danh sách linh kiện đầy đủ

| Linh kiện trong Wokwi | Số lượng | Mục đích |
| --- | ---: | --- |
| ESP32 DevKit v1 | 1 | ESP-C01, xử lý cục bộ và MQTT/TLS |
| DHT22 | 1 | Nhiệt độ, độ ẩm giả lập |
| MFRC522 | 1 | Quét UID tại D07 |
| PIR | 1 | Tín hiệu chuyển động chung |
| HC-SR04 | 2 | Vật cản tại D07, D08 |
| Công tắc gạt SPDT | 3 | Hai contact cửa, một chọn IN/OUT |
| Nút nhấn đỏ | 2 | Panic D07 và D08 |
| Micro servo | 2 | Cánh cửa D07 và D08 |
| Relay module | 3 | Hai khóa và một chuyển mạch sưởi/quạt |
| LED | 5 | Khóa D07, khóa D08, đèn, sưởi, quạt |
| Buzzer | 1 | Còi cảnh báo |
| Điện trở 10 kΩ | 3 | Một DHT pull-up, hai Panic pull-down |
| Điện trở 220 Ω | 5 | Hạn dòng cho năm LED |

Tổng cộng **30 phần tử điện**. Nhãn chữ trong `diagram.json` không tính là linh kiện. Không có LCD, MQ-2, radar, camera hoặc nút Reset vật lý.

## Đầu vào và bus RFID

| Thiết bị và chân | ESP32 GPIO | Cách nối và quy ước |
| --- | --- | --- |
| DHT22 SDA | 15 | SDA kéo lên 3V3 qua 10 kΩ. NC để hở |
| Contact D07 chân 2 | 16 / RX2 | Chân 1 GND, chân 3 3V3. HIGH là mở |
| Contact D08 chân 2 | 19 | Như D07 |
| HC-SR04 D07 ECHO | 17 / TX2 | Tín hiệu số trong Wokwi, xem lưu ý điện áp bên dưới |
| HC-SR04 D08 ECHO | 21 | Như D07 |
| Cả hai HC-SR04 TRIG | 5 | Chung xung 10 µs, mỗi 60 ms |
| Panic D07 chân 1.l | 18 | Chân 2.l lên 3V3. GPIO kéo xuống GND qua 10 kΩ |
| Panic D08 chân 1.l | 22 | Như D07 |
| PIR OUT | 23 | HIGH là có tín hiệu chuyển động, giữ 10 s theo diagram |
| MFRC522 SCK | 2 | SPI qua GPIO matrix |
| MFRC522 MOSI | 13 | SPI output |
| MFRC522 MISO | 34 | Chỉ đọc, phù hợp chân input-only |
| MFRC522 SDA / CS | 12 | Chip-select SPI, active LOW |
| MFRC522 RST | 3V3 | Giữ reset ở HIGH, không dùng GPIO reset |
| Công tắc chiều RFID chân 2 | 35 | Chân 1 GND, chân 3 3V3. HIGH IN, LOW OUT |

HC-SR04: khoảng cách **<100 cm** hoặc mất echo mới quá **250 ms** được coi là bị chắn. Cửa sổ chống dội input 30 ms. Đây là tham số của mô hình hiện tại.

## Đầu ra

| Đầu ra | GPIO hoặc tiếp điểm | Tải mô phỏng |
| --- | --- | --- |
| Relay khóa D07 IN | 25 | COM lên 3V3. NO → 220 Ω → LED khóa D07 A, C về GND |
| Relay khóa D08 IN | 26 | Như D07 |
| Servo D07 PWM | 27 | 0° đóng, 90° mở |
| Servo D08 PWM | 14 | Như D07 |
| Đèn chiếu sáng | 32 | GPIO → 220 Ω → LED trắng A, C về GND |
| Còi | 33 | Buzzer chân 2 nhận tone, chân 1 GND |
| Relay sưởi/quạt IN | 4 | COM 3V3. NO → 220 Ω → LED sưởi. NC → 220 Ω → LED quạt |

Hai servo dùng LEDC kênh 0/1 ở 50 Hz. Buzzer dùng kênh 2 để không đổi tần số servo. Một relay chuyển mạch đủ vì mô hình quy định sưởi và quạt luôn ngược nhau.

## Nguồn cấp và giới hạn

- **3V3:** DHT22 VCC, MFRC522 3.3V/RST, các mức HIGH của công tắc/Panic, COM của relay tải LED.
- **VIN 5 V trong Wokwi:** servo V+, HC-SR04 VCC, PIR VCC, relay VCC. Mọi GND chung.
- **Chỉ trong mô phỏng số**, ECHO của HC-SR04 nối trực tiếp GPIO. Không lấy đây làm sơ đồ chế tạo: phần cứng 5 V cần mạch chuyển mức/cầu chia phù hợp trước đầu vào ESP32 3,3 V. Wokwi chỉ mô phỏng analog cơ bản nên không dùng kết quả resistor divider trong simulator làm chứng cứ điện áp.
- Mạch thật cần nguồn 5 V riêng đủ dòng cho servo/relay, nối chung mass, kiểm tra module relay tương thích 3,3 V và bảo vệ tải. Không cấp tải động từ chân 3V3.
- GPIO2/5/12/15 liên quan strapping. Sơ đồ mô phỏng chưa nghiệm thu khởi động trên bo thật, đặc biệt mức HIGH tại GPIO12 có thể ảnh hưởng điện áp flash.
- Hai sonar dùng TRIG chung để đơn giản hóa mô phỏng. Chưa xử lý giao thoa âm học của hai đầu đo thật.
- PIR LOW không chứng minh không còn người. Hiện `Occupancy::reconcile` có thể xác minh số 0 khi PIR đã clear và không UID nào được ghi bên trong. Đây là giả định demo, không áp dụng cho kho có người thật.
- Sưởi/quạt/khóa đều là relay và LED chỉ thị. Chưa đánh giá tải nhiệt, lực cửa, cơ cấu thoát hiểm, nguồn dự phòng hoặc an toàn khi ESP32 mất điện.

## Tệp sơ đồ

- [Sơ đồ nối dây tổng hợp](diagrams/so-do-noi-day.svg)
- [Sơ đồ kiến trúc một khu](diagrams/kien-truc-mot-khu.svg)
- [Mạch Wokwi có thể chạy](../firmware/diagram.json)
- [Ánh xạ firmware và JSON](../firmware/MAPPING.md)

## Nguồn đối chiếu chính thức

[MFRC522](https://docs.wokwi.com/parts/board-mfrc522), [HC-SR04](https://docs.wokwi.com/parts/wokwi-hc-sr04), [PIR](https://docs.wokwi.com/parts/wokwi-pir-motion-sensor), [relay](https://docs.wokwi.com/parts/wokwi-relay-module), [servo](https://docs.wokwi.com/parts/wokwi-servo), [DHT22](https://docs.wokwi.com/parts/wokwi-dht22), [resistor](https://docs.wokwi.com/parts/wokwi-resistor), [ESP32 datasheet](https://documentation.espressif.com/esp32_datasheet_en.html). Đối chiếu ngày 24/10/2026, không thay thế nghiệm thu simulator hoặc phần cứng.
