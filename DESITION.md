# DESITION — các quyết định của KhoGuard

Tên file giữ theo yêu cầu người dùng. Đây là sổ quyết định: ghi **chọn gì, vì sao, ảnh hưởng và trạng thái**. Kế hoạch nằm ở [Agent.md](Agent.md), công việc/kết quả thực tế nằm ở [QUA_TRINH.md](QUA_TRINH.md).

## DEC-001 — Giữ MySQL

- Ngày: 12/10/2026. Trạng thái: **chấp nhận theo yêu cầu trực tiếp người dùng**.
- Quyết định: tiếp tục MySQL, không chuyển MongoDB, không vận hành song song hai database.
- Bối cảnh: MySQL đã cài; mô hình cần giữ chỗ, sức chứa, thẻ/lịch và nhật ký liên quan. MongoDB đã được trao đổi như lựa chọn khác; người dùng chốt giữ MySQL.
- Hệ quả: migration SQL, unique key chống trùng và transaction giữ chỗ; tài khoản/schema riêng. Dịch vụ đang chạy không đồng nghĩa KhoGuard đã có database hay thông tin đăng nhập.

## DEC-002 — Mô phỏng PlatformIO/Wokwi

- Ngày: 12/10/2026. Trạng thái: **chấp nhận theo yêu cầu người dùng; tích hợp chưa thực hiện**.
- Quyết định: ESP32 lập trình trong VS Code/PlatformIO, chạy Wokwi; không nạp phần cứng thật.
- Một node ESP-C01 điều khiển D07–D08 ở khu C; script Node giả lập các node khác, gồm D09 riêng. Các nguồn có ID và provenance rõ ràng.
- Hệ quả: không chứng minh độ chính xác mmWave/AI/CO₂ hay tính an toàn cơ khí. License/gateway Wokwi phải được thử ở M03. [Cấu hình chính thức](https://docs.wokwi.com/vscode/project-config).

## DEC-003 — Giữ dashboard React nền trắng

- Ngày: 12/10/2026. Trạng thái: **chấp nhận; bản frontend mẫu đã có**.
- Quyết định: tái sử dụng `src/`, component, CSS và demo hiện tại; tích hợp qua adapter ở M06.
- Vì sao: giao diện đã đáp ứng quản lý toàn kho/nhiều khu/cửa; viết lại không giúp chứng minh luồng IoT.
- Hệ quả: contract mới có null/unknown/freshness/source; adapter phải xử lý chúng. Chưa thay số liệu mẫu bằng dữ liệu thật ở M01.

## DEC-004 — Contract trước tích hợp, JSON Schema draft-07

- Ngày: 12/10/2026. Trạng thái: **chấp nhận, validator/fixture M01 đã triển khai**.
- Quyết định: schema MQTT và API snapshot nằm ở `contracts/`; validate bằng Ajv strict và ajv-formats, không ép kiểu hoặc âm thầm bỏ dữ liệu lạ.
- Vì sao: firmware/backend/UI cần cùng tên trường, đơn vị, định danh và quy tắc unknown. Schema tĩnh có thể kiểm tra độc lập trước khi có DB/broker.
- Hệ quả: thêm hai dev dependency cho bộ kiểm tra hiện tại. Khi backend dùng runtime, khai báo dependency runtime đúng nơi. M01 chỉ kiểm tra contract, chưa là hệ thống ingest/an toàn hoàn chỉnh.
- Nguồn: [Ajv compile/validate](https://ajv.js.org/guide/getting-started.html), [ajv-formats](https://ajv.js.org/guide/formats.html), [JSON Schema draft-07](https://json-schema.org/draft-07/json-schema-release-notes).

## DEC-005 — Một chủ sở hữu dữ liệu, phiên và freshness rõ ràng

- Ngày: 12/10/2026. Trạng thái: **hợp đồng chấp nhận; ingest/replay chưa triển khai**.
- Quyết định: registry tin cậy quyết định khu/cửa/source và nhóm số liệu được ghi. Telemetry chứa đầy đủ phần thiết bị sở hữu; null là unknown, không thay bằng 0/false.
- Boot ID đổi khi reboot; session ID đổi khi reconnect. Dedupe dự kiến theo device/boot/kind/seq; event ID ổn định khi retry. Last Will phải đối chiếu session để không đánh offline phiên mới.
- Chu kỳ đề xuất 2 s, freshness ≤10 s; offline/retained chưa xác nhận không được coi là fresh.
- Hệ quả: cần session handshake/dedupe tại M05/M12; validator stateless không tự chứng minh message mới hoặc xác thực publisher.

## DEC-006 — An toàn ở edge, command là yêu cầu có hạn dùng

- Ngày: 12/10/2026. Trạng thái: **đặc tả chấp nhận; chưa có firmware điều khiển**.
- Quyết định: cổng đóng kiểm tra count verified =0, không presence, beam clear, không panic, input khỏe và interlock. Unknown chặn đóng. Panic không chờ mạng.
- Command không retain, TTL tối đa 30 s, gắn boot/session đích và expected revision cục bộ. Backend nhận yêu cầu không có nghĩa cửa đã thực hiện; chờ ack/input xác nhận.
- Hệ quả: thời gian thực thi, idempotency, clock và output phải được kiểm tra khi làm M09/M10. Tiếp nhận cảnh báo không reset panic.

## DEC-007 — Môi trường riêng, giữ dịch vụ hiện có

- Ngày: 12/10/2026. Trạng thái: **chấp nhận; M02 chưa triển khai**.
- Quyết định: broker/schema/tài khoản KhoGuard riêng; không sửa password file broker hiện tại, không đổi mật khẩu MySQL hoặc dữ liệu khác. Docker tùy chọn sau, không bắt buộc lúc bắt đầu.
- Vì sao: dùng được công cụ đã cài mà không ảnh hưởng ứng dụng khác trên máy.
- Hệ quả: cần thông tin đăng nhập hợp lệ cho tạo schema và xác minh cổng trước khi chạy broker riêng; không lưu secret trong Git hoặc chat.

## Cách cập nhật

Mỗi quyết định mới thêm DEC-xxx với ngày, trạng thái, lý do và hệ quả. Khi thay đổi, thêm mục mới tham chiếu mục bị thay thế; giữ lịch sử. Chỉ ghi “đã triển khai” khi có công việc/test tương ứng trong `QUA_TRINH.md`.
