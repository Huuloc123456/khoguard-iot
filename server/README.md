# M04–M14 — backend, MQTT ingest và MySQL

Backend Node HTTP bind **127.0.0.1:3001**, nhận telemetry/status MQTT, lưu MySQL và trả snapshot/lịch sử. Dùng node:http, mysql2, MQTT.js và validator Ajv hiện có; Ajv/ajv-formats đã chuyển sang runtime dependency. Chưa có API điều khiển, phiên đăng nhập hoặc WebSocket; dashboard nối ở M06.

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
npm run telemetry:check
```

Các script đọc `.local/runtime.env` bằng Node --env-file; backend dùng khoguard_runtime, migration dùng khoguard_migrate. Không dùng mysql-admin.env. HTTP_PORT mặc định 3001, HTTP_HOST chỉ chấp nhận 127.0.0.1; DB_NAME chỉ khoguard_demo, host DB/MQTT chỉ loopback, MQTT_PORT chỉ broker dự án 18884. Password phải đúng định dạng hex 192-bit được M02 sinh; thiếu/sai biến thì exit 1 và nêu tên biến, không in giá trị. Cổng bị chiếm: exit 1, không kill process khác.

Nhấn Ctrl+C ở đúng terminal để đóng server/pool/client. Nếu broker/DB đang lỗi, backend vẫn trả health nhưng readiness 503. Broker reconnect và subscribe lại tự động; pool loại connection lỗi và kết nối lại. Script M05 dùng SIM-A01/node-simulator, không cần bật Wokwi và không thay bằng chứng firmware.

## API hiện có

| Request | HTTP / JSON | Ý nghĩa |
| --- | --- | --- |
| GET /api/health | 200 `{"status":"ok","service":"khoguard-backend"}` | HTTP process đang sống; không xác nhận DB/MQTT hoặc an toàn cửa |
| GET /api/ready | 200 `{"status":"ready","dependencies":{"database":"ready","mqtt":"connected"}}` | DB đúng ownership/checksum 001–006/seed và MQTT đã có SUBACK QoS1 cho status/telemetry/events/acks |
| GET /api/ready khi có lỗi | 503, status `not_ready`; database `ready` hoặc `unavailable`, mqtt `connected` hoặc `disconnected` | Không trả thành công giả; không lộ SQL/credential/stack |
| GET /api/snapshot | 200 theo contracts/snapshot.schema.json; DB lỗi trả 503 `DATA_UNAVAILABLE` | Full 4 khu/5 thiết bị/12 cửa, revision và freshness; broker mất vẫn trả dữ liệu DB với trạng thái suy giảm |
| GET /api/telemetry?... | 200 lịch sử có phân trang; query sai 400 `INVALID_QUERY`; DB lỗi 503 | Xem hợp đồng query bên dưới |
| GET /api/events?device_id=&type=&limit=&cursor= | 200 `{items,next_cursor,gaps}` mới nhất trước; query sai 400; DB lỗi 503 | M08: limit 1–200 (mặc định 50), type rfid/panic/door/command_rejected, cursor là id trước đó; gaps là 20 khoảng seq bị mất gần nhất |
| POST /api/doors/D07\|D08/commands, body `{"action":"open\|close\|reset_panic"}` | 202 `{command_id,status:"pending",expires_at}`; 400 `INVALID_COMMAND`; 409 `NOT_COMMANDABLE` (cửa thiết bị mô phỏng) hoặc `DEVICE_NOT_LIVE`; 503 `BROKER_UNAVAILABLE` | M10: publish QoS1, không retain, tới topic commands của ESP-C01, gắn boot/session/revision hiện tại (DEC-020). Không đổi trạng thái cửa |
| GET /api/commands/:command_id | 200 `{command_id,door_id,action,status,reason,late_ack,created_at,expires_at,acked_at}`; 404 | status pending/applied/rejected/expired; quá 10 s + 2 s không ack thì expired `COMMAND_EXPIRED` |
| POST /api/alerts/AL-:id/ack, body `{}` | 200 cảnh báo (như snapshot); 404 | M11: ghi `alert_acks`; không resolve, không đổi mức |
| POST /api/auth/login, body `{"username","password"}` | 200 `{user,expires_at}` + cookie `kg_session`; 401 `INVALID_CREDENTIALS`; 429 `LOGIN_LOCKED` | M13: cookie HttpOnly, SameSite=Strict, 8 giờ (DEC-026) |
| POST /api/auth/logout, body `{}` | 200, xóa cookie | Thu hồi phiên; WebSocket của phiên đóng 4401 trong ≤ 5 s |
| GET /api/auth/me | 200 `{user:{username,role,permissions},expires_at}`; 401 | |
| GET /api/auth/audit | 200 `{items}`; chỉ admin | Đăng nhập/sai/khóa/đăng xuất/bị từ chối quyền |
| GET /api/access | 200 `{items}` (50 gần nhất); operator, admin | M13: lượt quẹt RFID kèm ca và đánh giá; chỉ audit (DEC-028) |
| GET /api/reports/events\|alerts\|commands\|reservations?from=&to=&zone=&type=&limit=&cursor= | 200 `{items,next_cursor}` mới nhất trước; query sai 400 `INVALID_QUERY` | M15: from/to ISO có múi giờ, mặc định 24 giờ, tối đa 31 ngày; zone A–D; type theo loại; limit 1–500 (mặc định 100); cursor là id |
| GET /api/reports/access?… | như trên; viewer 403 | M15: nhật ký ra vào theo ca, quyền như /api/access |
| GET /api/reservations | 200 `{storage,staging,generated_at,items}` | M14: `storage`/`staging` = `{capacity,occupied,reserved}` |
| POST /api/admissions, body `{"request_id","temperature_class":"ambient\|chilled\|frozen","size_class":1-3,"load_kg":1-5000}` | 201 `{reservation,warning}` (gửi lại cùng request_id: 200 cùng kết quả); 400 `INVALID_ADMISSION`; 409 `CAPACITY_LIMIT`, `NO_SUITABLE_SLOT`, `STAGING_BLOCKED`, `REQUEST_ID_REUSED` | M14: kiểm và giữ chỗ trong một transaction (DEC-029); `warning` = `NEAR_CAPACITY` từ 85% |
| POST /api/reservations/:id/confirm\|cancel, body `{}` | 200 `{reservation}`; 404; 409 `RESERVATION_EXPIRED`, `RESERVATION_FINAL` | Một kết quả cuối; lặp lại cùng hành động idempotent; confirm → vị trí occupied |
| Đường dẫn khác | 404 `{"error":{"code":"NOT_FOUND"}}` | |
| Phương thức sai trên các route | 405 `METHOD_NOT_ALLOWED` kèm Allow | |

Từ M13 mọi route trừ health/ready/login/logout cần phiên (401 `UNAUTHENTICATED`, xóa cookie); vai trò thiếu quyền → 403 `FORBIDDEN_ROLE` (có audit). Quyền: viewer đọc; operator thêm lệnh cửa, tiếp nhận, giữ chỗ, nhật ký ra vào; admin thêm audit đăng nhập (DEC-027). POST chỉ nhận Origin `http://127.0.0.1:5173`, `http://localhost:5173` (hoặc `:4173` khi preview), thiếu Origin bị 403 `FORBIDDEN_ORIGIN`; `Content-Type: application/json` (khác: 415); body ≤ 512 byte (413). Người thực hiện ghi là tên tài khoản trong phiên. WebSocket `/ws` cũng cần cookie phiên (upgrade 401).

Ack MQTT từ thiết bị chỉ được tính khi đúng thiết bị, cửa, boot, session của lệnh; một trạng thái cuối, ack muộn lưu `late_ack`. Telemetry được chấp nhận cũng cập nhật bảng `alerts` trong cùng transaction (DEC-022); snapshot trả cảnh báo active và resolved trong 10 phút (tối đa 50). `npm run control:check` kiểm 7 nhóm.

Không nhận query/body cho hai GET này. Host phải localhost hoặc 127.0.0.1 cùng port; Host lạ trả 400, tránh DNS rebinding. Response JSON no-store/nosniff/frame DENY/CSP default-src none; không mở CORS hoặc phục vụ file. Header/request/socket có giới hạn và timeout. Không dùng endpoint này để đánh giá freshness telemetry, khả năng ingest hoặc bộ điều khiển an toàn.

Pool tối đa 4 connection, không xếp hàng vô hạn; connect/query timeout 1,5 giây, transaction deadline 5 giây, lock wait 1 giây. Readiness kiểm tra server UUID/setup ID, migration hoàn tất đúng checksum và seed marker. Khi lỗi connection/query, loại connection; không log lỗi chứa câu SQL. MQTT dùng account backend subscribe status/telemetry/events/acks và chỉ publish topic commands (ACL).

## Migration và seed

`db/migrations/001_inventory.sql` tạo warehouses, zones, devices, doors trong khoguard_demo. Seed lấy ID/ownership từ contracts/devices.json và nhãn ở db/seeds/inventory.json: 1 kho, 4 khu, 5 thiết bị, 12 cửa. Foreign key gồm device + zone chặn gán cửa sang thiết bị khác khu. Không seed nhiệt độ, occupancy hoặc trạng thái an toàn như dữ liệu đo thật.

Runner xác minh marker M02/server UUID trước ghi; GET_LOCK theo schema chặn chạy đồng thời. schema_migrations lưu version, SHA-256, trạng thái applying/complete và thời điểm áp dụng. Checksum SQL chuẩn hóa CRLF thành LF. MySQL DDL có implicit commit: journal applying bị chặn khi chạy lại; **không tự drop/reset để vượt lỗi**. Domain table có sẵn mà không có journal phù hợp bị coi collision.

Seed chạy một transaction với marker checksum. Chạy lại giữ nguyên tên/cấu hình đã có; seed thay checksum hoặc bảng có dữ liệu mà thiếu marker thì dừng, không ghi đè. SQL đã áp dụng giữ nguyên: thêm migration mới cho thay đổi M05 trở đi. Journal/marker cũng không bị cập nhật bởi backend runtime.

Migration 002_telemetry thêm zone_settings, warehouse_stream, device_sessions, device_current và telemetry. Zone settings là cấu hình demo (range/capacity), không phải phép đo. Không seed giá trị cảm biến hoặc số người. Runner chạy 001 rồi 002; chạy lại no-op, giữ inventory và lịch sử. Không sửa SQL đã complete.

Rollback thủ công ở db/rollback/002_telemetry.sql rồi 001_inventory.sql, **chưa chạy**. Chỉ dùng sau backup, kiểm tra ownership và dừng backend/publisher; không thực hiện bằng endpoint hoặc tự chạy khi lỗi. DDL rollback không khôi phục dữ liệu đã mất — phải restore từ backup.

## Kiểm thử thực tế

backend:check xác minh inventory, chạy lại migration, từ chối applying/checksum sai/lock đồng thời, seed giữ tên, prepared value Unicode và FK. Các chỉnh sửa test được rollback. Sau đó kiểm tra backend 3001 và tạo app tạm trên loopback với cổng proxy riêng tới MySQL/MQTT: ngắt socket của **client test**, xác nhận ready 503/health 200, nối lại về ready 200. Không dừng MySQL hoặc broker dùng chung, không sửa cấu hình dịch vụ. Kết quả không secret ở .local/backend-check.json.

Unit test không cần DB/broker; integration command cần schema đã migrate, broker và backend đang chạy. Không tự skip integration vì mất kết nối. Frontend không thay đổi nên chưa có browser/E2E mới.

## Nguồn môi trường chạy liên tục

Terminal riêng, chỉ chạy một simulator SIM-A01 trong lúc demo; dừng simulator trước telemetry:check:

```powershell
npm run demo:environment -- --temperature=25.5 --humidity=60
```

Script dùng credential riêng SIM-A01 từ .local, gửi mỗi 2 giây, boot giữ trong process và session đổi mỗi reconnect. `--temperature`/`--humidity` có kiểm tra miền giá trị; không gửi giá trị an toàn giả. Count/presence/beam/panic null, cửa unknown, local_inputs_healthy false. Ctrl+C publish offline rồi đóng client; mất socket đột ngột có Last Will. MQTT PUBACK của publisher chỉ xác nhận broker nhận, không xác nhận MySQL đã lưu.

## Hợp đồng ingest và freshness M05

- Validate schema/UTF-8/65.536 byte/registry/zone/door ownership trước ghi; chỉ nhận status/telemetry QoS1. Retained telemetry không ghi history/current và không làm fresh. Retained online status chỉ là candidate; cần telemetry live cùng boot/session.
- Telemetry có đồng hồ: từ chối timestamp tương lai hoặc cũ hơn 10 giây; snapshot xét cả tuổi gửi và tuổi nhận. Chưa đồng bộ clock: sent_at null, chỉ fresh sau pair status+live. last_seen_at luôn là lần nhận telemetry đã commit, không phải timestamp Last Will.
- Khóa unique `(device_id,boot_id,seq)` vì bảng telemetry chỉ chứa kind telemetry. Sequence/uptime/controller_revision không được giảm trong cùng boot. Session reconnect tiếp tục seq; reboot có boot mới được bắt đầu từ 0.
- Khóa device_current và ghi history/current/revision trong cùng transaction. Tombstone phiên/boot đã thay thế nằm trong DB: status/data/Will cũ không hồi sinh hoặc đánh offline phiên mới. Offline giữ giá trị đo cuối cùng; không suy mất người hoặc cửa an toàn.
- Freshness trong bộ nhớ gắn với connection hiện tại; backend/subscriber restart hoặc mất MQTT/transaction DB lỗi xóa xác nhận live. Dữ liệu DB vẫn trả stale/unknown, chỉ telemetry mới sau xác nhận phiên mới làm fresh. Không kéo dài freshness bằng duplicate/status.
- MQTT.js handleMessage xử lý một packet mỗi lần; ACK phía subscriber chỉ sau commit hoặc quyết định từ chối. Lỗi DB hủy connection MQTT, không báo persisted. Clean session/retained chỉ khôi phục bản cuối; **chưa có application ACK/replay toàn bộ mẫu trong khoảng mất kết nối** (M12). Không tuyên bố history không có gap.
- Snapshot có occupied/reserved null vì chưa WMS (M13); capacity/range là cấu hình đã lưu. Null giữ nguyên, phần đã biết vẫn không được vượt capacity. Alert engine/open timer chưa có (M11/M10), alerts=[]/open_seconds=null.

## Hợp đồng lịch sử M05

`GET /api/telemetry?device_id=SIM-A01&from=2026-10-13T00:00:00Z&to=2026-10-13T01:00:00Z&limit=100&cursor=0`

- Bắt buộc device_id đăng ký, from/to UTC dạng Z (tối đa mili giây), `from < to`; khoảng `[from,to)` theo **received_at**, tối đa 7 ngày.
- limit mặc định 100, 1–200; cursor mặc định 0, số nguyên an toàn không âm. Tham số trùng/lạ/sai kiểu trả 400. SQL prepared, không nhận sort/table name từ query.
- Response `{schema_version:1,warehouse_id:"WH01",device_id:"SIM-A01",items:[{id,received_at,message}],next_cursor:null|integer}`. items tăng theo id; request tiếp dùng next_cursor và giữ filter. Mỗi message giữ envelope/boot/session/seq/payload ban đầu, received_at là UTC do backend ghi bằng DATETIME(3); mysql2 đọc timezone Z.
- Backend bind localhost, Host chống rebinding, không CORS rộng. GET không body; /snapshot, /health, /ready không query. Chưa auth ứng dụng hoặc truy cập LAN.

telemetry:check đã đạt **10 nhóm**: SQL repository/session/dedupe; migration guards; broker→DB→API với dữ liệu sai/cũ/trùng; pagination; retained runtime restart; reconnect/old Will; reboot/old boot; Last Will thật; DB transport lỗi/phục hồi; MQTT transport lỗi/resubscribe. Dùng nguồn thử SIM-A01, lưu history/tombstone thử với boot ID riêng trong schema demo, không xóa dữ liệu cũ. Không chạy cùng simulator để tránh hai nguồn giành trạng thái một device. Kết quả ở .local/telemetry-check.json và [bằng chứng M05](../docs/evidence/M05-2026-10-13.md).

Nguồn chính thức: [Node HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html), [mysql2 pools/prepared statements](https://sidorares.github.io/node-mysql2/docs), [MQTT.js reconnect](https://github.com/mqttjs/MQTT.js), [MySQL implicit commit](https://dev.mysql.com/doc/refman/8.4/en/implicit-commit.html), [GET_LOCK](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html).

## Event ingest M08

- Subscribe `khoguard/v1/WH01/devices/+/events` QoS1. Event cần phiên đã xác nhận, đúng contract/ACL/cửa được gán; QoS0, retained replay, trùng `event_id` và phiên đã nghỉ bị bỏ, không ghi DB.
- Seq event mỗi boot bắt đầu từ 1; nhảy seq ghi `event_gaps`. Không có replay: gap được hiển thị, không giả là log đầy đủ.
- `npm run events:check` (backend đang chạy) publish như ESP-C01 qua broker thật và kiểm tra 5 nhóm: count null/0, accepted/duplicate/unauthorized + dedupe, count 0 + presence, dữ liệu sai/ACL/gap, phân trang API.


## TLS, phục hồi, tài khoản (M12–M14)

- `npm run infra:tls:setup` tạo CA demo + chứng chỉ broker trong `.local/tls`, thêm listener 127.0.0.1:18885 và đổi `MQTT_PORT` của backend sang 18885 (TLS, kiểm CA + hostname). Khởi động lại broker sau lệnh này.
- Backend giữ phiên MQTT bền (client ID `khoguard-backend-<port>`, `clean: false`): message QoS 1 gửi khi backend tắt hoặc DB lỗi được giao lại; DB lỗi thì không PUBACK (DEC-025). `npm run recovery:check` tự bật/tắt backend nên phải dừng backend thường trước.
- `npm run db:migrate` áp 005 (tài khoản, ca, audit) và 006 (slot, giữ chỗ); `npm run auth:setup` tạo 3 tài khoản demo, mật khẩu trong `.local/dashboard-users.json`.
- Kiểm tra với backend đang chạy: `npm run auth:check` (5 nhóm), `npm run reservations:check` (5 nhóm; cần không có giữ chỗ pending của người khác vì bước hết hạn dùng đồng hồ backend giả lập).

## Lịch sử và toàn kho (M15–M16)

- `npm run reports:check` (tự bật/tắt backend, dừng backend thường trước): 4 nhóm — khớp MySQL, phân trang, còn sau restart, CSV không lộ secret.
- `npm run demo:warehouse -- --seed=17 [--seconds=N] [--with-fake-esp]`: SIM-A01/B01/C02/D01 (và ESP-C01 giả khi Wokwi tắt).
- `npm run demo:scenarios -- --scenario=all|1..4` (backend đang chạy, Wokwi tắt): bốn kịch bản Agent.md §11.
- `npm run load:test -- --nodes=50 --seconds=60 --burst=500` (tự bật backend): kết quả ở `.local/load-test.json`.
- `npm run verify:all [-- --skip=a,b]`: mọi kiểm tra theo thứ tự; kết quả ở `.local/verify-all.json`.
