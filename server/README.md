# Backend KhoGuard một khu C

Node HTTP tại 127.0.0.1:3001, MQTT/TLS ingest, MySQL, đăng nhập và WebSocket. Registry hiện hành chỉ có C / ESP-C01 / D07–D08.

## Chạy

Tại thư mục gốc, máy đã cấu hình `.local/runtime.env` và marker MySQL:

```powershell
npm.cmd run db:migrate
npm.cmd run infra:mqtt:start
# Terminal khác:
npm.cmd run backend:start
```

Xem [cấu hình đầy đủ](../docs/HUONG_DAN_CAU_HINH.md). Readiness cần database ready và mqtt connected. Backend bind loopback, React proxy `/api` và `/ws` tới cổng này.

## API và quyền

| API | Vai trò và hành vi |
| --- | --- |
| GET /api/health | Liveness, không xác nhận dependency |
| GET /api/ready | 200 ready hoặc 503 khi MySQL/MQTT lỗi |
| POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me | Phiên đăng nhập có cookie, mật khẩu scrypt |
| GET /api/auth/audit, GET /api/access | Admin xem xác thực, operator/admin xem lịch ra vào |
| GET /api/snapshot | Viewer trở lên, đúng 1 khu/1 thiết bị/2 cửa |
| GET /api/telemetry | Lịch sử ESP-C01, cửa sổ UTC tối đa 7 ngày, limit tối đa 200 |
| GET /api/events | Sự kiện ESP-C01, sequence gaps và cursor |
| POST /api/doors/D07/commands | Operator, open/close/reset_panic; D08 tương tự |
| GET /api/commands/{id} | Trạng thái lệnh, ACK hoặc hết hạn |
| POST /api/alerts/{id}/ack | Operator, ghi nhận đã xem, không xóa điều kiện |
| GET /api/reservations | Sức chứa C và giữ chỗ C, không có staging |
| POST /api/admissions | Operator, chỉ frozen, chọn slot trong transaction |
| POST /api/reservations/{id}/confirm hoặc cancel | Operator, một kết quả cuối, idempotent |
| GET /api/reports/{kind} | events/alerts/commands/reservations/access, giới hạn khu C và khoảng thời gian |
| WebSocket /ws | Snapshot đã xác thực, revision tăng, không thay REST resync |

Ví dụ lịch sử: `/api/telemetry?device_id=ESP-C01&from=2026-10-24T00:00:00Z&to=2026-10-24T01:00:00Z&limit=100`. Query thiết bị/khu đã bỏ bị từ chối, không tự mở lại phạm vi lịch sử nhiều khu.

## Điều khiển và dữ liệu

Backend không giả định cửa đã di chuyển sau khi publish. Lệnh cần dữ liệu live, đúng boot/session/revision, TTL 10 s. ESP quyết định và trả ACK. Broker PUBACK chỉ xác nhận tiếp nhận bản tin, không chứng minh MySQL đã lưu hoặc cửa đã di chuyển.

Input/schema/danh tính/sequence/timestamp được kiểm tra trước lưu. Null và unknown được giữ. Snapshot quá 10 s từ thiết bị không được coi là live. Bản tin retained/backlog không tự xác nhận một phiên live. Tiếp nhận cảnh báo không resolve hoặc reset Panic.

Seed MySQL v1 đóng băng ở `db/seeds/registry-v1.json`, migration SQL không sửa. Các hàng A/B/D hoặc SIM-C02 giữ trong DB; mọi chức năng hoạt động lọc C. Giữ chỗ chỉ dùng vị trí C, bỏ xả đá: 78 khả dụng, cảnh báo từ 85%, tổng mới vượt 95% bị từ chối.

## Kiểm tra

`npm.cmd run scope:check` đọc snapshot/giữ chỗ thật và xác nhận phạm vi một khu, từ chối query cũ. `npm.cmd run verify:all` chạy hạ tầng/nghiệp vụ theo thứ tự; phải dừng Wokwi, backend, bridge và Vite trước runner. Runner giả lập ESP-C01 để kiểm tra phần mềm, không thay nghiệm thu linh kiện.

Các lệnh chi tiết: backend:check, telemetry:check, events:check, control:check, auth:check, reservations:check, writefault:check, recovery:check, reports:check. Script có thể ghi dữ liệu kiểm thử có boot/request ID riêng, không reset DB.

ThingsBoard bridge là process độc lập, đăng nhập viewer và đọc GET /api/snapshot, không truy cập DB hay gửi lệnh. [Hướng dẫn Cloud](../docs/THINGSBOARD.md).
