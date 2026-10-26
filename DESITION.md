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

## DEC-008 — Bootstrap M02 và quyền runtime riêng

- Ngày: 12/10/2026. Trạng thái: **đã triển khai và kiểm thử thật**; thực hiện DEC-007.
- Quyết định: broker 127.0.0.1:18884, 5 device account + backend + observer chỉ đọc; khoguard_demo và runtime/migration account trên MySQL hiện có.
- Admin do người dùng điền local, chỉ dùng bootstrap. Collision check và marker ownership chặn nhận nhầm tài nguyên; không reset password/đổi dịch vụ cũ. Runtime chỉ DML, migration DDL/DML trong schema dự án.
- Hệ quả: bootstrap nhiều lệnh không nguyên tử, gián đoạn sẽ chặn retry tự động để kiểm tra. Giữ .local để còn credential/marker. MQTT chưa TLS, chỉ loopback; M12 nghiệm thu TLS riêng.

## DEC-009 — Secret local và một installation boundary

- Ngày: 12/10/2026. Trạng thái: **đã triển khai và kiểm thử**.
- Quyết định: secret trong .local, NTFS chỉ người dùng hiện tại/SYSTEM; Git ignore và Vite HTTP deny. Sinh password ngẫu nhiên, không log SQL/password; env.example trống.
- Dùng manifest/lockfile npm gốc cho mqtt/mysql2 và infra; chưa tạo server manifest riêng. .npmrc tắt install lifecycle scripts; clean install/build/test đạt, không có package hiện tại cần install hook.
- Hệ quả: M04 dùng npm script gốc, không npm --prefix server ci trước khi có boundary riêng. Dừng Vite trước clean install trên Windows, không dùng admin toàn máy để vượt EPERM.

## DEC-010 — Probe ESP-C01 trước bộ điều khiển cửa

- Ngày: 12/10/2026. Trạng thái: **đã triển khai/build/publish kiểm thử**.
- Dùng PlatformIO Espressif32 7.0.1, Arduino 2.0.17 và các thư viện khóa phiên bản trong firmware/platformio.ini. Đây là probe MQTT/DHT22, chưa là safety controller.
- Gửi đầy đủ telemetry thiết bị sở hữu; D07/D08, occupancy, beam/panic chưa nối nên unknown/null, không dùng số 0 hoặc false để báo an toàn. Clock chưa đồng bộ nên sent_at=null; chưa nhận command.
- Network task riêng, QoS1/retain, retry 5 giây; boot/session ngẫu nhiên, seq theo boot. Observer chỉ đọc kiểm tra schema, live frame và boot đối chiếu UART.
- Header và binary/ELF chứa credential chỉ ở .local có NTFS riêng, Git ignore và HTTP deny. Firmware nhận duy nhất account ESP-C01, không dùng account backend/admin.
- Hệ quả: M03 chứng minh đường cảm biến → broker; backend/DB/UI và điều khiển an toàn làm ở các mốc sau. Arduino 3.3.12 cũng từng gửi được dữ liệu; thay core không giải quyết reconnect gateway tích hợp.

## DEC-011 — Gateway native cho Wokwi trên máy này

- Ngày: 12/10/2026. Trạng thái: **đã chọn sau thử reconnect thực tế đạt**.
- Chọn Wokwi gateway native 2.0.1, tải release chính thức, kiểm tra SHA-256 ZIP/executable. wokwi.toml dùng ws://127.0.0.1:9011, ESP32 dùng host.wokwi.internal:18884; broker vẫn chỉ bind loopback.
- Lý do: gateway tích hợp Wokwi 4.0.0 gửi được telemetry, nhưng mất broker làm heartbeat/UART dừng và không nối lại trong 45 giây. Với gateway native, heartbeat tiếp tục, cùng boot/session mới/seq tăng sau broker restart. Đây là bằng chứng lựa chọn, chưa xác định lỗi nội bộ gateway tích hợp.
- Hệ quả: thêm một terminal gateway khi chạy demo. Upstream còn forward HTTP cổng 9080 trên mọi interface và không hỗ trợ tắt bằng --forward=; firmware hiện không có HTTP server. Không cấp quyền Firewall rộng; dừng gateway sau demo. Cần giới hạn ingress trước khi thêm HTTP server hoặc chạy ở môi trường khác.
- Script kiểm tra cổng chỉ bind loopback. Người dùng đã yêu cầu hoàn tác lần nhấn Allow nhầm: gỡ đúng hai quyền PowerShell Public qua UAC do người dùng xác nhận, người dùng Cancel hộp thoại Firewall; đã đọc lại thấy Block/Public. Không đổi Firewall toàn cục hay quyền của ứng dụng khác.

## DEC-012 — Backend HTTP cục bộ và readiness tách liveness

- Ngày: 13/10/2026. Trạng thái: **đã triển khai và kiểm thử M04**.
- Dùng node:http có sẵn cho hai route, mysql2 pool và MQTT.js hiện có. Chưa thêm Express/ws/ORM vì M04 chưa có nghiệp vụ, ingest hay WebSocket; giữ một manifest/lockfile gốc.
- Health chỉ xác nhận HTTP process sống. Ready kiểm tra DB đúng ownership/migration/seed và MQTT connected; lỗi trả 503, health vẫn 200. Không dùng ready để xác nhận dữ liệu cảm biến mới hoặc an toàn cửa.
- Config chỉ localhost/schema/account dự án; backend dùng runtime, migration dùng migration account, không cần admin. Thiếu credential báo tên biến nhưng không báo giá trị. Host/request/header/socket có kiểm tra/giới hạn; chưa mở CORS hoặc endpoint điều khiển.
- Pool 4 connection, không queue vô hạn, connect/query có timeout; connection lỗi bị loại. MQTT reconnect nền, chưa subscribe. Hệ quả: M05 mới ingest, M06 mới nối giao diện; ngoài localhost cần HTTPS/auth/phân quyền theo các mốc sau.

## DEC-013 — Journal migration và seed bảo toàn inventory

- Ngày: 13/10/2026. Trạng thái: **đã áp dụng trên MySQL và kiểm thử chạy lại**.
- Migration 001_inventory tạo warehouses/zones/devices/doors; foreign key device+zone giữ ownership cửa. ID/mapping theo contracts/devices.json, nhãn theo seed JSON; không đưa snapshot cảm biến giả vào DB như dữ liệu thật.
- Xác minh setup ID/server UUID M02 trước ghi, lock theo schema, checksum SQL chuẩn hóa LF. Journal applying/complete vì MySQL DDL implicit commit; migration dở/checksum đổi/collision bị từ chối, không reset tự động.
- Seed transaction kèm checksum marker; chạy lại giữ dữ liệu đã có. Thay registry/seed đã áp dụng phải có migration mới. Runtime không tự migration khi start.
- Hệ quả: cần chạy db:migrate trước khi ready 200; migration/seed lặp lại no-op. Có SQL rollback thủ công sau backup/ownership check, chưa chạy; rollback DDL không khôi phục dữ liệu mất. 9 integration check đã thử lỗi journal, lock, FK và transport bằng proxy localhost, không dừng dịch vụ dùng chung.

## Cách cập nhật

## DEC-014 — Ingest transaction và phiên MQTT

- Ngày 13/10/2026; đã kiểm thử M05. Giữ MySQL, dùng unique device/boot/seq cho bảng telemetry; history/current/revision commit cùng transaction. Phiên đã nghỉ lưu tombstone trong DB, Will cũ không đánh offline phiên mới.
- Status online (kể cả retained) chỉ xác nhận candidate; cần telemetry live cùng phiên mới fresh. Duplicate/retained không kéo dài độ mới. MQTT/transaction lỗi hoặc backend restart xóa xác nhận live; giá trị cuối vẫn có nhưng stale/unknown.
- MQTT.js handleMessage backpressure một packet; DB lỗi hủy MQTT, không ACK như đã lưu. Clean session chỉ phục hồi retained cuối; application ACK/replay chống gap còn ở M12.

## DEC-015 — Snapshot giữ unknown và lịch sử có giới hạn

- Ngày 13/10/2026; đã triển khai. Range/capacity là cấu hình demo; occupied/reserved null trước WMS. Không suy count/presence/door an toàn từ mất tín hiệu. Null vẫn phải giữ ràng buộc capacity cho phần đã biết.
- GET telemetry bắt buộc device đăng ký + khoảng UTC [from,to) theo received_at tối đa 7 ngày, limit 1–200, keyset cursor; query trùng/lạ sai trả 400, DB lỗi 503. Ajv chuyển runtime, không thêm framework.

## DEC-016 — RFID mô phỏng qua Serial Monitor, quyết định tại edge

- Ngày 13/10/2026; đã triển khai, test C++ đạt, chưa chạy Wokwi. Wokwi không có RC522; dòng `RFID D07|D08 <thẻ> IN|OUT` thay đầu đọc. Không thêm 6+ nút GPIO.
- ESP-C01 là nguồn sự thật của số người khu C; backend chỉ lưu và hiển thị, không tự cộng/trừ hay "sửa" count theo presence.
- Event RFID mang `result` (accepted/duplicate/unauthorized) để thẻ bị từ chối và đọc lặp vẫn được audit. Thay đổi contract tương thích ngược cho các loại event khác.

## DEC-017 — Xác minh số người sau boot

- Ngày 13/10/2026; đã triển khai. Boot hoặc dòng serial tràn → count chưa xác minh, telemetry gửi `current_occupants: null`. Chỉ xác minh = 0 khi mmWave clear (debounce) và không thẻ hợp lệ nào đang trong.
- Hệ quả: nếu mmWave bỏ sót người thì vẫn có thể xác minh sai; đây là giả định mô phỏng, không phải bộ điều khiển an toàn đã chứng nhận. Close gate M09 vẫn phải kiểm beam/presence riêng.

## DEC-018 — Lưu event và ghi gap, chưa replay

- Ngày 13/10/2026; đã kiểm thử. Dedupe `(device_id, event_id)`; seq event theo boot bắt đầu từ 1, nhảy seq ghi `event_gaps` và hiện trên Nhật ký. Không hứa log đầy đủ khi hàng đợi edge đầy hoặc mất mạng; ACK sau commit và replay để M12.
- Event cần phiên đã xác nhận (status online hoặc telemetry hiện hành). Retained chỉ bị từ chối khi replay lúc subscribe vì Mosquitto giao retained tới subscriber đang online với retain=false; firmware không retain event.

## DEC-019 — Mô hình chạy cửa trong Wokwi

- Ngày 13/10/2026; đã triển khai, test C++ đạt, chưa chạy Wokwi. Wokwi không có motor cửa: switch contact là cảm biến vị trí (bật = mở), LED motor mở/đóng là lệnh chạy. Lệnh chỉ khởi động chuyển động; cửa "tới nơi" khi contact đổi.
- Không tới vị trí trong 10 s → dừng, ghi lỗi input tại chỗ. Khi thử trên Wokwi phải tự gạt switch contact trong 10 s sau khi LED motor sáng.
- Khóa = cửa đóng, đứng yên và không panic. Đây là mô hình mô phỏng, không phải bộ điều khiển an toàn đã chứng nhận.

## DEC-020 — Lệnh gắn phiên thiết bị, không cần NTP ở edge

- Ngày 13/10/2026; đã kiểm thử integration. Edge không có đồng hồ thật, nên không tự kiểm `expires_at`. Lệnh mang `boot_id`/`session_id` và `expected_revision` của telemetry live mới nhất; edge chỉ chạy lệnh đúng phiên hiện tại (khác phiên → `COMMAND_EXPIRED`) và đúng revision (khác → `REVISION_MISMATCH`). Reboot/reconnect tạo phiên mới nên lệnh cũ không chạy.
- Backend: TTL 10 s + 2 s chờ ack; chỉ tạo lệnh khi thiết bị có phiên live ≤ 10 s; ack chỉ tính khi đúng thiết bị, cửa, phiên; một trạng thái cuối, ack muộn lưu `late_ack`. Edge nhớ 8 ID gần nhất để ack lại mà không chạy lại.
- Hệ quả: cửa đổi trạng thái giữa lúc xem và lúc gửi thì lệnh bị từ chối, người dùng xem lại rồi gửi lại.

## DEC-021 — Output mô phỏng

- Ngày 13/10/2026; đã triển khai. Khẩn cấp = panic hoặc nghi người mắc kẹt. Đèn: khẩn cấp hoặc cửa mở ≥ 30 s. Còi: khẩn cấp hoặc cửa mở > 60 s. Sưởi: khẩn cấp (giả định bảo vệ người trong kho lạnh). Quạt lạnh: tắt khi khẩn cấp.
- Chỉ là LED trong Wokwi; quy tắc thật cần chuyên gia an toàn kho lạnh duyệt.

## DEC-022 — Cảnh báo do edge quyết định timer, backend lưu vòng đời

- Ngày 13/10/2026; đã kiểm thử integration. Timer cửa/người mắc kẹt chạy ở edge nên vẫn chạy khi mất mạng; backend không tự đếm giờ, chỉ phản ánh `alarms` theo telemetry (2 s/lần), nên thời điểm resolve trên UI trễ tối đa một chu kỳ.
- Một dòng cho mỗi khu|cửa|mã; tăng mức cùng dòng và xóa tiếp nhận; tiếp nhận chỉ ghi audit; hết điều kiện thì resolved; lặp trong 60 s thì mở lại cùng dòng, tăng `occurrences`. Nhiệt độ trễ 0,5 °C. Thiết bị offline không resolve các cảnh báo khác của nó vì không biết điều kiện.

## DEC-023 — API thay đổi trạng thái trước khi có đăng nhập

- Ngày 13/10/2026; **đã thay bởi DEC-026/DEC-027** (giữ Origin/JSON, thêm phiên đăng nhập; người thực hiện là tên tài khoản). Backend chỉ nghe 127.0.0.1; POST chỉ nhận Origin `http://127.0.0.1|localhost:5173` (dev) hoặc `:4173` (preview), `Content-Type: application/json`, body ≤ 256 byte; thiếu Origin cũng bị từ chối. Người thực hiện ghi là `dashboard-local`.
- Hệ quả: mọi người dùng trên máy đều gửi được lệnh; audit chưa biết tên người.

## DEC-024 — TLS bằng CA demo riêng

- Ngày 13/10/2026; đã triển khai, `infra:tls:check` đạt; firmware TLS chưa chạy Wokwi. CA tự ký của dự án trong `.local/tls` (ngoài Git), không dùng CA công cộng hay `setInsecure()`. Broker TLS ở 127.0.0.1:18885, SAN `localhost`, `host.wokwi.internal`, `127.0.0.1`; 18884 thường giữ cho tương thích, vẫn chỉ localhost.
- Hệ quả: máy khác hoặc trình duyệt không tin CA này; CA chỉ dùng cho demo. Chứng chỉ broker 397 ngày cần tạo lại khi hết hạn. ESP32 không có NTP nên kiểm ngày chứng chỉ trên Wokwi còn phải xác nhận.

## DEC-025 — Phiên MQTT bền cho backend, sạch cho thiết bị

- Ngày 13/10/2026; đã kiểm thử integration (`recovery:check`). Backend dùng client ID cố định theo cổng và `clean: false`, nên event/ack/telemetry QoS 1 gửi khi backend tắt hoặc DB lỗi được broker giữ (tối đa 1000 message, 1 ngày) rồi giao lại; chống trùng ở DB như cũ. Thiết bị dùng clean session để lệnh của phiên cũ không bao giờ chạy lại (DEC-020).
- Hàng đợi edge có giới hạn (event 32, ack 4); vượt thì mất nhưng `seq` vẫn tăng nên backend ghi gap. Hai backend cùng cổng sẽ tranh client ID, đúng ý vì cổng cũng không chia được.

## DEC-026 — Phiên đăng nhập bằng cookie trên localhost

- Ngày 13/10/2026; đã triển khai. Cookie `kg_session` HttpOnly, SameSite=Strict, 8 giờ, token 32 byte ngẫu nhiên, DB lưu SHA-256. Chưa đặt `Secure` vì dashboard chạy http://127.0.0.1; nếu đưa ra mạng phải có HTTPS và thêm `Secure`. POST vẫn cần Origin dashboard + JSON (giữ từ DEC-023). Sai 5 lần khóa tên 60 s, chỉ trong bộ nhớ backend.
- Mật khẩu demo sinh ngẫu nhiên trong `.local/dashboard-users.json`, DB lưu scrypt. Hệ quả: khởi động lại backend xóa bộ đếm khóa; phiên vẫn còn hiệu lực vì lưu DB.

## DEC-027 — Vai trò viewer/operator/admin

- Ngày 13/10/2026; đã triển khai. viewer: đọc snapshot/telemetry/events/giữ chỗ. operator: thêm lệnh cửa, tiếp nhận cảnh báo, giữ chỗ/xác nhận/hủy, xem nhật ký ra vào. admin: thêm audit đăng nhập. Kiểm ở backend; UI chỉ khóa nút. Người thực hiện trong audit lấy từ phiên, không từ body (thay `dashboard-local` của DEC-023).
- Chưa có màn hình quản lý tài khoản; thêm/đổi tài khoản qua file local + `auth:setup`.

## DEC-028 — Ca làm việc chỉ để audit

- Ngày 13/10/2026; đã triển khai. Ca ngày `[06:00, 18:00)`, ca đêm `[18:00, 06:00)` giờ Việt Nam (UTC+7, không DST); ca đêm thuộc ngày bắt đầu. Đánh giá theo giờ backend nhận event (edge chưa có NTP). Kết quả `access_audit` (đúng ca/ngoài ca/thẻ thu hồi/…) chỉ là ghi nhận an ninh: không đổi quyết định cho vào của edge, không chặn ra, không đổi số người hay liên động.
- Danh sách thẻ tại thiết bị và thẻ trong DB là hai nơi; thẻ thu hồi trong DB mà edge vẫn cho vào sẽ hiện "Thẻ đã thu hồi" để người vận hành cập nhật thiết bị.

## DEC-029 — Quy tắc nhận hàng và giữ chỗ

- Ngày 13/10/2026; đã kiểm thử integration (`reservations:check`). Ngưỡng tính cho kho lưu trữ A–C: `(đang chứa + đang giữ + 1) × 100 > 95 × vị trí khả dụng` thì từ chối; từ 85% cảnh báo. Vị trí xả đá không khả dụng. 5% còn lại chính là buffer, không trừ thêm lần nữa. Khu đệm D là cổng riêng: ≥ 95% thì dừng nhận dù kho còn chỗ; khu đệm không nhận hàng lưu trữ.
- Một yêu cầu = một pallet = một vị trí; chọn vị trí vừa nhất. Giữ chỗ 15 phút theo đồng hồ backend; hết hạn được ghi trong transaction kế tiếp (lazy) và không tính vào snapshot. Transaction khóa dòng kho trước rồi vị trí; unique `active_slot` chặn giữ trùng ở mức DB. `request_id` do client sinh để gửi lại an toàn.
- Hệ quả: mọi giữ chỗ đi tuần tự qua một khóa — đủ cho demo một kho, không nhằm tải lớn. Chưa có xuất kho; số liệu chứa hàng là demo seed.

## DEC-030 — Báo cáo lịch sử và CSV

- Ngày 13/10/2026; đã triển khai, `reports:check` đạt. Năm loại báo cáo đọc từ bảng đã lưu, không tổng hợp sẵn; cửa sổ tối đa 31 ngày, 500 dòng/trang, cursor theo id giảm dần để trang ổn định khi có dữ liệu mới. Nhật ký ra vào giữ quyền `access_audit` (DEC-027).
- CSV tạo ở trình duyệt từ đúng dữ liệu đang lọc, tối đa 5.000 dòng; UTF-8 BOM để Excel đọc tiếng Việt; chặn công thức bằng tiền tố `'` cho ô chữ bắt đầu `= + - @ TAB CR` (theo OWASP CSV Injection), số giữ kiểu số. Cột theo danh sách cố định nên không thể xuất hash/token.
- Hệ quả: xuất lớn hơn 5.000 dòng cần lọc hẹp hơn; chưa có xuất phía server.

## DEC-031 — Mô phỏng toàn kho và cách đo tải

- Ngày 13/10/2026; đã triển khai, `demo:scenarios` và `load:test` đạt. Bộ mô phỏng dùng seed và đồng hồ ảo để chạy lại giống nhau; mỗi thiết bị dùng tài khoản MQTT của chính nó, không dùng tài khoản backend để giả thiết bị.
- ESP-C01 giả lập (FakeEdge) chỉ dùng khi Wokwi tắt và chỉ để chạy tự động bốn kịch bản; nó làm lại quy tắc M09 dạng rút gọn nên **không thay** nghiệm thu firmware.
- 50 node = 50 nguồn ảo dồn qua 5 tài khoản đã đăng ký, vì registry/ACL chỉ có 5 thiết bị và thêm 45 tài khoản chỉ để đo sẽ đổi cấu hình bảo mật. Ingest đo theo `received_at` trong DB; publish → hiển thị đo bằng marker nhiệt độ trên WebSocket (lấy mẫu vì snapshot đẩy mỗi 1 s). Mục tiêu P95 ≤ 2 s giữ nguyên như đã đề xuất.
- Không dừng broker/MySQL thật để thử lỗi; lỗi kết nối được tạo bằng proxy riêng của client test (như M04/M05).

## DEC-032 — Sơ đồ và hướng dẫn cấu hình

- Ngày 13/10/2026. Sơ đồ là HTML tự chứa với SVG inline theo quy tắc của skill diagram-design (tối đa 9 node, 12 đường nối, đường vuông góc, nhãn có khoảng hở, 1–2 điểm nhấn). Bảng màu lấy từ `src/styles.css` (chữ `#28353c`, phụ `#65717a`, nhấn `#176d60`), font hệ thống Segoe UI/Consolas để mở offline và hiển thị đủ dấu tiếng Việt, không tải Google Fonts.
- Hướng dẫn cấu hình đặt ở `docs/HUONG_DAN_CAU_HINH.md`, dựa trên script hiện có; README các thư mục giữ chi tiết kỹ thuật.

Mỗi quyết định mới thêm DEC-xxx với ngày, trạng thái, lý do và hệ quả. Khi thay đổi, thêm mục mới tham chiếu mục bị thay thế; giữ lịch sử. Chỉ ghi “đã triển khai” khi có công việc/test tương ứng trong `QUA_TRINH.md`.
## DEC-033 — Nạp ZIP và kiểm chứng tại máy Windows

- Ngày 13/10/2026; đã thực hiện theo yêu cầu chạy/kiểm tra `khoguard-iot-M06-M16.zip`. Giữ MySQL, lịch sử và cấu hình cục bộ; áp dụng migration thêm bảng có kiểm ownership/checksum. Bản trước đã sao lưu riêng trong `.local`.
- Bằng chứng trong ZIP và kết quả Windows được ghi riêng. FakeEdge không thay nghiệm thu Wokwi, M16 còn các tình huống an toàn/mất broker cần thử trực tiếp.
- Test TLS nhận đúng marker live, observer theo schema hiện tại, nguồn cửa theo owner từng cửa. Hai test hồi quy mới và kiểm TLS thật đã đạt.
- [Kết quả chi tiết](docs/evidence/CHECK-WINDOWS-2026-10-13.md). Giữ giới hạn DEC-020; không mở broker ra LAN hoặc kết nối profile MQTTX bên ngoài đang có.

## DEC-034 — Nghiệm thu Wokwi bán tự động, không FakeEdge

- Ngày 13/10/2026; đã thực hiện. Phần còn lại của M07, M08, M10–M12, M16 chỉ tính khi chạy trên **firmware thật** trong Wokwi. `npm run wokwi:acceptance` tự động hóa phần không cần tay người; công tắc vẫn do người gạt, mỗi bước chỉ đạt khi telemetry/Serial xác nhận.
- RFID gửi qua Serial RFC2217 của Wokwi (`rfc2217ServerPort = { port = 4000, host = "127.0.0.1" }`); đã đọc mã extension 4.0.0 để chắc object được truyền vào `net.Server.listen`, nên chỉ bind loopback.
- T08 dừng **chỉ** Mosquitto chạy với `.local\mosquitto\mosquitto.conf` (đúng 1 tiến trình, kiểm theo command line), rồi bật lại tách nền. Không đụng service 1883 hay MySQL.
- Firmware in `OUTPUTS ms=… lock=… motor07=… motor08=… light=… buzzer=… heater=… fan=…` mỗi khi output đổi: khi broker dừng, telemetry không gửi được nên Serial là bằng chứng duy nhất output an toàn đã áp dụng tại chỗ; `ms` là đồng hồ thiết bị để đo timer chính xác.
- T23 gửi lệnh thẳng tới thiết bị bằng tài khoản backend (tài khoản duy nhất được ghi `commands`) để thử ID trùng và phiên cũ; lệnh thử không có dòng DB, kết quả đọc từ Serial.
- [Kết quả](docs/evidence/WOKWI-2026-10-13.md).

## DEC-035 — Telemetry tồn đọng của phiên hiện hành được lưu làm lịch sử

- Ngày 13/10/2026; người dùng chọn, đã triển khai. Sau lỗi ghi DB hoặc backend khởi động lại, phiên đã xác nhận trong bộ nhớ bị xóa; broker giao lại khung tồn đọng trước `status: online` retained. Trước đây các khung này bị `unconfirmed`, được PUBACK và mất.
- Nay `telemetryDecision` trả `backlog` khi khung cùng boot/session với `device_current` (không retained, không retired, seq/uptime/revision không lùi, đồng hồ hợp lệ): chỉ INSERT bảng `telemetry`. Không đổi `device_current`, cảnh báo, freshness hay revision kho; chỉ `status: online` của kết nối hiện tại mới làm thiết bị sống lại (giữ quy tắc DEC-005/DEC-015).
- Phương án loại: giữ nguyên và chỉ ghi gap (vẫn mất số liệu); chấp nhận như `accepted` (khung cũ sẽ làm thiết bị trông `fresh` theo thời điểm nhận).
- [Bằng chứng](docs/evidence/M16-PART2-2026-10-13.md).

## DEC-036 — Không PUBACK gói thuộc kết nối MQTT đã đóng

- Ngày 13/10/2026; đã triển khai sau khi `writefault:check` mất khung 5–6. Gói còn trong bộ đệm socket cũ phải trả lỗi `STALE_CONNECTION` cho MQTT.js: `done()` không lỗi khiến MQTT.js xếp PUBACK offline và gửi khi nối lại, broker bỏ tin chưa lưu. Không hủy stream trong nhánh này vì stream hiện tại có thể đã là kết nối mới.
- Hệ quả chấp nhận: lỗi ghi một thiết bị chặn ingest mọi thiết bị cho tới khi DB ghi lại được (đúng "không ACK khi chưa lưu", DEC-025).

## DEC-037 — Kiểm thử phần 2 M16

- `reservations:check` thêm nhóm khu đệm đầy (T17): đánh dấu tạm slot khu đệm `occupied` với `occupancy_source='reservation'` và trả lại đúng các slot đó; không dùng giữ chỗ vì giữ chỗ không bao giờ vào khu đệm.
- `writefault:check` (T24): lỗi ghi thật bằng khóa dòng `device_current` từ kết nối runtime thứ hai, không dừng MySQL, không làm đầy đĩa. "DB đầy" theo dung lượng chưa thử.
- T26 đo bằng trình duyệt tích hợp và JS (tràn ngang, viền focus, nhãn), chưa thành test tự động trong repo (chưa thêm Playwright).
- `demo:warehouse` tự nối lại khi broker dừng: mỗi lần gửi có giới hạn 5 s, nối lại cùng boot, session mới như thiết bị thật.

## DEC-038 — Hồi quy sau Claude và giới hạn nghiệm thu

- Ngày 13/10/2026. Giữ hai sửa mất dữ liệu DEC-035/036; kiểm tra lại bằng toàn bộ runner, gồm bài lỗi ghi MySQL mới. Readiness phải có assertion thất bại trong lúc không ghi được, không chỉ in số lần probe.
- Probe MQTT chỉ nhận marker live đúng lượt, loại retained/traffic khác; có test hồi quy chứng minh receiver cũ sai. Không nới ACL/schema để làm bài test đạt.
- `verify:all` bỏ qua C++ nếu PATH Windows thiếu g++; hai bộ được chạy riêng bằng WSL và ghi bằng chứng riêng. WebSocket latency không được gọi là DOM latency; test C++/Node không được đổi tên thành nghiệm thu Wokwi.
- Collection Postman chia phần xem dữ liệu và phần vận hành; password trống trong file. Bản source sạch chỉ cài/test/build web, không mang secret/firmware nhúng secret sang gói bàn giao. [Báo cáo](docs/evidence/REVIEW-CLAUDE-2026-10-13.md).

## DEC-039 — Fault injection Wokwi nằm trong firmware kiểm thử riêng

- Ngày 13/10/2026. T06/reboot/T20 chạy trên ESP32 Wokwi với `controller.h` nguyên byte. Adapter riêng tạo input unknown, presence HIGH lúc reboot, pause telemetry; không thêm cổng điều khiển thử vào firmware demo.
- CA sai dùng CA thử khác; hostname sai dùng cùng endpoint và CA đúng nhưng hostname xác minh khác qua API WiFiClientSecure. Không đổi certificate/broker hay bỏ xác minh TLS. Workspace test có bin bên trong phạm vi watcher; chỉ chạy một Simulator trên Serial 4000.
- Script tự phục hồi bin/ELF ban đầu, kiểm tra SHA-256 và 5 thiết bị fresh; credential và ảnh firmware chỉ nằm trong `.local`. [9 nhóm đạt](docs/evidence/WOKWI-REMAINING-2026-10-13.md).

## DEC-040 — Từ chối nghiệp vụ không được xóa phiên MQTT toàn kho

- Ca stale phát hiện `DEVICE_NOT_LIVE` trong transaction gây rollback/destroy/reset như lỗi MySQL. Chuyển quyết định từ chối thành null trong transaction đọc; trả lỗi 409 sau commit. Các phiên không bị tác động, dữ liệu mới phục hồi bình thường.
- Lỗi DB thật vẫn rollback, destroy và xóa xác nhận phiên. Test hồi quy RED → GREEN, 109 unit và write-fault thật đạt; không sửa quy tắc backlog thành live để che lỗi.

## DEC-041 — Mật khẩu demo thống nhất 1234

- Ngày 13/10/2026; người dùng yêu cầu, đã áp dụng trên máy này. Đặt `1234` cho 3 tài khoản dashboard, 7 tài khoản MQTT (backend, observer, 5 thiết bị) và 2 tài khoản MySQL của dự án (`khoguard_runtime`, `khoguard_migrate`), để gõ nhanh khi demo. Thay một phần DEC-009 (mật khẩu ngẫu nhiên) và DEC-026 (dashboard ≥ 12 ký tự).
- Kiểm tra định dạng đổi từ "48 ký tự hex" / "≥ 12 ký tự" thành `SECRET_PATTERN` = 4–128 chữ/số (`server/config.mjs`). Vẫn chỉ chữ/số vì mật khẩu được ghi vào `kg_secrets.h` (C++) và câu SQL; test chống chèn C++/SQL giữ nguyên.
- MySQL: mỗi tài khoản dự án tự `ALTER USER CURRENT_USER()` bằng mật khẩu cũ, không dùng tài khoản admin (`mysql-admin.env` để trống). **Không** đổi tài khoản admin MySQL hay service Mosquitto 1883 vì dùng chung với ứng dụng khác (DEC-007).
- Cài mới vẫn sinh mật khẩu ngẫu nhiên; `1234` chỉ là giá trị đang dùng trong `.local` của máy demo. Hệ quả: ai trên máy này đọc được tài liệu là đăng nhập được broker/DB/dashboard; chấp nhận vì mọi dịch vụ chỉ nghe 127.0.0.1. Đưa ra mạng phải đổi lại mật khẩu dài ngẫu nhiên.

## DEC-042 — Mô phỏng khu A/B/D sinh động

- Ngày 13/10/2026; người dùng yêu cầu, đã chạy thật với backend. `demo:warehouse` mặc định cho SIM-A01, SIM-B01, SIM-D01 tự đóng mở cửa (mỗi lượt 2 s có 2 % mở; 10 % lượt mở kéo dài 35–75 s), số người đổi từng người một (0–4), và sự cố nhiệt định kỳ: kho B lên 9,5 °C (từ giây 60, lặp mỗi 5 phút), kho A lên 31,5 °C (từ giây 180, lặp mỗi 7 phút), giữ 20 s rồi hạ về dưới ngưỡng 1 °C.
- Thiết bị mô phỏng tự tính báo động cửa mở (≥ 30 s cảnh báo, > 60 s nghiêm trọng) giống `controller.h`, gửi trong `alarms`; backend chỉ phản ánh như với ESP-C01 (DEC-022). Cảnh báo nhiệt do backend tính theo ngưỡng khu như cũ. Cửa đổi trạng thái gửi thêm event `door`.
- Logic nằm trong `scripts/sim-behaviour.mjs` (hàm thuần, PRNG theo seed, đồng hồ ảo) để test được; `--steady` giữ hành vi tĩnh cũ. SIM-C02 (D09) và ESP-C01 không đổi để không lẫn với demo an toàn khu C.
- Hệ quả: trong lúc demo sẽ có cảnh báo A/B/D tự bật/tắt. Đó là dữ liệu mô phỏng, không phải lỗi.

## DEC-043 — Nút khu ESP32 trên Wokwi cho khu A, B, D

- Ngày 14/10/2026; người dùng chọn làm cả 3 khu. Thêm firmware "nút khu" (`firmware/lib/khoguard_zone`, `src/zone_main.cpp`), build 3 bản theo env PlatformIO và 3 project Wokwi `firmware/wokwi/zone-a|b|d`. Mỗi bản chỉ chứa mật khẩu MQTT của khu đó. Script Node mặc định chỉ còn chạy cửa D09 (SIM-C02).
- Giữ nguyên mã thiết bị `SIM-A01/B01/D01` vì tài khoản MQTT, ACL và lịch sử MySQL đều gắn với chúng; chỉ đổi `source` sang `wokwi` trong `contracts/devices.json` và bằng migration `007_device_sources`. Checksum seed (`seed_registry_v1`) vẫn tính trên registry lúc seed: `db/migrate.mjs` hoàn lại đúng thay đổi của 007 trước khi băm; có test khóa giá trị checksum.
- Quyền gửi lệnh tách khỏi nguồn: chỉ thiết bị có `door_control` (ESP-C01) nhận lệnh cửa; trước đây điều kiện là `source = wokwi`.
- Nút khu không có khóa/rèm quang/panic nên báo `null`, không báo "thông". Cảnh báo cửa mở do nút khu tự tính (giống DEC-022); số người dùng nút Vào/Ra, chưa xác minh sau khi bật cho tới khi hiện diện LOW (giống DEC-017).
- Phương án dự phòng: `demo:warehouse --with-fake-zones` (hoặc `run.bat web`/`fake`) giả lập 3 khu bằng Node ở chế độ sinh động DEC-042, nhưng giao diện vẫn ghi Wokwi; phải nói rõ khi demo.
- Sự cố khi áp dụng: lần chạy đầu migration 007 lỗi vì dòng chú thích có dấu `;` mà trình chạy migration cắt câu theo `;`. Câu UPDATE chưa chạy; đã kiểm tra bảng `devices` không đổi, xóa đúng dòng nhật ký 007 trạng thái `applying` rồi chạy lại thành công. Chú thích trong file migration không được chứa `;`.

## DEC-044 — Linh kiện Wokwi thay công tắc (đợt 1)

- Ngày 22/10/2026; người dùng chọn đợt 1. Wokwi đã có đầu đọc **MFRC522** (`board-mfrc522`), nên phần "Wokwi không có RC522" của DEC-016 không còn đúng. Khu C: MFRC522 ở cửa D07 kèm công tắc chọn chiều, PIR thay công tắc hiện diện, nút nhấn đỏ thay công tắc panic, 2 servo thay 4 LED motor, 2 relay khóa (đèn xanh là tải), buzzer 2 kHz thay LED còi. Khu A/B/D: PIR thay công tắc hiện diện, thêm LCD1602 I2C.
- **Giữ công tắc** cho contact (Wokwi không có cảm biến từ, và vị trí cửa phải được đo độc lập với motor: servo chỉ để nhìn) và rèm quang (đợt 2 sẽ thử HC-SR04).
- Chân: SPI mặc định trùng input nên MFRC522 dùng GPIO matrix (SCK 2, MOSI 13, MISO 34, SS 12), RST nối 3V3; GPIO12 là chân strapping, chỉ chấp nhận được trong mô phỏng. Panic dùng `INPUT_PULLDOWN` nên nhấn vẫn đọc HIGH, `controller.h` không đổi. Thẻ mẫu Wokwi Blue/Green/Red ánh xạ DEMO-017/018/999; thẻ khác báo `UID-<hex>` và bị từ chối. Dòng Serial RFID vẫn nhận để script nghiệm thu chạy được.
- Hệ quả: **PIR chỉ bắt chuyển động** (giữ HIGH 10 s sau mỗi lần), yếu hơn mmWave; bài mắc kẹt > 5 phút phải bấm lặp Simulate Motion hoặc tạm tăng `delayTime`. Bằng chứng Wokwi cũ làm với công tắc; phải nghiệm thu lại với mạch mới. Firmware build cả 4 bản, test C++ và JS đạt; **chưa chạy trên Wokwi** lúc ghi mục này.

## DEC-045 — Rèm quang bằng HC-SR04 (đợt 2)

- Ngày 22/10/2026; tiếp DEC-044. Hai công tắc rèm quang của khu C thành 2 cảm biến siêu âm HC-SR04: vật gần hơn 100 cm trong khung cửa = bị che; không có echo mới trong 250 ms cũng coi là bị che (an toàn khi hỏng). `controller.h` không đổi, chỉ nhận "thông/bị che" như trước.
- Board ESP32 DevKit V1 của Wokwi đã hết chân xuất (chỉ còn VP/VN là chân đọc), mà HC-SR04 cần TRIG. Vì `fan = !emergency` và `heater = emergency` trong `controller.h`, quạt luôn ngược sưởi nên một relay chuyển mạch lái cả hai (NO = đèn sưởi, NC = đèn quạt); GPIO5 cũ của quạt thành TRIG chung cho 2 cảm biến. ECHO dùng đúng chân cũ của công tắc rèm quang (17, 21) và đo bằng ngắt, nên vòng lặp an toàn không chờ echo.
- Không thêm LCD cho khu C vì không còn chân I2C; Serial và dashboard vẫn đủ. Phương án loại: đổi sang board ESP32 khác nhiều chân hơn (phải đổi toàn bộ tên chân trong mạch và test).
- Hệ quả: nếu sau này quạt và sưởi cần bật độc lập thì phải tách lại relay và tìm chân khác. Build, test JS và C++ đạt; chưa chạy trên Wokwi.

## DEC-046 — ThingsBoard Cloud là dashboard giám sát bổ sung

- Ngày 24/10/2026. Người dùng yêu cầu thêm ThingsBoard, giữ website KhoGuard và MySQL; sau lỗi Docker đã chọn Cloud.
- Bridge đọc snapshot bằng viewer, ánh xạ theo registry và gửi qua MQTT/TLS 8883. Dùng một Cloud device `KhoGuard-WH01` chứa các trường có tiền tố theo nguồn để không cần gateway cộng 5 Cloud device. Không nhận RPC, không can thiệp firmware/lệnh cửa.
- MySQL vẫn giữ nghiệp vụ và lịch sử chính. Phép đo giữ thời điểm nhận gốc, null/stale không chuyển thành 0; nguồn mất kết nối được hiển thị riêng. REST chỉ dùng HTTPS tại hai vùng Cloud chính thức, không theo redirect mang API key.
- API key chỉ dùng setup/check; device token dùng bridge, đều lưu ở `.local`. Người dùng đã đăng ký và cung cấp API key; đã tạo device/dashboard và xác nhận Cloud readback, mất nguồn backend/phục hồi. Key đã xuất hiện trong chat nên khuyến nghị thu hồi sau setup/check, không tự thu hồi thay người dùng.
- Nghiệm thu thực tế: dùng hostname MQTT riêng `mqtt.thingsboard.cloud` / `mqtt.eu.thingsboard.cloud`; chia bản tin tối đa 50 trường vì gói toàn kho 103 trường bị Cloud từ chối. Giữ timestamp, TLS và QoS1; 131 unit đạt. Chưa xác nhận UI trên điện thoại và biểu đồ môi trường mới khi Wokwi chưa chạy.
- Hạn chế: cần Internet, quota Cloud theo gói; bridge chu kỳ 10 giây là bản sao giám sát, không thay hệ thống an toàn hay lịch sử MySQL. [Hướng dẫn](docs/THINGSBOARD.md).


## DEC-047 Rút gọn một khu C ngày 24/10/2026

Theo yêu cầu người dùng, cấu hình hoạt động chỉ gồm WH01/C/ESP-C01/D07–D08. Giữ hai cửa để tiếp tục minh họa liên động, Panic và vật cản. React và ThingsBoard dùng cùng registry; Cloud còn 3 widget.

Seed đầu tiên đóng băng ở db/seeds/registry-v1.json để giữ checksum, khóa ngoại và lịch sử MySQL. Không sửa migration 001–007 hay xóa hàng lịch sử. API snapshot, sự kiện, access audit, báo cáo và giữ chỗ giới hạn khu C. Các danh tính cũ không được nhận telemetry/lệnh trong phạm vi hoạt động và mất ACL grant. Kho C chỉ nhận frozen, không còn staging D.

Loại firmware A/B/D, script mô phỏng nhiều khu và thư viện LCD khỏi build hoạt động. Lưu bản trước thay đổi ở .local/single-zone-backup-20261024. Dùng đúng tên PIR/siêu âm và thêm 5 điện trở 220 ohm. Sơ đồ Wokwi chỉ mô phỏng số, không chứng nhận nối ECHO 5 V trực tiếp vào ESP32 ngoài thực tế. Word/PPT mô tả code đang có, không trình bày các đề xuất Reset/MQ-2/mmWave như đã triển khai.

## DEC-048 — Dùng template HUIT cho PowerPoint

Ngày 25/10/2026. Theo yêu cầu người dùng, dùng `docs/slides/2-template-bvkltn-khoa12-2024.pptx` làm mẫu bố cục, giữ logo, thanh đầu trang, chân trang và hệ thống trang chia chương; thay nội dung ví dụ bằng nội dung KhoGuard theo roster 33 trang đã được duyệt. Dùng quy trình Edit Native PPTX của `hugohe3/ppt-master`. Không sửa bản template gốc. PPTX sinh ra là đầu ra; outline giữ nội dung chuẩn. Build trung gian và bản dựng bảo toàn layout nằm trong `.local/ppt-master-projects/khoguard-huit-template/`.

## DEC-049 — Python dùng cho bài lab, backend vẫn dùng Node.js

Ngày 26/10/2026. Tài liệu Phần 2 mục 2.7 có ví dụ Python cho lọc ô theo vùng nhiệt độ/tải trọng/thể tích, ngưỡng kho 95% và giữ chỗ 15 phút. Thêm ví dụ chạy độc lập trong `labs/python/` để đáp ứng nội dung lab. Không gọi Python từ backend: nghiệp vụ live đã chạy bằng JavaScript/MySQL transaction, nên không tạo hai bộ quy tắc vận hành. Bài lab chỉ dùng thư viện chuẩn Python 3.10+.
