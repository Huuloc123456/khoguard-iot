# Quá trình thực hiện KhoGuard

Cập nhật: 13/10/2026. Sổ này ghi **đã làm thực tế**, kết quả kiểm tra và việc chưa xong. Kế hoạch: [Agent.md](Agent.md). Quyết định: [DESITION.md](DESITION.md). Các bước sau tiếp tục bổ sung ở đây; không ghi pass nếu chưa chạy.

## 01 — Đọc tài liệu và kiểm tra công cụ

- Đã đọc hai tài liệu Word trong `D:\huit\iot\doc`, xác định kiến trúc kho IoT và yêu cầu kho lạnh/bốn kịch bản.
- Người dùng chốt mô phỏng bằng PlatformIO trong VS Code, không làm phần cứng thật.
- Đã kiểm tra VS Code, PlatformIO/Wokwi extension, Node/npm, Git, Python, Mosquitto, MQTTX, MySQL/công cụ DB, Postman, Docker/WSL. Chi tiết phiên bản ở `Agent.md`.
- Đã build thử ESP32 khi kiểm tra công cụ; chưa tạo firmware KhoGuard. Đã thử pub/sub bằng broker tạm riêng và dừng broker đó; không mở anonymous trên dịch vụ đang chạy.
- MySQL đã kiểm tra kết nối TCP, chưa đăng nhập/tạo schema. License và luồng mạng Wokwi chưa được xác minh.
- Đây là ghi lại công việc đã thực hiện trước khi có sổ quá trình; không coi là vừa chạy lại mọi phép kiểm tra.

## 02 — Giao diện cơ bản, M00

- Đã dựng React/Vite nền trắng, quản lý 4 khu A–D và 12 cửa; sơ đồ, cửa, môi trường, nhật ký.
- Đã có filter/search, chọn khu, tiếp nhận cảnh báo, CSV, bốn kịch bản và reset dữ liệu mẫu.
- Đã sửa cảnh báo màu khu, trạng thái cửa trên mobile, thao tác export ở màn hẹp và count của kịch bản vào hợp lệ.
- Kiểm tra ở lần hoàn thiện giao diện: 7 test logic pass, production build pass; kiểm tra trình duyệt 320/390/825/1440 px, keyboard và các thao tác chính.
- Save point: `8c3f61c` — `feat: add basic white warehouse dashboard with local demo scenarios`.
- Giới hạn: dữ liệu ở bộ nhớ trình duyệt, không MQTT/DB/Wokwi; panic chưa chứng minh chuyển đóng → mở trong firmware.

## 03 — Lập kế hoạch và chốt database

- Đã tạo `Agent.md`: M00–M17, công cụ/cấu hình, kiến trúc, điều kiện nghiệm thu và T01–T27.
- Đã kiểm tra UTF-8, tham chiếu 18 mốc, 27 dòng ma trận và code fence của tài liệu ở lần tạo.
- Đã trao đổi MongoDB như một phương án; người dùng chốt **giữ MySQL**. Ghi DEC-001, không cài MongoDB.

## 04 — Triển khai M01: hợp đồng dữ liệu

Ngày: 12/10/2026. Nhánh: `codex/m01-contracts-and-records`. Trạng thái: **đã đạt M01 trong phạm vi hợp đồng/validator**.

Đã làm:

- Tạo hai sổ `DESITION.md` và `QUA_TRINH.md` theo yêu cầu.
- Tạo registry 5 node logic/4 khu/12 cửa; ESP-C01 sở hữu hai cửa airlock; SIM-C02 chỉ D09 và không được ghi số người/nhiệt độ khu C.
- Tạo JSON Schema cho telemetry/events/status/commands/acks và response snapshot toàn kho.
- Tạo fixture MQTT và snapshot dựa trên dữ liệu demo; ghi rõ đây không phải kết nối thật.
- Tạo validator giới hạn byte/UTF-8/JSON/schema, mapping thiết bị–khu–cửa, telemetry đầy đủ, TTL command và bất biến snapshot.
- Ghi topic/QoS/retain/ACL dự kiến, boot/session/dedupe/freshness, reason code, quy tắc cửa/sức chứa/ca và ví dụ xử lý reboot/timeout ở `contracts/README.md`.
- Thêm Ajv và ajv-formats vào dev dependency; npm install báo 0 vulnerability tại thời điểm chạy.

Kiểm tra và sửa lỗi trong quá trình:

1. RED: `node --test tests/contracts.test.js` thất bại vì validator chưa tồn tại, trước khi viết implementation.
2. Khi compile schema, Ajv strictRequired báo các trường required trong nhánh chưa được khai báo tại nhánh đó. Đã khai báo các properties tại nhánh; giữ strict validation, không tắt kiểm tra để vượt test.
3. Lần kiểm tra contract sau sửa: 21 test pass, 0 fail/skip. Sau đó bổ sung session ID để phân biệt reconnect/Last Will cũ; cần chạy full suite trước khi kết luận hoàn thành.
4. Bổ sung controller revision cho lệnh dùng revision cục bộ, test registry ownership và session bắt buộc; full suite lúc này 29 test pass.
5. Rà soát timestamp phát hiện leap second/độ chính xác dưới mili giây ngoài khả năng clock ứng dụng. Đã viết test RED tái hiện, giới hạn UTC pattern và chạy lại full suite.

Kết quả nghiệm thu cuối:

- `npm test`: **30 pass, 0 fail, 0 skipped** — 23 test contract mới + 7 test demo cũ.
- `npm run build`: đạt; 20 module, JS gzip 76,47 kB; không có import validator vào frontend. Build chạy trước chỉnh pattern schema Node cuối, không có sửa UI sau đó.
- Bằng chứng: [docs/evidence/M01-2026-10-12.md](docs/evidence/M01-2026-10-12.md).
- Save point code: `f6a8e8c` — `feat: define validated MQTT and snapshot contracts`; sổ/kế hoạch được lưu trong commit tài liệu kế tiếp.
- Đã cập nhật M01 trong `Agent.md`, liên kết các sổ trong README; giữ MySQL và không thay cấu hình dịch vụ đang chạy.
- Không chạy lại browser hoặc test kết nối thật; frontend không thay đổi. Kiểm tra schema/data contract không phải kiểm định hệ thống an toàn.

Chưa làm: broker/config/ACL thật của dự án, đăng nhập/migration MySQL, firmware Wokwi, ingest/dedupe/replay, HTTP/WebSocket server, điều khiển hoặc transaction giữ chỗ. Validator contract không thay thế các bước này.

## 05 — Triển khai M02: broker/schema riêng

Ngày: 12/10/2026. Nhánh: codex/m02-local-infrastructure. Trạng thái: **đã đạt M02**.

Đã làm:

- Tạo template/ACL từ registry, script setup/start và 7 account MQTT; broker riêng 127.0.0.1:18884 đang chạy.
- Tạo .local với ACL NTFS riêng, Git ignore/Vite deny; người dùng điền admin local, không nhận password qua chat.
- Xác minh MySQL 26.7.0, tạo khoguard_demo/infra_meta, khoguard_runtime chỉ DML và khoguard_migrate DDL/DML trong schema.
- Bootstrap preflight collision và xác minh ownership khi chạy lại, không sửa tài nguyên ứng dụng khác; không log secret.
- Thêm mqtt/mysql2 ở manifest gốc, .npmrc chặn install hook; script kiểm tra MQTT/MySQL/secret và infra/README.md.

Lỗi/cách xử lý:

1. Root không password bị từ chối; người dùng điền và lưu mysql-admin.env rồi tiếp tục, không reset password.
2. Child PowerShell không load Set-Acl; dùng API ACL .NET tương ứng runtime.
3. Hash password file dùng file tạm rồi rename khi đủ account; kiểm tra danh sách user tránh file dở.
4. DB probe chỉ cleanup bảng chính lần chạy tạo; MQTT probe có deadline/kiểm tra lỗi, không coi timeout như ACL pass.
5. Clean install EPERM vì Vite khóa native binding: dừng đúng process dự án, npm ci đạt và mở lại UI. Không dừng dịch vụ cũ.

Kết quả thực tế:

- npm test: **35/35 đạt**, không skip; production build đạt, JS gzip 76,47 kB.
- infra:mqtt:check: **11 kiểm tra thật đạt**, 7 account, sai password/anonymous, cross-topic, quyền các role và MQTT 3.1.1.
- infra:db:check: **6 kiểm tra thật đạt**, DML/rollback, DDL migration, runtime không CREATE/DROP và hai account không đọc bảng quản trị.
- infra:secrets:check: 4 credential file Git ignore, 5 URL gồm @fs trả **403**. NTFS riêng đã kiểm tra.
- Setup/init chạy lại giữ credential, marker/instance khớp, không áp lại GRANT. npm ci đạt; audit lúc cài báo 0 vulnerability.
- npm audit signatures: 79 registry signature/22 attestation hợp lệ; mqtt 5.16.0, mysql2 3.24.5, không đổi version package cũ.
- Broker 18884/Vite 5173 đang chạy; dịch vụ Mosquitto/MySQL cũ vẫn chạy. [Bằng chứng M02](docs/evidence/M02-2026-10-12.md).
- Save point: d9b35be (dependency/install policy), c74f784 (infrastructure/probe); sau tách helper config khỏi schema compiler, 5 infra unit test chạy lại đạt và 5 file secret được kiểm tra NTFS.

Chưa làm: firmware/Wokwi/TLS, schema nghiệp vụ, ingest/API/WebSocket hay UI dữ liệu thật. MQTT probe là client Node, không phải ESP32. Quyết định mới: DEC-008/DEC-009.

## 06 — Triển khai M03: firmware PlatformIO/Wokwi

Ngày: 12/10/2026. Nhánh: codex/m03-wokwi-firmware. Trạng thái: **đã đạt M03 với gateway native**, chưa là backend hoặc bộ điều khiển an toàn.

Đã làm:

- Tạo firmware ESP-C01/DHT22, sơ đồ GPIO15/pull-up, config PlatformIO/Wokwi và hướng dẫn chạy. Giữ D07/D08/occupancy unknown; chưa có output điều khiển cửa.
- Khóa Espressif32 7.0.1/Arduino 2.0.17, MQTT 2.5.3, ArduinoJson 7.4.3, DHT 1.4.7 và Unified Sensor 1.1.15.
- Tạo credential header riêng .local, build artifact riêng .local/firmware-build; mở rộng ignore/Vite deny và kiểm tra secret.
- Tạo observer chỉ đọc; bỏ retained/duplicate, validate contract/QoS1, kiểm tra boot/session/seq/uptime và unknown input. Thêm 5 unit test, tổng 40 test.
- Tải Wokwi gateway native 2.0.1 từ release chính thức, đối chiếu SHA-256; setup/start bằng Windows PowerShell/.NET, không cần cài PowerShell 7.

Lỗi và cách xử lý:

1. PlatformIO console lỗi Unicode ở child runtime: đặt PYTHONIOENCODING=utf-8 trong wrapper build.
2. ArduinoJson proxy không copy được với toolchain Arduino 2: dùng JsonObject qua as<JsonObject>(); banner version dùng macro số. Build đạt sau sửa.
3. Gateway tích hợp publish được nhưng reconnect timeout 45 giây, UART/heartbeat dừng. Arduino 3.3.12 và 2.0.17 đều gặp; không coi đổi core là sửa lỗi. Chọn gateway native sau kiểm tra đạt. Thử pin task không được giữ trong bản cuối.
4. Child PowerShell không load Get-FileHash; dùng SHA-256/.NET và ZIP chuẩn. Tham số --forward= không tắt cổng 9080; đã sửa hướng dẫn/startscript, không ghi là cổng được tắt.
5. Người dùng lỡ Allow Firewall cho PowerShell rồi yêu cầu hiện lại để Cancel. Lệnh thường bị Access denied; UAC lần đầu bị Cancel nên không đổi quyền. Lần hai người dùng cho phép UAC và Cancel Firewall; đọc lại thấy hai rule Block/Public. Kiểm tra cổng trong script đã đổi sang loopback để tránh tạo lại prompt này.

Kết quả:

- npm test: **40/40 đạt**, 0 fail/skip. Build frontend đạt; firmware RAM 44.864 byte (13,7%), flash 762.745 byte (58,2%).
- Wokwi license hiện có chạy được. Boot 78629e212a11bb5db110f921622204e4 khớp UART và observer.
- Trước ngắt broker: session 8fddb16b607c215149d2f6865ec8cf61, seq 15–17, uptime 29.805–33.805 ms.
- Khi broker tắt: heartbeat tiếp tục tới 67.627 ms, retry được ghi. Sau mở broker: session 31c83d630a0ebc23dc6c465c6bc7af07, seq 21–23, uptime 80.801–84.824 ms; assertion cùng boot/session đổi/seq-uptime tiến đạt.
- Đổi DHT22 −18,4 → **39,4°C**, humidity 55%; observer seq 46–48 nhận reading mới và assertion đạt.
- infra:secrets:check: **7 file được ignore, 8 URL trả 403**; header/binary ACL NTFS riêng đã kiểm tra. Gateway setup reuse/hash và start từ chối cổng đang chiếm đạt.
- Sau thử dừng simulator/gateway; broker dự án 18884 và Vite 5173 vẫn chạy; Mosquitto service 1883/MySQL 3306 cũ không bị dừng. [Bằng chứng M03](docs/evidence/M03-2026-10-12.md), [hướng dẫn firmware](firmware/README.md). Quyết định DEC-010/DEC-011.
- Rà soát cuối 13/10/2026: 63 file tracked/new không chứa credential local đã đối chiếu, không in secret; git diff --check đạt. Admin env hiện trống password, không cần admin cho M03 hoặc runtime/migration M04.
- Save point code: e54ea19 — feat: add verified Wokwi MQTT firmware probe and native gateway; kế hoạch/quyết định/bằng chứng ở commit tài liệu kế tiếp. Chưa push hoặc merge.

Chưa kiểm tra: MQTTX GUI, Last Will riêng, mất WiFi riêng, cảm biến lỗi vật lý, TLS/NTP/command, backend/DB/UI dữ liệu thật. Không suy các phần này đã đạt từ test M03.

## 07 — Triển khai M04: backend và migration inventory

Ngày: 13/10/2026. Nhánh: codex/m04-backend-foundation. Trạng thái: **đã đạt M04**; giữ MySQL.

Đã làm:

- Tạo server/config.mjs, http.mjs, database.mjs, mqtt.mjs, start.mjs: localhost:3001, pool runtime, health/readiness, cấu hình fail closed, timeout/cleanup và lỗi không lộ secret.
- Tạo 001_inventory, seed từ registry: 1 kho, 4 khu, 5 thiết bị, 12 cửa; journal/checksum/ownership lock, seed transaction không ghi đè khi chạy lại. Có rollback SQL thủ công, chưa chạy.
- Thêm db:migrate, backend:start, backend:check; dùng thư viện sẵn có và node:http, không cài dependency mới hoặc tạo manifest server riêng.
- Tạo 6 test mới cho config/HTTP/readiness/migration/seed; integration probe sử dụng account riêng và proxy loopback để thử mất DB/MQTT mà không dừng dịch vụ.
- Tạo server/README.md, cập nhật kế hoạch/root README và DEC-012/DEC-013.

Kiểm tra và lỗi đã xử lý:

1. RED: test server và migration thất bại vì module chưa có, trước implementation. Test Host ban đầu dùng fetch không gửi Host override; đổi sang node:http.get để thật sự thử Host lạ, giữ yêu cầu HTTP 400.
2. db:migrate lần đầu applied/seed created, lần hai already complete/seed preserved. Không dùng admin, không drop/reset hoặc thay grant/schema khác.
3. backend:check: **9 kiểm tra thực tế đạt** — số lượng inventory, migration no-op, applying/checksum sai bị chặn và rollback, lock đồng thời bị chặn, seed giữ tên/Unicode prepared query, FK từ chối device khác khu, backend 200, DB loss/recover, MQTT loss/recover.
4. Mất transport của client test: ready 503, health 200; nối lại ready 200. Proxy chỉ ngắt socket test, MySQL/Mosquitto thật vẫn chạy.
5. Thiếu DB/MQTT password và HTTP_HOST LAN: child process exit 1 trước listen, không lộ secret. Start lần hai ở cổng 3001 bị chiếm: EADDRINUSE/exit 1, process hiện có vẫn chạy.
6. npm test: **46/46 pass**, 0 skipped. Frontend build đạt, 20 module/JS gzip 76,47 kB; npm audit: **0 vulnerability**. Không thêm dependency; firmware/UI không thay đổi.
7. infra:secrets:check: 7 file Git ignore, 8 HTTP URL 403. Backend 127.0.0.1:3001, broker riêng 18884, Vite 5173 đang chạy; MySQL 3306/service Mosquitto cũ 1883 không bị dừng.
8. Rà soát cuối: 78 file tracked/new không có credential local đã đối chiếu; git diff --check đạt. Startup nêu đúng tên biến thiếu, không nêu giá trị.

Bằng chứng: [M04-2026-10-13.md](docs/evidence/M04-2026-10-13.md). Save point: 976e83c — config/HTTP/unit test; a2f4449 — migration/inventory/runtime và integration check; các sổ/bằng chứng ở commit tài liệu kế tiếp. Không push/merge.

Chưa làm: subscribe/validate/dedupe/lưu telemetry, API snapshot/history, WebSocket, nối dashboard, auth/TLS, browser/E2E mới hoặc chạy rollback DDL. Đây là M05 trở đi, không suy là đã đạt từ readiness 200.

## Bước kế tiếp

## 08 — M05: telemetry tới MySQL/API (13/10/2026, đã đạt)

- Thêm migration 002, repository transaction, tombstone session/boot, subscriber QoS1, snapshot và lịch sử UTC có giới hạn. Script demo:environment nguồn SIM-A01 gửi mỗi 2 giây; input an toàn chưa có giữ null/unknown.
- 54 unit test, 10 nhóm telemetry:check và 9 backend:check đạt; build đạt, audit 0 vulnerability, 7 file secret ignored/8 URL 403. CLI 25,5°C/60% tới API fresh và Last Will offline khi dừng đã kiểm tra.
- Lỗi đã sửa: MySQL không cho CHECK tham chiếu AUTO_INCREMENT; journal applying giữ bằng chứng, sửa và hoàn tất riêng DDL mới sau ownership/checksum/count guards, không reset inventory. Lỗi pool getConnection trước try chưa xóa freshness đã sửa và thử DB transport mất/phục hồi. Đồng hồ gửi cũ không được kéo dài freshness từ thời gian nhận.
- Save points: e0b8ec7, f45523c, 7cf1e29, 8d4a8ad. [Bằng chứng M05](docs/evidence/M05-2026-10-13.md). Chưa nối dashboard, chưa chạy lại Wokwi→DB trong M05; chưa auth/TLS/replay hoặc rollback DDL.

Yêu cầu mới: tiếp tục M06–M08 và mở VS Code/web/MySQL/MQTT. M06 nối UI; M07 input ESP-C01; M08 RFID/số người/event ingest.

## 09 — M06: dashboard nhận dữ liệu backend (13/10/2026, đã đạt bằng nguồn script)

Môi trường kiểm tra M06–M08: container Linux riêng của Claude (Mosquitto 2.0.18, MySQL 8.0.46), dựng bằng chính template/ACL/provision/migration của dự án, không phải máy Windows. Trước khi làm, chạy lại M02–M05 trên môi trường này: mqtt 11, db 6, backend 9, telemetry 10 nhóm đều đạt.

- Code adapter đã có từ trước nhưng chưa ghi sổ: `src/live-data.js`, `src/useLiveWarehouse.js`, `server/websocket.mjs`, bộ chọn nguồn Backend/MQTT ↔ Demo trong `App.jsx`.
- E2E trình duyệt: MQTT 24,5→27,3°C hiện trên UI sau ~0,5 s không reload; reload vẫn có giá trị từ MySQL (nhãn Dữ liệu cũ); dừng backend báo mất kết nối, không rơi về số mẫu; bật lại tự nối.
- Lỗi đã sửa: tràn ngang 60 px ở 320 px do topbar; thêm rule `max-width: 399px`. Sau sửa 320/390/825 px: 0 px.
- Lỗi môi trường: `backend:check` chỉ nhận `ER_NO_REFERENCED_ROW_2`; MySQL 8.0 trả `ER_NO_REFERENCED_ROW` cho cùng lỗi FK khi runtime không đọc được bảng cha. Check nhận cả hai.
- Bằng chứng: [M06](docs/evidence/M06-2026-10-13.md). Chưa dùng Wokwi làm nguồn UI; chưa thêm E2E tự động vào repo.

## 10 — M07: firmware đọc input và trạng thái cửa (13/10/2026, code đạt, chưa chạy Wokwi)

- Code đã có từ trước: debounce/panic latch/input health trong `controller.h`, 7 input GPIO, telemetry D07/D08, event door/panic. Sửa: cửa đổi cùng lúc panic nay phát cả hai event.
- Thêm test ánh xạ sơ đồ Wokwi ↔ `INPUT_PINS` (`tests/diagram.test.js`). C++ test chạy bằng g++ đạt; header biên dịch được với gnu++11.
- Không build được PlatformIO: proxy mạng chặn `api.registry.platformio.org` (HTTPClientError). Không ghi là build đạt.
- Cần trên máy dự án: `npm run firmware:build`, chạy Wokwi, gạt từng switch, thử tắt broker. Bằng chứng: [M07](docs/evidence/M07-2026-10-13.md).

## 11 — M08: RFID, số người và event ingest (13/10/2026, đạt unit/integration, chưa chạy Wokwi)

- RED: `controller_test.cpp` đã có test `kg::Occupancy` (viết trước, chưa có code) và không biên dịch; bổ sung test parser serial rồi mới viết code.
- Firmware: whitelist demo, trạng thái trong/ngoài theo thẻ, không âm, count chưa xác minh sau boot (gửi null), xác minh 0 khi mmWave clear và không thẻ nào trong; dòng serial tràn → bỏ xác minh. RFID mô phỏng bằng Serial Monitor `RFID D07 DEMO-017 IN`.
- Contract: event `rfid` bắt buộc `result` (accepted/duplicate/unauthorized), các loại khác không được có `result`. Cập nhật example và test.
- Backend: migration `003_events` (device_events dedupe theo device+event_id, event_gaps), readiness yêu cầu 003, subscribe thêm `+/events`, ingest cần phiên đã xác nhận, bỏ retained replay/QoS0/trùng, ghi gap theo seq mỗi boot; `GET /api/events` có lọc device/type, limit ≤200, keyset cursor. `npm run events:check` mới.
- Dashboard: Nhật ký ở chế độ live đọc `/api/events` khi revision đổi; hiển thị quẹt hợp lệ, đọc lặp, thẻ bị từ chối và gap.
- Kết quả: `npm test` 66/66; `events:check` 5 nhóm; M02–M05 check chạy lại đạt; build đạt; audit 0.
- Lỗi đã gặp: lần đầu `events:check` đếm 6 thay vì 5 event. Nguyên nhân: Mosquitto giao message retained tới subscriber đang online với retain=false; event retained vẫn là live. Bỏ bước đó khỏi check; retained replay được unit test. Một lần thứ hai thất bại do sửa script không được áp (lệnh trước đó dừng giữa chừng), đã kiểm tra lại file rồi chạy lại đạt.
- Bằng chứng: [M08](docs/evidence/M08-2026-10-13.md). Chưa làm: Wokwi thật, ACK/replay event (M12), cảnh báo (M11), close gate (M09). Rollback 003 chưa chạy. Không commit/push (thư mục dự án ở đây không có Git).

## 12 — M09: bộ quy tắc an toàn cục bộ (13/10/2026, đạt)

- `controller.h`: close gate (panic → input chưa rõ/count chưa xác minh → count → presence → beam), đảo chiều khi đang đóng, timeout chạy cửa 10 s, panic chốt/nhả khóa/mở từ trạng thái đóng, reset chỉ khi nút nhả, liên động hai cửa (panic thắng liên động). Reason code dùng chung với contract.
- Test: `firmware/test/safety_test.cpp`, 4 nhóm M09 đạt bằng g++ (gnu++11, cùng chuẩn với Arduino-ESP32 2.0.17). Test M07/M08 vẫn đạt.
- Lỗi khi viết test: kỳ vọng đảo chiều sai. Contact vẫn báo mở nên đảo chiều kết thúc ngay ở "mở", không qua "đang mở". Sửa assertion, khôi phục beam trước lần đóng thứ hai.
- Quyết định: DEC-019 (mô hình chạy cửa), DEC-021 (output). Bằng chứng: [M09](docs/evidence/M09-2026-10-13.md).

## 13 — M10: lệnh cửa có ack và output mô phỏng (13/10/2026, đạt unit/integration/E2E, chưa chạy Wokwi)

- Firmware: 10 LED output trong `diagram.json` (test ánh xạ chân), nhận `commands`, kiểm phiên + revision, chống trùng 8 ID, ack có reason; telemetry thêm `locked`, `open_ms`, `alarms`, `outputs`. Cú pháp `main.cpp` kiểm bằng header giả lập; **chưa build PlatformIO** (proxy chặn).
- Contract: door `locked`/`open_ms`, `alarms`, `outputs`; alarm phải thuộc cửa của thiết bị. Snapshot: door `locked`, alert `door_id`/`resolved_at`/`acknowledged_at`; mã cảnh báo cho phép chữ số.
- Backend: migration 004 (applied, chạy lại no-op), readiness yêu cầu 004, subscribe thêm `+/acks` (4 grant), `POST /api/doors/:id/commands`, `GET /api/commands/:id`. Lệnh chỉ gửi khi thiết bị có phiên live ≤ 10 s; publish lỗi → `rejected/NOT_SENT`.
- Dashboard: thẻ "Điều khiển cửa khu C"; cửa chỉ đổi theo telemetry.
- Kết quả: `npm test` 76/76; `control:check` 7 nhóm (chạy 2 lần); M02–M08 check chạy lại đạt; E2E 2 lần đạt; build, audit 0.
- Lỗi đã gặp: (1) `control:check` lần hai fail vì `occurrences` 4 ≠ 2: cảnh báo của lần chạy trước còn trong cửa sổ 60 s nên được mở lại, đúng thiết kế; sửa check so sánh tương đối. (2) E2E: `npx` không dừng tiến trình Vite con, gọi thẳng `node_modules/.bin/vite`. (3) Tràn ngang trang Giám sát cửa trên mobile (có từ trước) do `sr-only` trong bảng; thêm `position: relative`.
- Quyết định: DEC-020, DEC-023. Bằng chứng: [M10](docs/evidence/M10-2026-10-13.md).

## 14 — M11: cảnh báo, timer, tiếp nhận (13/10/2026, đạt unit/integration/E2E, chưa chạy Wokwi)

- Edge giữ timer (≥ 30 s, > 60 s, > 5 phút, an toàn khi `millis()` tràn); backend chỉ phản ánh `alarms` và trạng thái edge thành bảng `alerts`.
- Một dòng cho mỗi điều kiện (khu|cửa|mã): tăng mức cùng dòng và cần tiếp nhận lại; hết điều kiện → resolved; lặp trong 60 s → mở lại cùng dòng. Nhiệt độ trễ 0,5 °C. Tiếp nhận ghi `alert_acks`, không đổi trạng thái.
- Dashboard: tiếp nhận qua API, hiện cảnh báo đã hết trong 10 phút; số cần tiếp nhận chỉ đếm active chưa tiếp nhận; bỏ câu "chưa có bộ máy cảnh báo hoặc điều khiển cửa"; giờ cập nhật theo múi giờ Việt Nam như các mốc khác.
- Quyết định: DEC-022. Bằng chứng: [M11](docs/evidence/M11-2026-10-13.md).
- Chưa làm: chạy Wokwi cho M07, M08, M10, M11; rollback 004 chưa chạy; đăng nhập/quyền (M13) — hiện chỉ giới hạn Origin. Không commit/push (thư mục dự án ở đây không có Git).

## 15 — M12: TLS, offline và phục hồi (13/10/2026, đạt trong sandbox, firmware TLS chưa chạy Wokwi)

- TLS bằng CA demo riêng (`infra:tls:setup`), listener 127.0.0.1:18885, backend `mqtts` kiểm CA + hostname; firmware `WiFiClientSecure` + CA khi `kg_secrets.h` có CA. Không `setInsecure()`, không anonymous, không sửa password file.
- Backend dùng phiên MQTT bền (`clean: false`); DB lỗi thì không PUBACK để broker giữ message. Broker giới hạn 1000 message/1 ngày; edge giới hạn event 32, ack 4, vượt thì ghi gap.
- Kết quả: `infra:tls:check` 6 nhóm, `recovery:check` 5 nhóm, check M02–M11 chạy lại qua TLS đạt.
- Lỗi đã gặp: (1) include `WiFiClientSecure.h` đặt trước `kg_secrets.h` nên macro CA chưa có; chuyển xuống sau. (2) MQTT 3.1.1 không báo publish bị ACL chặn; check dùng MQTT v5 để thấy reason 135. (3) `pkill -f` khớp chính shell đang chạy; dừng theo PID. (4) Container khởi động lại giữa phiên, phải bật lại MySQL/Mosquitto sandbox (dữ liệu còn).
- Quyết định: DEC-024, DEC-025. Bằng chứng: [M12](docs/evidence/M12-2026-10-13.md).

## 16 — M13: đăng nhập, vai trò, ca (13/10/2026, đạt)

- Migration 005 (users, user_sessions, auth_audit, access_cards, access_audit); `auth:setup` sinh mật khẩu local, DB lưu scrypt. Cookie HttpOnly/SameSite=Strict, khóa sau 5 lần sai. Mọi route dữ liệu + WebSocket cần phiên; viewer/operator/admin kiểm ở backend.
- Ca 06:00/18:00 giờ Việt Nam; đánh giá ca chỉ ghi audit, không đổi quyết định edge.
- Dashboard: đăng nhập, người dùng/vai trò/đăng xuất, chế độ chỉ xem, bảng "Ra vào theo ca"; phiên hết thì về đăng nhập.
- Kết quả: `auth:check` 5 nhóm; E2E trình duyệt 15 bước (gồm cả M14) đạt; các check cũ sửa để đăng nhập như dashboard (`scripts/check-session.mjs`).
- Lỗi đã gặp: (1) nới `card_id` sau khi đã áp 005 làm checksum lệch, readiness 503; trong sandbox chạy rollback 005 rồi migrate lại (máy dự án chưa áp 005 nên không bị). (2) `/api/commands/bad%20id` trả 404 thay vì 400; kiểm mã trong route. (3) `auth:check` lấy 4 dòng mới nhất nên lẫn dòng của `recovery:check` vừa chạy; lọc theo thời điểm bắt đầu bước.
- Quyết định: DEC-026, DEC-027, DEC-028 (DEC-023 được thay). Bằng chứng: [M13](docs/evidence/M13-2026-10-13.md).

## 17 — M14: giữ chỗ và nhận hàng (13/10/2026, đạt)

- Migration 006 (slots demo seed, reservations với unique `request_id` và `active_slot`). Quy tắc 85%/95% bằng số nguyên, khu đệm, vị trí phù hợp; transaction khóa kho trước rồi vị trí, thử lại khi deadlock; hết hạn đúng 15 phút theo đồng hồ backend.
- API `GET /api/reservations`, `POST /api/admissions`, `POST /api/reservations/:id/confirm|cancel`; snapshot có `occupied`/`reserved`. Dashboard có trang "Nhận hàng".
- Kết quả: `npm test` 96/96; `reservations:check` 5 nhóm (5 lần); E2E giữ chỗ/hủy/không có vị trí; `vite build` đạt.
- Lỗi đã gặp: lần đầu check cho hai request đồng thời dùng hàng thường/mát khi các khu đó đã hết chỗ nên cả hai bị NO_SUITABLE_SLOT; đổi sang hàng lạnh còn chỗ để chỉ ngưỡng sức chứa quyết định.
- Quyết định: DEC-029. Bằng chứng: [M14](docs/evidence/M14-2026-10-13.md).
- Chưa làm: chạy Wokwi cho M07, M08, M10, M11, M12; rollback 006 chưa chạy; xuất kho chưa có. Không commit/push (thư mục dự án ở đây không có Git).

## 18 — M15: lịch sử, báo cáo, CSV (13/10/2026, đạt)

- `server/reports.mjs`: 5 loại báo cáo (events, alerts, commands, reservations, access) với from/to (≤ 31 ngày), khu, loại, limit ≤ 500, cursor; access giữ quyền `access_audit`. Route `/api/reports/:kind`.
- `src/csv.js` dùng chung cho demo và Backend/MQTT: BOM, CRLF, quote, chặn công thức, cột theo danh sách. `src/History.jsx`: bộ lọc giờ Việt Nam, Tải thêm, Xuất CSV.
- Kết quả: `npm test` 100/100; `reports:check` 4 nhóm (khớp MySQL, phân trang, còn sau restart, CSV không lộ 13 secret); E2E 4 bước, 320/390 px không tràn.
- Lỗi đã gặp: test CSV ban đầu tách dòng theo CRLF nhưng lại kỳ vọng `\n` trong ô làm xuống dòng; sửa test: xuống dòng nằm trong ô có ngoặc kép.
- Quyết định: DEC-030. Bằng chứng: [M15](docs/evidence/M15-2026-10-13.md).

## 19 — M16: toàn kho, bốn demo, tải (13/10/2026, đạt sandbox, chưa đánh dấu vì cần Wokwi)

- `scripts/sim-lib.mjs`, `simulate-warehouse.mjs` (4 khu, 12 cửa, seed), `demo-scenarios.mjs` (bốn kịch bản §11 với ESP-C01 giả lập), `load-run.mjs` (50 nguồn ảo / 5 tài khoản), `verify-all.mjs` (toàn bộ check theo thứ tự).
- Kết quả: `verify:all` 16 bước đạt, 1 bỏ qua (secrets check cần Git). Tải ổn định 25 msg/s: mất 0/1.500, ingest P95 4 ms, publish → WebSocket P95 186 ms (mục tiêu ≤ 2 s); burst 500 hết sau 2,4 s; tổng mất 0/2.000.
- Ma trận T01–T27 ghi trong bằng chứng: còn T08 chưa chạy, T17/T24/T26 một phần, các dòng Wokwi chờ máy dự án.
- Lỗi đã gặp: (1) event xếp hàng mang session cũ sau reconnect; (2) `node --test` chạy nhầm `load-test.mjs`, đổi tên `load-run.mjs`; (3) tóm tắt `verify:all` lấy nhầm dòng.
- Quyết định: DEC-031. Bằng chứng: [M16](docs/evidence/M16-2026-10-13.md).

## 20 — Sơ đồ kiến trúc và hướng dẫn cấu hình (13/10/2026)

- Hai sơ đồ HTML/SVG theo skill diagram-design (cathrynlavery/diagram-design), dùng màu/chữ của dashboard: [kiến trúc tổng thể](docs/architecture/kien-truc-tong-the.html) (9 thành phần, 3 vùng, 12 đường nối) và [luồng lệnh cửa](docs/architecture/luong-lenh-cua.html) (sequence 5 bên, 12 message, một khối ALT). Ảnh PNG kèm theo; đã kiểm bằng ảnh chụp trình duyệt.
- Lệnh `/plugin marketplace add` không chạy được trong phiên đám mây này; skill được đọc từ bản clone của repo, không chạy script nào của repo đó. Cài trên máy: `/plugin marketplace add cathrynlavery/diagram-design` rồi `/plugin install diagram-design@diagram-design`.
- [docs/HUONG_DAN_CAU_HINH.md](docs/HUONG_DAN_CAU_HINH.md): từ cài công cụ trên Windows tới demo, kiểm tra toàn bộ, dừng/reset và bảng lỗi thường gặp.
- Quyết định: DEC-032.

Bước kế tiếp trên máy dự án:

1. `npm ci`, `npm test`, `npm run db:migrate` (nếu chưa áp 005, 006).
2. Dừng backend, Vite, Wokwi; với broker + MySQL đang chạy: `npm run verify:all`.
3. `npm run firmware:build`, chạy Wokwi theo phần "còn thiếu" của M07, M08, M10–M12 và bốn kịch bản bằng tay (M16), kể cả T08 dừng broker dự án khi panic.

Sau đó M17 (đóng gói, Postman collection, checklist demo).

## Mẫu ghi thêm ở mỗi bước

```text
Ngày / mốc / trạng thái:
Yêu cầu và quyết định liên quan:
Đã làm: file và hành vi cụ thể
Kiểm tra: command hoặc thao tác, kết quả pass/fail và số liệu
Lỗi đã gặp / cách sửa:
Bằng chứng hoặc commit:
Còn thiếu / bước tiếp theo:
```
## 13/10/2026 — Kiểm tra và chạy ZIP M06–M16 trên Windows

- Nạp 133 file thay đổi từ ZIP theo đường dẫn người dùng cung cấp; sao lưu bản trước trong `.local/backup-before-M06-M16-20261013`, giữ cấu hình VS Code và mật khẩu cục bộ.
- MySQL migration 003–006, tài khoản dashboard và TLS demo đã chuẩn bị. Web/backend/broker/Wokwi và bốn nguồn Node đang chạy; Workbench/MQTTX đã mở, giữ cấu hình riêng hiện có.
- Đạt 102/102 test JavaScript, hai bộ C++ qua WSL, build React/ESP32 và 14 script kiểm tra riêng sau sửa TLS. Bốn kịch bản có 20 bước (FakeEdge). Tải 2.000/2.000, mất 0; P95 publish→WebSocket 242 ms.
- Web hiển thị 5/5 thiết bị fresh; Đóng D07 từ web nhận ack applied từ firmware Wokwi; xuất CSV thật 24 dòng.
- Sửa test TLS nhận nhầm retained, observer còn giả định M03 và nguồn D09 ghi nhầm Wokwi. Thêm hai test hồi quy.
- Chưa nghiệm thu đủ RFID/presence/panic/T08 trên Wokwi vì thao tác công tắc chưa làm thay đổi input quan sát được. Diagram thử đã khôi phục, M16 chưa đánh dấu hoàn tất.
- [Báo cáo và ảnh kiểm thử](docs/evidence/CHECK-WINDOWS-2026-10-13.md). Quyết định: DEC-033, giới hạn TTL theo DEC-020.

## 13/10/2026 — Nghiệm thu firmware ESP-C01 trên Wokwi (M07, M08, M10–M12, phần Wokwi của M16)

- Thêm `scripts/wokwi-acceptance.mjs` (`npm run wokwi:acceptance`), Serial RFC2217 127.0.0.1:4000 trong `firmware/wokwi.toml`, dòng Serial `OUTPUTS` trong firmware; build PlatformIO đạt (RAM 14,3 %, flash 69,8 %). Viết lại README và thêm ARCHITECTURE.md.
- Kết quả 4 lượt trên cùng boot: **26/27 bước kiểm thử đạt trực tiếp**, S9 đạt phần kiểm thử và phần dọn được đối chiếu bằng MySQL. RFID (vào/ra/lặp/thu hồi/lạ/sai định dạng, MySQL + access audit), mmWave chặn đóng, liên động, đảo chiều khi chắn rèm quang, panic từ cửa đóng, tiếp nhận không xóa chốt, đặt lại chỉ khi nhả nút, thoát hiểm vượt liên động, **T08** (panic khi broker dừng → output tại chỗ; nối lại session mới, event vào MySQL), lệnh trùng không chạy lại, lệnh phiên cũ COMMAND_EXPIRED, timer cửa mở 30 005 / 60 002 ms khi broker dừng, mắc kẹt ~300 s. Firmware kết nối 18885 TLSv1.2.
- Lỗi đã gặp: (1) máy khởi động lại giữa phiên, phải bật lại broker/backend/Vite/gateway/mô phỏng; (2) PowerShell chặn `npm.ps1`, dùng `npm.cmd`; (3) nhiều lần gạt nhầm công tắc làm S3c, S5a hết giờ — S5a chạy lại đạt sau khi harness tự yêu cầu mở D07 trước; (4) `demo:warehouse` thoát khi broker dừng (MQTT.js `reconnectPeriod: 0`), phải chạy lại sau T08/S8 — cần sửa; (5) lần đầu cập nhật ma trận M16 dùng regex không xử lý CRLF làm hỏng file, đã khôi phục từ Git và sửa lại theo dòng.
- Đánh dấu M07, M08, M10, M11, M12 và ô thứ nhất của M16; Checkpoint B đạt. Chưa thử trên Wokwi: T06, reboot → count chưa xác minh, CA sai phía firmware.
- Còn lại: T17, T24, T26 để đóng M16; M17. Quyết định: DEC-034. [Bằng chứng](docs/evidence/WOKWI-2026-10-13.md).

## 13/10/2026 — M16 phần 2: T17, T24, T26, mô phỏng tự nối lại

- `demo:warehouse` thoát khi broker dừng (MQTT.js `reconnectPeriod: 0`, publish không bao giờ xong). Sửa: giới hạn 5 s mỗi lần gửi, tự nối lại phiên mới. Dừng broker 10 s: 4 thiết bị báo mất rồi tự nối lại, 5/5 `fresh`.
- T17: nhóm mới trong `reservations:check` — khu đệm 45/48 nhận, 46/48 `STAGING_BLOCKED` khi kho lưu trữ 209/258; bảng slot trước/sau giống hệt.
- T24: `writefault:check` mới (khóa dòng SIM-A01). Lần 1 thất bại: khung 4–6 mất. Lần 2 (sau DEC-035): khung 4 lưu, 5–6 mất. Bản sao backend có log từng gói chỉ ra PUBACK của gói thuộc kết nối đã đóng (DEC-036). Sửa theo TDD (RED → GREEN), lần 3 đạt: 4–6 lưu đúng một lần sau 620 ms, không báo `fresh`, ready 503 trong lúc lỗi.
- T26: 6 trang × 1440/825/320 px không tràn; Tab có thứ tự hợp lý, 100 % có viền focus, mọi ô có nhãn, link bỏ qua hoạt động.
- Hồi quy: `npm test` 105/105, `backend:check` 9/9, `telemetry:check` 10/10 (hai lần khác lỗi vì ESP-C01 Wokwi cùng tăng revision). **Chưa chạy `verify:all`** sau khi sửa ingest vì Wokwi đang chạy.
- Lỗi phụ: script tạm mất dấu `\` trong heredoc làm bộ lọc tiến trình broker không khớp; đổi mẫu không cần escape.
- Quyết định: DEC-035, DEC-036, DEC-037. [Bằng chứng](docs/evidence/M16-PART2-2026-10-13.md).
- Còn lại: `verify:all` (tắt Wokwi), rồi đánh dấu M16; M17.

## 13/10/2026 — Codex kiểm tra lại sau Claude

- Giữ các commit Claude; đọc các nhánh ingest, telemetry backlog, simulator reconnect và bằng chứng Wokwi. Không ghi đè ZIP đầu vào hay cấu hình secret.
- Ngắt riêng gateway dự án, dừng backend/Vite trong lúc chạy hồi quy; không dừng MySQL 3306 hay Mosquitto service 1883. Lượt đầu toàn bộ chỉ lỗi probe MQTT. Sửa receiver nhận nhầm retained/traffic cùng topic; regression với receiver cũ lỗi, bản mới 2/2 đạt.
- Bổ sung `writefault:check` vào runner và assert readiness. Lượt cuối `verify:all`: **16 đạt / 1 C++ bỏ qua**; hai bộ C++ đã chạy riêng qua WSL g++ 15.2 với cảnh báo thành lỗi và đều đạt.
- Bản source sạch từ Git cộng các sửa review, không secret/dependency/build cũ: `npm.cmd ci` đạt, audit 0 vulnerability, **107/107** test, build web đạt. Build firmware workspace đạt (RAM 14,3%, flash 69,8%). Tải **2.000/2.000**, P95 publish → WebSocket **211 ms**, burst ingest P95 3.050 ms.
- Bổ sung collection Postman không secret và checklist demo/bàn giao. 9 URL GET của collection kiểm tra bằng API trả 200; chưa import bằng UI Postman.
- Bật lại backend, Vite, gateway và 4 Node simulator. Snapshot: 12 cửa, 4 SIM-* fresh, ESP-C01 offline/stale; đã hỏi người dùng Stop/Start Wokwi. Phiên này không có công cụ điều khiển cửa sổ/trình duyệt.
- M16 tự động đã đạt; còn Wokwi T06/reboot/T20 phía firmware, đo DOM nếu cần xác nhận đúng mục tiêu. M17 tài liệu và clean source test/build đã chuẩn bị, chưa có người nhận chạy lại.
- Quyết định DEC-038; [bằng chứng](docs/evidence/REVIEW-CLAUDE-2026-10-13.md).

## 13/10/2026 — Phục hồi ESP-C01 sau lượt review

- Người dùng báo Simulator chạy, nhưng snapshot ESP-C01 vẫn offline/stale. Đọc Serial RFC2217: sensor heartbeat vẫn tăng, không có MQTT; không có socket VS Code tới gateway 9011. Gateway vượt qua probe WebSocket.
- Kiểm tra mã extension Wokwi 4.0.0: WebSocket gateway không tự reconnect sau close; restart mô phỏng có thể giữ object đã đóng. Người dùng đóng hẳn tab và F1 → Start Simulator; kết nối phục hồi. Không sửa extension hay tắt TLS.
- `firmware:check`: 3 frame live seq 9–11 đạt. Kiểm tra nối tiếp: seq 39–41 khớp Serial TELEMETRY_ACK; mẫu MySQL lưu đúng một lần. **5/5 online/fresh**, readiness 200; khu C −18,4 °C / 55 %, count 0 verified; D07/D08 closed/locked.
- Gửi đóng D07 (cửa đã đóng) bằng operator: HTTP 202, ACK `applied` sau khoảng 90 ms; lệnh lưu trong DB. Không gọi đây là thử hành trình motor.
- Bằng chứng: `docs/evidence/REVIEW-CLAUDE-2026-10-13/wokwi-resumed.json` và Serial đi kèm. Các ca Wokwi T06/reboot/T20 phía firmware và đo DOM vẫn chưa nghiệm thu thêm.

## 13/10/2026 — Hoàn thành Wokwi T06, reboot và TLS sai

- Tạo `scripts/wokwi-remaining.mjs`, lệnh `wokwi:remaining`; private workspace và firmware test ở `.local`, giữ nguyên controller và firmware demo gốc. Người dùng mở đúng tab kiểm thử; script tự nạp ảnh trong phạm vi watcher.
- Lượt cuối **9/9 nhóm đạt**: reboot với presence HIGH giữ count null/unverified và chặn đóng; beam/presence/contact unknown; count mất xác minh do Serial overflow; stale trả 409 không publish; CA sai và hostname sai bị chính ESP32 mbedTLS từ chối −9984; positive control CA đúng kết nối lại; phục hồi bin/ELF gốc và 5/5 fresh.
- Ca stale tìm ra lỗi backend xóa phiên mọi thiết bị khi từ chối `DEVICE_NOT_LIVE`. Viết test RED (backlog thay vì accepted), sửa nhánh nghiệp vụ ngoài transaction, GREEN 2/2; toàn bộ **109/109**. Lỗi DB thật vẫn fail closed.
- Kiểm tra write-fault sau sửa đạt 3 nhóm: 31/31 snapshots không fresh/readiness lỗi; khung tồn đọng lưu đúng một lần sau 418 ms. Bật lại bốn Node simulator; 5/5 fresh, readiness 200, lệnh đóng D07 nhận applied.
- Lượt chuẩn bị có lỗi watcher ngoài workspace, chạy nhầm cửa sổ và kiểm tra freshness trước TTL; đã sửa, không đánh dấu các lượt lỗi là đạt.
- Quyết định DEC-039/040; [bằng chứng chi tiết](docs/evidence/WOKWI-REMAINING-2026-10-13.md). Ba nhóm còn thiếu đã hoàn thành; M16 còn đo DOM, M17 còn người nhận chạy lại quy trình.

## 24/10/2026 — Hoàn thiện nội dung slide thuyết trình

- Tạo và hoàn thiện [docs/NOI_DUNG_SLIDE.md](docs/NOI_DUNG_SLIDE.md): 28 slide chia 5 chương; mỗi trang có tiêu đề, nội dung, hình chèn và ghi chú thuyết trình. Có gợi ý rút gọn còn 15 slide.
- Chương 1–2 dựa trên hai tài liệu Word Phần 1/Phần 2; chương 3–5 trình bày triển khai, demo, kết quả và giới hạn KhoGuard. Phân biệt rõ phương án công nghiệp trong tài liệu với chức năng đã mô phỏng.
- Thêm 8 sơ đồ SVG nền trắng trong `docs/slides/assets/`, dùng cùng ảnh giao diện có sẵn; render bản xem thử và kiểm tra bố cục, chữ tiếng Việt.
- Kiểm tra đủ 28 trang có nội dung/hình/ghi chú, 39 liên kết tệp tồn tại, 8 SVG hợp lệ. Số liệu kiểm thử trích từ bằng chứng 13/10/2026; không chạy lại hệ thống trong công việc soạn slide.
- Đầu ra là Markdown và hình minh họa; chưa tạo PowerPoint. Tên thành viên, lớp và giảng viên để nhóm bổ sung.

## 24/10/2026 — Chuẩn bị tích hợp ThingsBoard Cloud

- Người dùng chọn thêm dashboard, giữ website/MySQL; sau đó đổi từ cài cục bộ sang Cloud. Đã dừng riêng installer KhoGuard đang chờ Docker.
- Docker Desktop lỗi các socket khởi động: đã sao lưu thư mục runtime `Docker/run`, không reset data disk/volume; thao tác dọn socket tiếp theo bị duyệt tự động chặn nên không thực hiện. Không tiếp tục xử lý Docker sau khi chuyển Cloud.
- Thêm adapter `integrations/thingsboard.mjs`, dashboard generator, CLI setup/bridge/check và mẫu JSON 6 widget. Một Cloud device gộp 5 nguồn/12 cửa; nguồn thiết bị lấy registry hiện tại, không sửa firmware.
- Tạo file riêng `.local/thingsboard-cloud.env`; người dùng chưa có tài khoản nên đang hướng dẫn đăng ký và lấy API key. Chưa tạo device/dashboard thật, chưa gửi dữ liệu lên Cloud.
- Kiểm tra **130/130 unit đạt**, gồm 10 test tích hợp mới; cú pháp CLI và diff check đạt. Không gọi unit test là bằng chứng đã kết nối Cloud. [Bằng chứng](docs/evidence/THINGSBOARD-CLOUD-2026-10-24.md).
- Ghi M18 vào Agent.md, DEC-046, hướng dẫn `docs/THINGSBOARD.md` và link trong README. Chờ tài khoản/key rồi chạy setup → bridge → check, thử mất nguồn/phục hồi và xem dashboard thật.

## 24/10/2026 — Kết nối ThingsBoard Cloud thật

- Người dùng đăng nhập và cung cấp API key. Lưu trong `.local` được Git bỏ qua; không đưa giá trị vào tài liệu, bằng chứng hay kết quả hiển thị.
- Setup tạo một Cloud device `KhoGuard-WH01`, dashboard 4 bảng khu và 2 biểu đồ. API Cloud xác nhận cả hai loại widget tồn tại. Bật broker dự án, backend, Vite, nguồn D09 SIM-C02 và bridge.
- Phát hiện hostname MQTT phải có tiền tố `mqtt.` và gói toàn kho 103 trường không được nhận. Chẩn đoán bản tin nhỏ/50 trường nhận được; test RED hai lỗi, sửa endpoint và chia gói 50 trường, giữ TLS/QoS1/timestamp, GREEN.
- `thingsboard:check` đọc được dữ liệu 5 nguồn qua API Cloud. D09 fresh; bốn nguồn Wokwi chưa bật nên giữ stale/chưa rõ, không giả dữ liệu môi trường.
- Thử dừng đúng backend của lượt này: Cloud báo cả 5 nguồn unavailable; bật lại backend trong finally, bridge tự phục hồi. Không dừng MySQL hoặc dịch vụ Mosquitto dùng chung.
- Toàn bộ **131/131 unit đạt**; cập nhật M18, DEC-046 và [bằng chứng](docs/evidence/THINGSBOARD-CLOUD-2026-10-24.md). Chưa có trình duyệt kết nối để kiểm tra bố cục Cloud trên điện thoại; chưa thử ngắt chính Cloud/Internet.
- Key đã được gửi trong chat: khuyến nghị người dùng thu hồi sau setup/check; bridge dùng device token riêng nên tiếp tục gửi được. Không tự thu hồi key.

## 24–25/10/2026 — Rút gọn một khu, rà linh kiện và cập nhật hồ sơ

- Theo yêu cầu mới, giữ khu C / ESP-C01 / D07–D08. Đồng bộ registry, snapshot, API/history/report/access/giữ chỗ, demo React, firmware, ACL và ThingsBoard; ngừng A/B/D và SIM-C02. Hai cửa cùng khu giữ ví dụ liên động.
- Đóng băng seed v1 trong `db/seeds/registry-v1.json`, giữ checksum và SQL migration cũ. Không xóa các hàng lịch sử MySQL; bộ lọc hiện hành chỉ nhận đúng thiết bị/cửa hoạt động. Thêm kiểm thử chống lọt dữ liệu cửa D09 và `scope:check` đọc API thật.
- Chuyển firmware nhiều khu và script simulator không dùng vào `.local/single-zone-backup-20261024/retired/`. Lệnh xóa hàng loạt ban đầu bị duyệt tự động chặn với lý do `blocked by policy`; đã chọn lưu trữ thay vì xóa đệ quy. Bản Word/PPT gốc và diff trước thay đổi có sao lưu; giữ nguyên ZIP người dùng.
- Đối chiếu đầy đủ **30 phần tử điện** với firmware. Bổ sung **5 điện trở 220 Ω** cho LED, giữ pull-up DHT và hai pull-down Panic. Sửa tên PIR/siêu âm thay cho mmWave/rèm quang; loại mô tả MQ-2, LCD và Reset vật lý không có trong mô hình. Tạo bảng GPIO/nguồn và hai SVG nối dây/kiến trúc.
- ThingsBoard Cloud giữ device/dashboard ID, còn một bảng C và hai biểu đồ. API đọc lại ESP-C01 thành công; khi chưa bật Wokwi, nguồn giữ stale đúng thực tế. Không xóa telemetry Cloud cũ, không thêm RPC.
- Viết README đầy đủ, cập nhật hướng dẫn cấu hình/demo, kiến trúc, hợp đồng, kế hoạch, checklist và DEC-047. PowerPoint **33 slide/5 chương** giữ mẫu HUIT; Word **13 trang/5 chương** có phụ lục sơ đồ A3. Đã render và xem từng slide/trang; PPT package/layout/font/import đạt. Cập nhật cả Word trong `D:\huit\iot\doc` và bản trong `docs/`.
- Kiểm tra cuối: **128/128 unit**, Vite production và PlatformIO esp32dev thành công; hai bộ C++ chạy qua WSL đạt. `verify:all` **17 bước đạt, 0 lỗi, một nhánh C++ bỏ qua** do Windows thiếu g++ trên PATH (đã kiểm tra riêng qua WSL). Bản tin tải cuối lưu **58/58**, P95 publish → WebSocket **499 ms** trên 8 mẫu; slide/Word giữ số liệu checkpoint 24/10 là 625 ms và có bằng chứng riêng.
- Đã bật lại broker/backend/Vite/bridge, `scope:check` và Cloud readback đạt. Chưa nghiệm thu lại Wokwi tương tác/relay hiện hành, bố cục web/Cloud trên điện thoại hoặc phần cứng thật. C++/build không được ghi thành bằng chứng phản ứng linh kiện. [Kết quả và bằng chứng](docs/evidence/SINGLE-ZONE-2026-10-24.md).

## 25/10/2026 — Chạy thử project một khu với Wokwi

- Theo yêu cầu chạy thử: xác nhận MySQL, broker 18884/18885, backend 3001 và React 5173 đang hoạt động; bật lại gateway Wokwi 9011. Web trả HTTP 200, `/api/ready` xác nhận database ready và MQTT connected.
- Dùng công cụ điều khiển ứng dụng mở đúng cửa sổ `Wokwi Simulator - khoguard-iot`, nhấn Start. Thông báo lỗi gateway cũ đã được đóng sau khi gateway kết nối thành công; không sửa cấu hình mạng hay firewall.
- Quan sát Serial có `MQTT_ONLINE`, `SENSOR_HEARTBEAT` nhiệt độ −18,4 °C/độ ẩm 55%, `TELEMETRY ACK` tăng liên tục. Sonar D07/D08 chuyển clear sau khi khởi tạo. `scope:check` xác nhận fresh, chỉ C/ESP-C01/D07,D08 và 78 vị trí.
- ThingsBoard Cloud readback fresh, −18,4 °C, timestamp nguồn mới. Giữ Wokwi và các dịch vụ chạy cho người dùng xem; đã yêu cầu mở web trong panel Codex. Bằng chứng: `docs/evidence/SINGLE-ZONE-2026-10-24/scope-run-2026-10-25.json`, `cloud-run-2026-10-25.log`.
- Đây là kiểm tra khởi động và đường truyền Wokwi → MQTT → backend/MySQL → Cloud; chưa chạy lại toàn bộ RFID/Panic/servo/relay/reboot/TLS sai hoặc xem bố cục React bằng trình duyệt. Không đánh dấu toàn bộ nghiệm thu tương tác là hoàn thành.

## 25/10/2026 — Demo tương tác và hoàn thiện tài liệu

- Quan sát trực tiếp trên Wokwi: MFRC522 Blue IN/OUT, thẻ Red bị từ chối và ghi MySQL; PIR chặn đóng; sonar tĩnh chặn lệnh đóng ở D07 và D08; liên động hai cửa; contact/lệnh D07–D08; DHT22 cảnh báo và phục hồi; cảnh báo giữ cửa 30/>60 giây và tự gỡ; Panic D07/D08; đầu ra Panic cục bộ khi broker dừng và sự kiện được MySQL nhận sau khi MQTT trở lại.
- Chưa tạo được vật cản đúng thời điểm cửa đang đóng để xác nhận đảo chiều. Reset khi nút Panic vẫn giữ bị chặn `PANIC_ACTIVE`; chuỗi nhả nút rồi reset chưa được xác nhận trọn vẹn trong cùng phiên. Không báo hai ca này là đạt.
- Acceptance harness từng đọc sai đối tượng event và kiểm tra MySQL quá sớm; đã sửa truy vấn kết quả và chờ sự kiện. Bằng chứng trực tiếp xác nhận event đến MySQL sau reconnect; chưa chạy lại toàn bộ acceptance suite sau bản sửa cuối.
- Viết lại hướng dẫn demo và lời thuyết trình theo 33 trang; bổ sung phần nối dây giải thích đơn giản, giữ nguyên bảng kỹ thuật; cập nhật README, tasks/todo và trạng thái Agent.
- Chuyển trình tạo slide 28 trang và 8 hình minh họa nhiều khu đã lỗi thời sang `.local/archive/legacy-slides-2026-10-25/`; giữ nguyên, có thể khôi phục. Tạo `docs/slides/README.md` nêu nguồn 33 trang hiện hành. Sửa chú thích firmware để phản ánh đầu đọc MFRC522 Wokwi thật và vẫn giữ đường Serial cho kiểm thử tự động.
- Không chạy lại unit test/build trong lượt viết tài liệu. Các kết quả kiểm tra tự động trước đó vẫn có ngày và bằng chứng riêng; không gộp chúng với ca tương tác.

## 25/10/2026 — Tìm skill GitHub và làm lại bố cục slide

- Theo yêu cầu, đọc và áp dụng [presentation-skill](https://github.com/siril9/presentation-skill) (MIT): giữ outline làm nguồn chuẩn, thay cấu trúc theo nội dung, dựng lại rồi kiểm tra hình ảnh.
- Làm mới PowerPoint 33 trang theo nền sáng, tiêu đề navy, điểm nhấn cyan; phân cấp rõ chương và dùng timeline, sơ đồ, thẻ, so sánh và ảnh minh họa thay cho chuỗi trang chữ/bảng đồng dạng.
- Thêm ảnh minh họa kho lạnh, linh kiện, liên động hai cửa; ghi rõ đó là ảnh tạo để minh họa, không phải ảnh thiết bị thật. Làm sơ đồ dây GPIO thành hình lớn hơn; bảng chân và lưu ý điện áp vẫn có ở `docs/LINH_KIEN_VA_NOI_DAY.md`.
- Nguồn sửa được: `docs/slides/outline.json`; hình ở `docs/slides/assets/`. Giữ bản PowerPoint cũ tại `.local/KhoGuard-thuyet-trinh-before-redesign-20261025.pptx`.
- Dựng lại đủ 33 trang. Kiểm tra tự động: 0 tràn chữ, 0 chồng lấn, 0 placeholder, 0 lỗi hình học; xem contact sheet và trang sơ đồ bằng PowerPoint/PDF.
- Còn một cảnh báo khoảng trắng trên trang sơ đồ dây: toàn bộ pin nhiều nên trang chỉ dùng để nhìn tổng quan; tra cứu từng chân trong bảng Markdown. Ảnh sinh tạo không đại diện phần cứng vật lý.

## 25/10/2026 — Áp dụng template PowerPoint HUIT

- Theo yêu cầu và roster 33 trang đã được người dùng duyệt, dùng mẫu `docs/slides/2-template-bvkltn-khoa12-2024.pptx` làm bố cục thật; giữ logo, thanh xanh đầu trang, chân trang họa tiết, trang bìa/kết thúc và trang chia 5 chương. Đọc skill `ppt-master` từ [GitHub](https://github.com/hugohe3/ppt-master), cài bản làm việc riêng trong `.local` và dùng workflow Edit Native PPTX. Không sửa template nguồn.
- Xuất 33 trang thành PPTX native; 33/33 trang qua SVG quality gate, file qua delivery check và đọc lại xác nhận 33 trang. Render toàn bộ bằng PowerPoint thành PDF để xem flow; kiểm tra phóng lớn trang nội dung, dây GPIO, số liệu và trang kết.
- Sửa nhãn số liệu bị đặt lệch khỏi thẻ (trang 6 và các trang số liệu), khoảng cách tiêu đề/phụ đề ở trang kiểm thử, và dòng chữ đè lên tranh cảm ơn. Render lại xác nhận các lỗi hình thức này đã hết.
- Delivery check: gói PPTX và quan hệ nội bộ hợp lệ; trạng thái `passed-with-advisories` do theme font được kế thừa từ template HUIT. Có thể có thay font nhẹ trên máy không có cùng font; cần mở bằng PowerPoint trước khi trình chiếu.
- Cập nhật hướng dẫn slide, README và DEC-048 để ghi rõ mẫu và quy trình. Giữ bản trước HUIT trong `.local` trước khi thay PowerPoint hiện hành.

## 26/10/2026 — Bổ sung bài lab Python về giữ chỗ

- Đối chiếu tài liệu Phần 2, mục 2.7: ví dụ `validate_inbound_request` lọc vị trí theo nhiệt độ/tải trọng/thể tích, từ chối khi kho đạt 95% và giữ ô 15 phút.
- Thêm `labs/python/inbound_reservation.py` chạy độc lập bằng thư viện chuẩn; hướng dẫn cách chạy trong `labs/python/README.md`. Cập nhật README, cấu hình máy, Agent.md, `.gitignore` và DEC-049.
- Backend thật vẫn dùng Node.js/MySQL transaction; Python chỉ hiện thực bài lab để tránh duy trì hai đường xử lý đơn hàng trong runtime.
- Chưa chạy script hoặc test trong lượt thêm bài giữ chỗ.

## 26/10/2026 — Rà soát bài thực hành trong tài liệu môn học

- Đối chiếu năm bộ slide IoT, hướng dẫn đồ án PDF, báo cáo nhóm và tài liệu Phần 1/2. Chưa thấy danh sách lab riêng có mã số; các slide 3 có ví dụ thực hành Arduino/ESP32, Raspberry Pi GPIO/PWM/ngắt, Flask và truyền dữ liệu ESP32–server. Bảng đối chiếu ở `docs/DOI_CHIEU_BAI_LAB.md` ghi trạng thái và giới hạn từng phần.
- Bổ sung Flask web lab trên Windows với GPIO giả lập: ba LED, nút ảo có edge callback/debounce, PWM và trang HTML/CSS. Chỉ bind `127.0.0.1`; không gọi backend chính hoặc điều khiển thiết bị thật. Thêm venv/requirements instructions và ignore `__pycache__`.
- MQTT, HTTP, auth/TLS và đường Wokwi→MySQL đã có thực hành tương ứng trong project; AMQP/RabbitMQ là ví dụ giao thức trong slide, không thuộc kiến trúc đồ án đã chọn.

## 26/10/2026 — Nghiệm thu bổ sung sau khi public repo

- `npm.cmd audit fix` cập nhật `fast-uri` 3.1.8 → 3.1.9 trong lockfile; `npm.cmd audit` sau đó báo 0 lỗ hổng.
- Hồi quy sau cập nhật dependency: `npm.cmd test` 130/130; `npm.cmd run build` thành công với 104 module; Python lab 4/4.
- `npm.cmd run verify:all`: 17 bước đạt, nhánh C++ Windows bỏ qua do thiếu g++ trên PATH. Chạy hai bộ C++ riêng trên WSL Ubuntu/g++ 15.2: đều đạt.
- Wokwi fault-suite trên ESP32 mô phỏng đạt reboot với count chưa xác minh, beam/presence/contact unknown, mất dòng RFID, stale telemetry bị từ chối, CA sai và hostname sai bị ESP32 từ chối; CA đúng nối lại và firmware gốc được khôi phục đúng SHA. Sau Restart Wokwi, snapshot C/ESP-C01/D07–D08 trở lại fresh.
- Bằng chứng tóm tắt, không chứa secret: [ACCEPTANCE-2026-10-26.md](docs/evidence/ACCEPTANCE-2026-10-26.md). Log chi tiết fault-suite được giữ trong `.local/wokwi-remaining/` và không commit.
- Còn cần thao tác tay trên sơ đồ một khu: đảo chiều khi sonar bị chắn trong lúc đóng; nhả/reset Panic; broker offline trong Panic và gửi event sau reconnect; lệnh trùng/phiên cũ; timer cửa mở và PIR >5 phút. Chưa xem UI hiện tại trên mobile/ThingsBoard mobile.
