# M04 — backend nền tảng

Backend Node HTTP chỉ có health/readiness, bind **127.0.0.1:3001**. Dùng mysql2 pool và MQTT đã có trong manifest gốc; không cần thêm Express/ORM hoặc manifest server riêng. M04 chưa subscribe/lưu telemetry, chưa có API điều khiển hay phiên đăng nhập.

## Khởi động trên Windows

Từ root dự án, dùng credential và marker M02 đang có; không cần admin MySQL:

```powershell
npm run db:migrate
```

Terminal broker:

```powershell
npm run infra:mqtt:start
```

Terminal backend:

```powershell
npm run backend:start
```

Terminal kiểm tra:

```powershell
npm test
npm run backend:check
```

Các script đọc `.local/runtime.env` bằng Node --env-file; backend dùng khoguard_runtime, migration dùng khoguard_migrate. Không dùng mysql-admin.env. HTTP_PORT mặc định 3001, HTTP_HOST chỉ chấp nhận 127.0.0.1; DB_NAME chỉ khoguard_demo, host DB/MQTT chỉ loopback, MQTT_PORT chỉ broker dự án 18884. Password phải đúng định dạng hex 192-bit được M02 sinh; thiếu/sai biến thì exit 1 và nêu tên biến, không in giá trị. Cổng bị chiếm: exit 1, không kill process khác.

Nhấn Ctrl+C ở đúng terminal để đóng server/pool/client. Nếu broker/DB đang lỗi, backend vẫn trả health nhưng readiness 503. Broker reconnect tự động; pool loại connection lỗi và kết nối lại. Không cần bật Wokwi để kiểm tra M04.

## API hiện có

| Request | HTTP / JSON | Ý nghĩa |
| --- | --- | --- |
| GET /api/health | 200 `{"status":"ok","service":"khoguard-backend"}` | HTTP process đang sống; không xác nhận DB/MQTT hoặc an toàn cửa |
| GET /api/ready | 200 `{"status":"ready","dependencies":{"database":"ready","mqtt":"connected"}}` | DB đúng ownership/schema/seed và MQTT đã kết nối |
| GET /api/ready khi có lỗi | 503, status `not_ready`; database `ready` hoặc `unavailable`, mqtt `connected` hoặc `disconnected` | Không trả thành công giả; không lộ SQL/credential/stack |
| Đường dẫn khác | 404 `{"error":{"code":"NOT_FOUND"}}` | Chưa có API nghiệp vụ/điều khiển |
| Phương thức khác trên hai route | 405 `METHOD_NOT_ALLOWED`, Allow: GET | Không thay đổi dữ liệu qua HTTP |

Không nhận query/body cho hai GET này. Host phải localhost hoặc 127.0.0.1 cùng port; Host lạ trả 400, tránh DNS rebinding. Response JSON no-store/nosniff/frame DENY/CSP default-src none; không mở CORS hoặc phục vụ file. Header/request/socket có giới hạn và timeout. Không dùng endpoint này để đánh giá freshness telemetry, khả năng ingest hoặc bộ điều khiển an toàn.

Pool tối đa 4 connection, không xếp hàng vô hạn; connect timeout 1,5 giây, query readiness timeout 1,5 giây. Readiness kiểm tra server UUID/setup ID, migration hoàn tất đúng checksum và seed marker. Khi lỗi connection/query, loại connection; không log lỗi chứa câu SQL. MQTT M04 chỉ kiểm tra kết nối account backend, chưa subscribe/publish.

## Migration và seed

`db/migrations/001_inventory.sql` tạo warehouses, zones, devices, doors trong khoguard_demo. Seed lấy ID/ownership từ contracts/devices.json và nhãn ở db/seeds/inventory.json: 1 kho, 4 khu, 5 thiết bị, 12 cửa. Foreign key gồm device + zone chặn gán cửa sang thiết bị khác khu. Không seed nhiệt độ, occupancy hoặc trạng thái an toàn như dữ liệu đo thật.

Runner xác minh marker M02/server UUID trước ghi; GET_LOCK theo schema chặn chạy đồng thời. schema_migrations lưu version, SHA-256, trạng thái applying/complete và thời điểm áp dụng. Checksum SQL chuẩn hóa CRLF thành LF. MySQL DDL có implicit commit: journal applying bị chặn khi chạy lại; **không tự drop/reset để vượt lỗi**. Domain table có sẵn mà không có journal phù hợp bị coi collision.

Seed chạy một transaction với marker checksum. Chạy lại giữ nguyên tên/cấu hình đã có; seed thay checksum hoặc bảng có dữ liệu mà thiếu marker thì dừng, không ghi đè. SQL đã áp dụng giữ nguyên: thêm migration mới cho thay đổi M05 trở đi. Journal/marker cũng không bị cập nhật bởi backend runtime.

Rollback thủ công nằm ở db/rollback/001_inventory.sql, **chưa chạy**: xóa inventory, giữ infra_meta/account, xóa marker của riêng seed/migration này. Chỉ dùng sau backup, kiểm tra ownership và dừng backend; không thực hiện bằng endpoint hoặc tự chạy khi lỗi. DDL rollback không khôi phục dữ liệu đã mất — phải restore từ backup. Runner chỉ hỗ trợ migration M04 hiện có; thêm migration có version mới khi triển khai mốc tiếp theo.

## Kiểm thử thực tế

backend:check xác minh inventory, chạy lại migration, từ chối applying/checksum sai/lock đồng thời, seed giữ tên, prepared value Unicode và FK. Các chỉnh sửa test được rollback. Sau đó kiểm tra backend 3001 và tạo app tạm trên loopback với cổng proxy riêng tới MySQL/MQTT: ngắt socket của **client test**, xác nhận ready 503/health 200, nối lại về ready 200. Không dừng MySQL hoặc broker dùng chung, không sửa cấu hình dịch vụ. Kết quả không secret ở .local/backend-check.json.

Unit test không cần DB/broker; integration command cần schema đã migrate, broker và backend đang chạy. Không tự skip integration vì mất kết nối. Frontend không thay đổi nên chưa có browser/E2E mới.

Nguồn chính thức: [Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html), [mysql2 pools/prepared statements](https://sidorares.github.io/node-mysql2/docs), [MQTT.js reconnect](https://github.com/mqttjs/MQTT.js), [MySQL implicit commit](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html), [GET_LOCK](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html).
