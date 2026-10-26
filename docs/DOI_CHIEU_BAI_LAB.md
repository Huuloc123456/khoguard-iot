# Đối chiếu bài thực hành môn IoT với project KhoGuard

## Phạm vi đã rà

Thư mục tài liệu gốc có 5 bộ slide môn học, hướng dẫn đồ án PDF và báo cáo nhóm; chưa thấy một tập riêng liệt kê mã số từng bài lab. Bảng dưới đây đối chiếu các phần có ví dụ code/thao tác trong slide với project hiện hành. Mọi thực hành chạy trên mô phỏng vì yêu cầu đồ án là không làm phần cứng thật.

## Ma trận

| Nội dung thực hành trong tài liệu | Phần thực hành trong project | Trạng thái và giới hạn |
| --- | --- | --- |
| Tổng quan IoT, cảm biến, thiết bị chấp hành, kiến trúc nhiều lớp (slide 1, 3) | ESP-C01/Wokwi → MQTT/TLS → Mosquitto → Node.js/MySQL → React/ThingsBoard | Có đường dữ liệu chạy được; đây là một khu mô phỏng, không phải mạng LoRaWAN/NVR công nghiệp trong đề xuất. |
| Arduino/ESP32: GPIO, LED, Wi-Fi (slide 3, trang 4–23) | `firmware/` và `firmware/diagram.json`, PlatformIO + Wokwi | Có firmware/diagram cho ESP32, cảm biến và đầu ra. Wokwi giả lập Wi-Fi; không phải board Arduino Uno vật lý. |
| Raspberry Pi Python GPIO: input/output, polling, PWM, edge callback/debounce, cleanup (slide 3, trang 25–39) | [Lab GPIO Python](../labs/python/README.md), `gpio_sim.py` | Có thực hành trên GPIO giả lập chạy Windows; không cần Raspberry Pi hoặc RPi.GPIO thật. |
| Flask local server, route, HTML template, CSS, điều khiển ba LED (slide 3, trang 40–60) | [Lab Flask](../labs/python/README.md), `app.py`, `templates/`, `static/` | Có giao diện điều khiển LED ảo, PWM và nút nhấn. Chỉ bind localhost; không điều khiển phần cứng hoặc app React. |
| ESP32 gửi dữ liệu về server (slide 3, trang 61–68) | Wokwi → MQTT/TLS → backend Node.js → MySQL/React; kèm bridge viewer tới ThingsBoard | Đã làm bằng MQTT thay cho Raspberry Pi/LAMP. Có API/WebSocket; không coi Python Flask là endpoint backend đang vận hành. |
| HTTP request/response (slide 2, trang 18–22) | REST API ở `server/http.mjs`, giao diện React và các script kiểm tra API | Có API GET/POST và xác thực; không cần chép ví dụ Android Java để dùng lại bài học HTTP. |
| MQTT publish/subscribe, broker, QoS (slide 2, trang 23–29) | Firmware, Mosquitto, ACL/TLS và `scripts/*check*.mjs` | Có broker và luồng thực hành của project; QoS 1 có thể gửi trùng nên backend deduplicate. |
| AMQP/RabbitMQ (slide 2, trang 30–35) | Không thuộc kiến trúc KhoGuard; project chọn MQTT | Slide trình bày ví dụ giao thức, không có bài giao nộp AMQP riêng trong tài liệu nhóm. Không cài RabbitMQ hoặc tạo đường truyền thứ hai chỉ để thay MQTT. |
| An toàn IoT: xác thực, quyền, mã hóa, cấu hình và lỗi mạng (slide 4) | Vai trò viewer/operator/admin, MQTT ACL/TLS, kiểm tra auth/recovery/Wokwi trong `scripts/` và `tests/` | Có phần thực hành qua project. Một số ca Wokwi còn được đánh dấu chưa nghiệm thu ở `tasks/todo.md`; không ghi nhận các ca đó là đạt. |
| Thiết kế ứng dụng và cloud/dashboard (slide 5, slide 3 trang 62–68) | Ứng dụng KhoGuard một khu, MySQL, React, MQTT và ThingsBoard Cloud | Có sản phẩm end-to-end và kịch bản demo. WMS, camera, phân tích AI và thiết bị công nghiệp trong nguồn chỉ là đề xuất, chưa triển khai. |
| Ví dụ Python `validate_inbound_request` (Phần 2, mục 2.7) | `labs/python/inbound_reservation.py` | Có bài Python riêng: lọc vị trí theo nhiệt độ/tải trọng/thể tích, ngưỡng 95%, giữ chỗ 15 phút. Backend live vẫn là JavaScript/MySQL transaction. |

## Cách mở và chạy các phần thực hành

| Bài | Lệnh / thao tác |
| --- | --- |
| ESP32, cảm biến, cửa và MQTT | Chạy `run.bat`, mở `firmware` trong VS Code, chọn **Wokwi: Start Simulator**. Xem [hướng dẫn demo](HUONG_DAN_DEMO.md). |
| Python GPIO/Flask | Tạo venv, cài Flask và chạy `labs/python/app.py`; xem [hướng dẫn lab](../labs/python/README.md). |
| Python tiếp nhận hàng | Chạy `labs/python/inbound_reservation.py` trong venv lab. |
| HTTP, MQTT, auth, recovery và lưu trữ | Khởi động các dịch vụ theo README rồi chạy các lệnh `npm.cmd run ...:check` tương ứng; chỉ dùng `verify:all` khi đã dừng Wokwi/Node simulator như README chỉ dẫn. |

## Lưu ý khi đối chiếu

- Slide là bài giảng có ví dụ thực hành, không phải một danh sách lab có mã số/bài nộp. Nếu giảng viên có file giao bài lab riêng ngoài thư mục tài liệu hiện có, cần thêm file đó để đối chiếu đủ yêu cầu.
- Raspberry Pi, Arduino Uno, camera IP, LoRaWAN, NVR, Safety PLC, relay công nghiệp và các cảm biến công nghiệp không được giả thành thiết bị thật. Python GPIO/Flask chạy bằng mô hình ảo trên máy tính.
- Flask server trong lab là development server cục bộ; không dùng để triển khai công khai. Xem [Flask Quickstart](https://flask.palletsprojects.com/en/stable/quickstart/) và [Development Server](https://flask.palletsprojects.com/en/stable/server/).
