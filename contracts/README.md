# Hợp đồng KhoGuard v1 — M01

Ngày chốt: 12/10/2026. Đây là hợp đồng và bộ kiểm tra **trước khi tích hợp**; chưa có MQTT consumer, HTTP server hoặc firmware KhoGuard. M02 đã tạo broker/schema infrastructure theo [hướng dẫn](../infra/README.md), chưa lưu dữ liệu nghiệp vụ. Các JSON example là fixture, không phải kết quả thiết bị đang online.

## File và cách kiểm tra

| File | Vai trò |
| --- | --- |
| `devices.json` | Registry tin cậy: thiết bị, khu, cửa, nguồn và quyền sở hữu số liệu |
| `mqtt.schema.json` | JSON Schema draft-07 cho năm loại message |
| `snapshot.schema.json` | Response dự kiến của `GET /api/snapshot` |
| `examples.json` | Telemetry, RFID event, Last Will offline, command và acknowledgment |
| `snapshot.example.json` | Fixture 4 khu/12 cửa từ số liệu demo hiện có, thêm metadata nguồn/kết nối |
| `validate.js` | Validator Node: schema, giới hạn byte, mapping và các bất biến snapshot |
| `../tests/contracts.test.js` | Kiểm thử contract, không gọi broker/DB |

```powershell
node --test tests/contracts.test.js
npm test
```

`validateMqttMessage(topic, raw)` nhận string hoặc Buffer UTF-8; `validateSnapshot(object)` nhận snapshot đã parse. Thành công trả `{ ok: true, value }`; thất bại trả `{ ok: false, error: { code, message, details? } }`. Không coerce kiểu, bỏ trường lạ hoặc tự thêm giá trị mặc định. Validator không thay thế xác thực MQTT/API.

Ajv được compile một lần, bật strict; `ajv-formats` kiểm tra `date-time`. Giới hạn payload 65.536 byte và timestamp 24 ký tự được áp dụng để giới hạn input. Clock ứng dụng dùng UTC, giây 00–59, phần thập phân tùy chọn 1–3 chữ số; không nhận leap second hay độ chính xác nhỏ hơn mili giây. Các package hiện là dev dependency cho kiểm tra M01; khi backend dùng validator trong runtime, phải đưa dependency vào manifest runtime tương ứng. [Ajv](https://ajv.js.org/guide/getting-started.html), [format validation](https://ajv.js.org/guide/formats.html).

## Registry và quyền ghi

| ID | Khu/cửa | Nguồn dự kiến | Số liệu cấp khu |
| --- | --- | --- | --- |
| SIM-A01 | A / D01–D03 | Node giả lập | Môi trường + occupancy |
| SIM-B01 | B / D04–D06 | Node giả lập | Môi trường + occupancy |
| ESP-C01 | C / D07–D08 | ESP32 Wokwi | Môi trường + occupancy |
| SIM-C02 | C / D09 | Node giả lập | Chỉ trạng thái D09 |
| SIM-D01 | D / D10–D12 | Node giả lập | Môi trường + occupancy |

D07–D08 là cặp airlock. D09 không thuộc bộ điều khiển airlock; node D09 không được ghi đè số người hoặc nhiệt độ khu C. `source` do backend lấy từ registry, không nhận do MQTT publisher tự khai. Registry này là cấu hình demo 12 cửa; mở rộng 50 node ở M16 phải bổ sung mapping/schema/fixture phù hợp rồi kiểm tra lại.

Mỗi telemetry là **snapshot đầy đủ phần thiết bị sở hữu**: có mọi door được gán và mọi nhóm environment/occupancy được phép. Cảm biến lỗi gửi null/unknown, không bỏ trường. SIM-C02 chỉ gửi doors. Như vậy message door-only không thể làm dữ liệu nhiệt độ hoặc count cũ được coi là fresh.

## MQTT, QoS và ACL

Prefix: `khoguard/v1/WH01/devices/{device_id}/`. Suffix phải bằng `kind` trong envelope.

| Suffix | Publisher → subscriber | QoS / retain |
| --- | --- | --- |
| telemetry | Device → backend | QoS 1; retain snapshot có định danh phiên/timestamp |
| events | Device → backend | QoS 1; không retain |
| status | Device/Last Will → backend | QoS 1; retain |
| commands | Backend → device | QoS 1; **không retain** |
| acks | Device → backend | QoS 1; không retain |

ACL cần thực thi ở broker tại M02: device chỉ publish telemetry/events/status/acks của chính nó và subscribe commands của chính nó; backend có quyền nhận dữ liệu/gửi commands, không dùng quyền admin broker. Browser không giữ broker password. Chưa có ACL thực tế trong repository ở M01.

Envelope: version = 1, WH01, device ID, `boot_id`, `session_id`, sequence, kind, clock status, timestamp UTC hoặc null, uptime, payload; events thêm event ID. `boot_id` đổi khi firmware reboot; `session_id` đổi mỗi lần kết nối MQTT. `seq` là integer an toàn JavaScript, không dùng số 64-bit vượt 2^53−1.

- Telemetry/events/acks dùng counter tăng trong mỗi stream của một boot. Khóa dedupe dự kiến `(device_id, boot_id, kind, seq)`; event ID ổn định khi gửi lại, không sinh ID mới cho mỗi retry.
- Status là tín hiệu phiên, không quyết định bằng thứ tự seq của telemetry. Last Will có thể chuẩn bị trước với `seq = 0`, `sent_at = null`, `clock_synced = false`; uptime/timestamp của nó không đại diện thời điểm disconnect.
- Commands dùng `seq` của backend cho stream lệnh, `boot_id`/`session_id` là **phiên đích** đã xác nhận. `uptime_ms` trong commands là uptime bên gửi, không so sánh với uptime thiết bị.
- Backend phải đối chiếu boot/session hiện hành trước khi áp dụng status/ack/telemetry. Will của phiên cũ không được đánh offline phiên mới. Reconnect không có nghĩa toàn bộ input đã rõ.
- Clock chưa đồng bộ thì `sent_at = null`; clock đồng bộ bắt buộc UTC kết thúc `Z`. Backend ghi `received_at` riêng; không lấy timestamp của publisher làm thời gian nhận đáng tin cậy.

## Freshness, replay và reboot — quy tắc cho M05/M12

Chu kỳ đề xuất 2 giây, fresh nếu tuổi của telemetry phiên đang hoạt động ≤10 giây, stale nếu >10 giây. Snapshot luôn chứa cả thiết bị mất kết nối; không xóa khỏi tổng kho.

| Input / tình huống | Xử lý bắt buộc khi triển khai ingest |
| --- | --- |
| Cùng boot/kind/seq gửi lại | Không nhân đôi event hoặc tính RFID thêm lần nữa |
| Seq nhỏ hơn current trong cùng stream | Không ghi đè current state; replay event còn thiếu xử lý riêng, có dedupe |
| Boot/session cũ sau phiên mới đã xác nhận | Không thay current state hoặc bật online; ghi lý do bỏ qua |
| Retained message khi backend mới subscribe | Chưa coi fresh chỉ vì vừa nhận; chờ xác nhận phiên và telemetry mới |
| Clock unsynced sau reboot | Hiển thị unknown cho đến handshake phiên và telemetry không-retained mới |
| Thiết bị online nhưng chưa có telemetry mới | Freshness unknown; không coi các sensor clear |
| Last Will offline | Offline theo session đúng; tuổi dữ liệu không được reset |
| Backend mất DB | Không báo event đã lưu; retry có giới hạn/gap policy; application ack sau commit nếu triển khai replay |

M01 kiểm tra **hình dạng/bất biến**, chưa thực thi dedupe/handshake/replay. `validateSnapshot` kiểm tra fresh ⇒ online, có boot/session/last_seen, tuổi so với generated_at không quá 10 giây; chứng minh nguồn dữ liệu mới và sequence phải do ingest thực hiện ở các mốc sau.

## API snapshot và lỗi

`GET /api/snapshot` không có body/query ở v1; trả 200 với `snapshot.schema.json`. Response là full configured warehouse, không phân trang; device offline vẫn có mặt. Nhật ký/lịch sử sẽ là endpoint riêng có pagination ở mốc backend. Schema giữ giá trị null/unknown và source để adapter React hiển thị rõ. Nó chưa phải shape trực tiếp của `src/demo.js`; mapping UI triển khai ở M06.

WebSocket `/ws` dự kiến gửi `{ "type": "snapshot", "data": <snapshot> }` lúc kết nối và khi resync; update/revision gap protocol sẽ chốt khi làm M06. Không có WebSocket server ở M01.

Lỗi HTTP chung: `{ "error": { "code": "...", "message": "...", "details": [] } }`; details có thể bỏ và không chứa secret/stack SQL. Mapping dự kiến: 400 malformed JSON/query, 401 chưa đăng nhập, 403 không có quyền, 404 không tìm thấy, 409 revision/idempotency conflict, 413 quá lớn, 422 sai schema/quy tắc, 503 dependency không sẵn sàng. Các API ngoài snapshot trong `Agent.md` chưa được triển khai hoặc khóa toàn bộ response schema.

Validator code: INVALID_TOPIC, INVALID_JSON, PAYLOAD_TOO_LARGE, INVALID_SCHEMA, DEVICE_MISMATCH, DEVICE_NOT_REGISTERED, ZONE_MISMATCH, DOOR_NOT_ASSIGNED, UNSUPPORTED_TELEMETRY, INCOMPLETE_TELEMETRY, INVALID_COMMAND, INVALID_SNAPSHOT. Reason code điều khiển nằm trong `mqtt.schema.json`, tách khỏi lỗi parser.

Lệnh bắt buộc command ID, door ID, action, expected revision, phiên đích, expiry. Tuổi lệnh tối đa 30 giây từ sent_at; validator kiểm tra khoảng này, **không quyết định lệnh còn hạn tại thời điểm thực thi**. Edge phải kiểm tra đồng hồ hiện tại và phiên đích. Nếu clock chưa tin cậy thì từ chối lệnh từ xa, vẫn xử lý panic cục bộ. Lệnh trùng trả lại kết quả cũ; ID trùng nhưng body khác là conflict. Retention của ID phải đủ toàn bộ retry/replay window, được chốt cùng queue ở M10/M12.

`expected_revision` là revision trạng thái cục bộ của bộ điều khiển được backend theo dõi qua `controller_revision` trong telemetry/device snapshot; không so với revision snapshot toàn kho. M10 phải thực thi đối chiếu revision này trước khi dùng commands thật. Ack applied chỉ phát sau khi xác nhận trạng thái mục tiêu bằng input mô phỏng; pending do backend quản lý. Không ép cơ cấu thực hiện chỉ vì schema hợp lệ.

## Bảng quy tắc đã chốt cho các mốc nghiệp vụ

Các bảng này là đặc tả input/output, **chưa phải bộ điều khiển an toàn hoặc transaction đã hoạt động**.

| Count / input | Yêu cầu đóng bình thường |
| --- | --- |
| Count verified = 0; presence false; beam clear; panic false; local input khỏe | Có thể xét đóng, còn phải thỏa interlock và trạng thái cục bộ |
| Count >0 | Từ chối OCCUPIED |
| Count =0, presence true | Từ chối PRESENCE_DETECTED, báo sai lệch RFID/hiện diện |
| Count null/unverified, presence/beam/panic null | Từ chối INPUT_UNKNOWN |
| Beam blocked hoặc local input lỗi | Từ chối BEAM_BLOCKED / LOCAL_INPUT_FAILURE |
| Panic latched | Từ chối đóng; nhả khóa/mở theo mô hình khẩn cấp |
| Cửa airlock còn lại đang mở/đang mở ra, chế độ bình thường | Từ chối INTERLOCK_ACTIVE |
| Ack cảnh báo panic | Chỉ tiếp nhận; latch giữ nguyên; reset có quyền và điều kiện riêng |
| Broker/backend mất | Panic/beam/cổng đóng vẫn do edge quyết định, không chờ mạng |

Timer: cửa mở ≥30 s warning, >60 s danger; presence liên tục khi cửa đóng >300 s trapped alarm. Test clock giả ở M11, không dùng sleep dài. Sensor min/max nằm trong biên là hợp lệ; mất dữ liệu không phải nhiệt độ 0 °C.

| Sức chứa/lịch | Quyết định đã chốt |
| --- | --- |
| Sử dụng <85% / ≥85% / ≥95% | Bình thường / warning / danger; tính Occupied + Reserved trên capacity khả dụng |
| Đã ở ≥95% | Từ chối nhận thêm |
| Dưới 95%, sau reservation đạt đúng 95% | Cho phép nếu slot phù hợp; vượt 95% thì từ chối; không dùng phần trăm làm tròn |
| Không slot phù hợp hoặc staging blocked | Từ chối dù tỷ lệ còn thấp |
| Cooling/Defrost | Không phân bổ; capacity API là capacity khả dụng, không trừ buffer lần nữa |
| Reservation | 15 phút; kiểm tra và giữ chỗ cùng transaction; khóa sức chứa kho trước slot |
| 06:00 / 18:00 | Mốc bắt đầu ca theo Asia/Bangkok; khoảng `[start,end)`; seed demo đề xuất ca 06–18 và 18–06 hôm sau |
| Ngoài quyền/ngoài ca | Ghi an ninh, không cấp vào; không chặn người thoát hiểm |

Ca 12 giờ, buffer cụ thể, kích thước/tải trọng slot và cách reset panic là giả định demo sẽ được cấu hình ở M13/M14, không phải dữ liệu vận hành thật. Các mốc sau cần kiểm thử rule/transaction theo bảng trước khi đánh dấu đạt.

## Thay đổi M08 (13/10/2026)

Event `rfid` bắt buộc thêm `result`: `accepted` (đã cập nhật số người), `duplicate` (đọc lặp hoặc ra khi chưa vào, không đổi count) hoặc `unauthorized` (thẻ không trong danh sách cho phép). Event loại khác không được có `result`. Message cũ không có RFID vẫn hợp lệ. Xem DEC-016.


## Thay đổi M10/M11 (13/10/2026)

Telemetry có thể thêm: `doors[].locked`, `doors[].open_ms` (ms cửa đã mở theo đồng hồ thiết bị), `alarms[]` (`DOOR_OPEN_WARNING`/`DOOR_OPEN_CRITICAL` kèm `door_id` của chính thiết bị, `TRAPPED_PERSON` không kèm cửa; tối đa 6) và `outputs` (light/buzzer/heater/fan). Snapshot thêm door `locked` và alert `door_id`, `resolved_at`, `acknowledged_at`; mã alert cho phép chữ số (ví dụ `DEVICE_OFFLINE_ESP_C01`). Các trường đều tùy chọn, message cũ vẫn hợp lệ. Xem DEC-020, DEC-022.

## Thay đổi M12–M14 (13/10/2026)

- Snapshot: `zones[].capacity` là số vị trí khả dụng (bỏ vị trí xả đá; khu C = 78), `occupied` và `reserved` lấy từ bảng `slots`/`reservations` (demo seed, không phải WMS). Giữ chỗ đã quá hạn không tính.
- Quy tắc sức chứa ở bảng trên được áp dụng ở `server/admission.mjs` cho kho lưu trữ A–C; khu đệm D là cổng riêng (DEC-029).
- Ca 06:00/18:00 dùng như bảng trên; kết quả chỉ ghi `access_audit` (DEC-028).
