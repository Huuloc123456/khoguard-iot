# Quá trình thực hiện KhoGuard

Cập nhật: 12/10/2026. Sổ này ghi **đã làm thực tế**, kết quả kiểm tra và việc chưa xong. Kế hoạch: [Agent.md](Agent.md). Quyết định: [DESITION.md](DESITION.md). Các bước sau tiếp tục bổ sung ở đây; không ghi pass nếu chưa chạy.

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

## Bước kế tiếp

M03: firmware PlatformIO/Wokwi publish message hợp contract vào broker riêng. License/private gateway chưa xác minh; ghi kết quả trước khi đánh dấu đạt. Backend/schema nghiệp vụ bắt đầu M04 sau đó.

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
