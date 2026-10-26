# Firmware ESP-C01 một khu C

Một ESP32 điều khiển D07–D08, đọc DHT22, MFRC522, PIR, hai HC-SR04, contact và Panic. `src/main.cpp` gọi các module `lib/khoguard/src/`. Quy tắc thuần C++ ở `include/controller.h`, GPIO ở `include/config.h`.

## Build và chạy

Tại thư mục gốc:

```powershell
npm.cmd run firmware:build
npm.cmd run firmware:gateway:start
```

Mở duy nhất thư mục `firmware` trong VS Code. F1 → Wokwi: Start Simulator, giữ tab hiển thị. Broker dự án và backend phải chạy. `wokwi.toml` trỏ tới `.local/firmware-build/esp32dev/firmware.bin` và ELF, serial RFC2217 cổng 4000.

`firmware:prepare` chỉ tạo header cho ESP-C01 trong `.local/firmware/kg_secrets.h`. Sau cấu hình TLS, firmware dùng CA demo và cổng 18885. Không sao chép header/firmware binary vào Git hoặc file nộp.

## Tín hiệu

Xem [bảng linh kiện và toàn bộ dây](../docs/LINH_KIEN_VA_NOI_DAY.md), [sơ đồ](../docs/diagrams/so-do-noi-day.svg), [mapping MQTT](MAPPING.md).

- Contact HIGH = mở, LOW = đóng. Người demo tự gạt sau khi servo quay.
- HC-SR04 <100 cm hoặc echo quá 250 ms = vật cản. Hai đầu đo nhận TRIG chung mỗi 60 ms.
- Panic HIGH khi nhấn, có điện trở kéo xuống 10 kΩ ngoài. Hai nút dùng phím 7/8.
- PIR OUT HIGH = chuyển động. Không dùng tên mmWave cho linh kiện này.
- MFRC522: Blue DEMO-017, Green DEMO-018, Red DEMO-999 bị thu hồi. Công tắc HIGH IN, LOW OUT. Serial `RFID D07 DEMO-017 IN|OUT` dùng cho kiểm tra.
- Servo 0° đóng, 90° mở. Relay khóa HIGH giữ khóa, LOW nhả. Mỗi LED có điện trở 220 Ω.

## Quy tắc hiện hành

Count chưa xác minh sau boot. `Occupancy::reconcile` có thể xác minh số 0 khi input PIR đã clear và không thẻ nào còn trong tập người bên trong. Đây là giả định mô phỏng, không xác nhận kho thật trống. Không có nút Reset vật lý hoặc công tắc hiện diện riêng.

Đóng cửa chỉ khi count xác minh bằng 0, PIR clear, vật cản clear, input hợp lệ và không Panic. Bình thường chỉ mở một cửa khi cửa kia đã đóng. Panic nhả khóa và yêu cầu mở, được chốt cho tới thao tác reset_panic hợp lệ. Phản ứng và timer chạy tại thiết bị dù mất MQTT.

Ngưỡng: debounce 30 ms, telemetry/DHT 2 s, stale sensor 5 s, contact timeout 10 s, servo 1,5 s, cảnh báo cửa mở từ 30 s, còi sau 60 s, nguy cơ mắc kẹt sau 300 s tín hiệu PIR liên tục khi hai contact báo đóng. Đầu ra sưởi/quạt là mô hình relay/LED.

## Kiểm tra

```text
g++ -std=c++17 firmware/test/controller_test.cpp -o controller_test
g++ -std=gnu++11 firmware/test/safety_test.cpp -o safety_test
```

Trên Windows có thể dùng g++ trong WSL. Chạy riêng từng binary sau biên dịch. `npm.cmd test` kiểm tra pin/mạch/schema; `firmware:build` kiểm tra adapter Arduino. Các bằng chứng Wokwi ngày 13/10 là lịch sử, cần nghiệm thu lại bản linh kiện hiện tại nếu đổi mạch.
