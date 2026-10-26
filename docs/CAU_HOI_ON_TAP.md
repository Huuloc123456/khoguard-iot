# Câu hỏi ôn tập phản biện — KhoGuard

> **Cảnh báo phiên bản:** phần hỏi đáp dưới đây được viết cho cấu hình nhiều khu ngày 13/10/2026. Các ví dụ SIM-A/B/C/D, 12 cửa, mmWave và rèm quang không thuộc cấu hình đang demo. Dùng [kịch bản thuyết trình hiện hành](KICH_BAN_THUYET_TRINH.md), [kịch bản demo](HUONG_DAN_DEMO.md) và trạng thái nghiệm thu ở đầu [checklist](CHECKLIST_DEMO.md) để trả lời về bản một khu ngày 25/10/2026.

Dùng để tham khảo câu hỏi nền; mỗi câu có gợi ý trả lời và nguồn của cấu hình cũ. Không lấy số liệu hay ví dụ cũ làm kết quả nghiệm thu hiện hành.

## Nguyên tắc trả lời

1. **Trả lời thẳng ý chính trước**, giải thích sau. Ví dụ: "Dạ, không ạ. Vì…".
2. **Không nói quá bằng chứng.** Cái gì mô phỏng thì nói mô phỏng; cái gì chưa đo thì nói chưa đo. Giảng viên thường đánh giá cao việc nhóm biết rõ giới hạn.
3. Gặp câu không chắc: "Phần này nhóm chưa kiểm chứng, nhóm hiểu là … và sẽ bổ sung." Không bịa số.
4. Khi có thể, **chỉ vào bằng chứng**: mở file code, log Serial, ảnh trong `docs/evidence/`.
5. Mức độ: ⭐ dễ gặp · ⭐⭐ hay hỏi sâu · ⭐⭐⭐ câu "bẫy"/khó.

---

## A. Tổng quan, phạm vi đề tài

**A1 ⭐ Đề tài giải quyết vấn đề gì? Điểm mới so với một hệ giám sát kho thông thường?**
> Gom thông tin cửa, môi trường, số người, sức chứa về một nơi, và trọng tâm là **an toàn người trong kho lạnh**. Điểm nhóm nhấn mạnh: quyết định an toàn nằm **tại thiết bị** (edge), "chưa biết" luôn bị coi là "không an toàn", và lệnh từ xa chỉ là **yêu cầu** để thiết bị tự kiểm tra lại.

**A2 ⭐ Hệ thống có bao nhiêu thiết bị thật?**
> Không có phần cứng thật. Có **5 danh tính thiết bị**: ESP-C01 là firmware ESP32 thật chạy trên **Wokwi** (điều khiển D07, D08); SIM-A01, SIM-B01, SIM-C02, SIM-D01 là script Node. Mỗi thiết bị có tài khoản MQTT riêng. — Nguồn: `contracts/devices.json`.

**A3 ⭐⭐ Tại sao chỉ một ESP32 mà không làm cả 12 cửa bằng ESP32?**
> Phần đáng kiểm chứng bằng firmware là **an toàn kho lạnh** (khu C). Các khu khác chỉ cần dữ liệu để chứng minh luồng toàn kho, script Node đủ và chạy lại được giống nhau. Mỗi nguồn đều ghi rõ là Wokwi hay script trên giao diện để không lẫn.

**A4 ⭐⭐ Mô phỏng thì kết quả có ý nghĩa gì với thực tế?**
> Chứng minh được **logic và luồng xử lý**: quy tắc an toàn, giao thức, xử lý mất mạng, lưu trữ, phân quyền. **Không** chứng minh được độ chính xác cảm biến (mmWave có phát hiện người bất động không), độ bền cơ khí hay chứng nhận an toàn. Nhóm ghi rõ điều này ở slide 26.

**A5 ⭐ Nhóm dùng Wokwi thay vì phần cứng vì sao?**
> Theo yêu cầu đồ án và để chạy lại được bất kỳ lúc nào, gạt công tắc tạo đúng tình huống nguy hiểm (panic, che rèm, người mắc kẹt) mà không cần thiết bị thật. Firmware là **mã ESP32 thật**, build bằng PlatformIO, không phải giả lập bằng JavaScript. — DEC-002.

---

## B. Phần cứng và firmware ESP32

**B1 ⭐ ESP32 đọc những tín hiệu nào, chân nào?**
> 7 đầu vào: mỗi cửa có contact (công tắc), beam (cảm biến siêu âm HC-SR04, có vật < 100 cm = bị che), panic (nút đỏ) — D07: 16, 17, 18; D08: 19, 21, 22 — và cảm biến PIR hiện diện dùng chung (23). DHT22 ở chân 15; đầu đọc RFID MFRC522 qua SPI (2, 13, 34, 12) kèm công tắc chọn chiều (35). Đầu ra: 2 relay khóa, 2 servo cánh cửa, buzzer, LED đèn, và 1 relay chuyển giữa đèn sưởi/quạt (quạt luôn ngược sưởi, nên dồn được để lấy chân cho HC-SR04). Test `tests/diagram.test.js` kiểm chân trong mạch Wokwi khớp firmware. — Nguồn: `firmware/include/config.h`.

**B2 ⭐⭐ Chống dội (debounce) thế nào? Tại sao cần?**
> Mỗi đầu vào phải **giữ nguyên 30 ms** mới được chấp nhận. Trước lần ổn định đầu tiên, đầu vào ở trạng thái **unknown**, và unknown thì chặn đóng. Cần vì công tắc/cảm biến có nhiễu; nếu không chống dội, một xung nhiễu có thể làm tăng revision liên tục hoặc báo sai cửa mở/đóng. — `controller.h`, struct `Input`.

**B3 ⭐⭐ Firmware tổ chức thế nào? Tại sao tách `controller.h`?**
> - `include/controller.h`: **toàn bộ quy tắc an toàn**, C++ thuần, không dùng Arduino → **test được trên PC bằng g++** (hai bộ test C++).
> - `lib/khoguard/src`: adapter chia module — board (chân), edge (một nhịp an toàn), rfid, events, commands, messages (JSON), network (WiFi/MQTT/TLS).
> - `src/main.cpp`: chỉ gọi thư viện trong `setup()`/`loop()`.
> Tách để quy tắc an toàn **không phụ thuộc phần cứng hay mạng**, test độc lập, và thay mạng/MQTT không đụng tới quy tắc.

**B4 ⭐⭐⭐ Nếu MQTT bị treo (chờ PUBACK) thì vòng an toàn có bị chậm không?**
> Không. Có **hai luồng FreeRTOS**: `loop()` chạy vòng an toàn mỗi ~10 ms; MQTT chạy trong **task riêng** (`networkTask`). QoS1 chờ PUBACK chỉ chặn task mạng. Hai luồng dùng chung trạng thái `Controller` qua **critical section** (`portENTER_CRITICAL`) và một **hàng đợi FreeRTOS** 32 sự kiện. Đã thử dừng broker: đầu ra vẫn đổi đúng, chứng minh bằng log `OUTPUTS` trên Serial.

**B5 ⭐⭐ RFID mô phỏng thế nào? Đọc lặp, quét ra khi chưa vào thì sao?**
> Dùng đầu đọc **MFRC522** của Wokwi ở cửa D07: thẻ Xanh dương = DEMO-017, Xanh lá = DEMO-018, Đỏ = DEMO-999; công tắc chọn chiều vào/ra. Dòng Serial `RFID D07 DEMO-017 IN|OUT` vẫn dùng được cho script kiểm thử. Firmware nhớ **trạng thái trong/ngoài của từng thẻ**: quét IN khi đang ở trong là `duplicate`, không tăng; quét OUT khi chưa vào cũng `duplicate`, nên số người **không bao giờ âm**. DEMO-017, DEMO-018 hợp lệ; DEMO-999 bị `unauthorized` nhưng vẫn gửi sự kiện để ghi nhật ký. Dòng dài hơn 63 ký tự bị bỏ và số người chuyển **chưa xác minh** (có thể đã mất một lượt quẹt).

**B6 ⭐⭐⭐ Sau khi mất điện/khởi động lại, ESP32 biết trong kho có bao nhiêu người không?**
> Không biết, và nhóm **không giả vờ biết**. Số người chuyển **"chưa xác minh"**, gửi lên là `null` chứ không phải 0. Chỉ xác minh lại bằng 0 khi mmWave thông **và** không còn thẻ nào ghi nhận ở trong. Trong lúc chưa xác minh, lệnh đóng bị `INPUT_UNKNOWN`. Đã thử bằng `ESP.restart()` thật trên Wokwi. — DEC-017.

**B7 ⭐⭐ Cửa trong Wokwi không có motor, làm sao biết cửa "đã đóng"?**
> Công tắc contact đóng vai **cảm biến vị trí**; servo hiển thị cánh cửa khi motor chạy, nhưng **không** dùng làm cảm biến vì vị trí cửa phải được đo độc lập với lệnh motor (cửa kẹt thì servo vẫn quay). Lệnh chỉ khởi động chuyển động; cửa "tới nơi" khi contact đổi. Nếu sau **10 giây** chưa tới nơi → dừng motor, ghi lỗi `LOCAL_INPUT_FAILURE`. — DEC-019.

**B8 ⭐ Tại sao gửi telemetry 2 giây/lần? Sao không gửi khi có thay đổi?**
> 2 giây đủ nhanh để giao diện coi dữ liệu là mới (ngưỡng 10 giây cho phép mất vài bản), và đều đặn để backend **phát hiện thiết bị mất tín hiệu**. Thay đổi quan trọng (cửa, panic, RFID, đảo chiều) được gửi **ngay** dưới dạng **event** riêng, không chờ chu kỳ.

**B9 ⭐⭐ Hàng đợi event đầy thì sao?**
> Hàng đợi có 32 chỗ. Đầy thì event mới bị bỏ, Serial in `EVENT_GAP`, nhưng **số thứ tự vẫn tăng**, nên backend thấy bị nhảy số và ghi vào bảng `event_gaps`, hiện trên trang Nhật ký. **Trạng thái an toàn tại chỗ vẫn đúng** vì không phụ thuộc hàng đợi. Nhóm không hứa log đầy đủ khi mất mạng lâu. — DEC-018, DEC-025.

---

## C. Quy tắc an toàn

**C1 ⭐ Điều kiện để được đóng cửa?**
> Kiểm theo thứ tự: không có panic → mọi tín hiệu của cửa đó và mmWave **đã biết** và số người **đã xác minh** → số người = 0 → không hiện diện → rèm quang thông. Sai điều kiện nào thì trả đúng lý do: `PANIC_ACTIVE`, `INPUT_UNKNOWN`, `OCCUPIED`, `PRESENCE_DETECTED`, `BEAM_BLOCKED`. — `closeGate()` trong `controller.h`.

**C2 ⭐⭐⭐ Tại sao không dùng giá trị mặc định (ví dụ 0 người, beam thông) khi chưa đọc được cảm biến?**
> Vì mặc định "an toàn" sẽ cho phép **đóng cửa nhốt người** đúng lúc hệ thống mù. Nguyên tắc của nhóm: **fail-safe** — chưa biết thì coi là nguy hiểm. Trên mạng cũng vậy: `null` nghĩa là chưa biết, không bao giờ thay bằng 0/false.

**C3 ⭐⭐ Đang đóng cửa mà có người bước vào thì sao?**
> Mỗi nhịp `tick()` khi cửa đang đóng, firmware kiểm lại điều kiện đóng. Mất điều kiện (beam bị che, mmWave thấy người, panic…) → **tự đảo chiều mở**, gửi sự kiện `SAFETY_EVENT … closing reversed BEAM_BLOCKED`. Không cần mạng.

**C4 ⭐⭐ Liên động hai cửa là gì? Panic có bị liên động chặn không?**
> Bình thường chỉ mở được một cửa khi **cửa kia đóng và đứng yên** (`INTERLOCK_ACTIVE` nếu vi phạm), để giữ lạnh. Khi **có panic, liên động bị bỏ qua**, cả hai cửa nhả khóa — cứu người ưu tiên hơn giữ nhiệt. Liên động **không bao giờ** được là thứ cản thoát hiểm.

**C5 ⭐⭐ Panic xử lý ra sao? Ai được xóa panic?**
> Bấm panic → chốt (latch), nhả khóa **cả hai cửa**, mở cửa có panic, bật đèn + còi + sưởi, tắt quạt. Nhả nút **không** xóa panic. Xóa cần **cả hai**: nút đã nhả **và** operator gửi lệnh `reset_panic`. "Tiếp nhận cảnh báo" trên giao diện chỉ ghi nhận, **không** xóa panic.

**C6 ⭐⭐ Vì sao bật sưởi và tắt quạt khi khẩn cấp?**
> Giả định của mô hình: có người có thể đang mắc kẹt trong môi trường −20 °C, nên ngừng làm lạnh thêm và sưởi để giảm nguy cơ hạ thân nhiệt. Đây là **giả định cần chuyên gia an toàn kho lạnh duyệt**, chỉ là LED trong Wokwi. — DEC-021.

**C7 ⭐⭐ "Nghi người mắc kẹt" phát hiện thế nào?**
> mmWave thấy người liên tục **quá 5 phút** trong khi **cả hai cửa đều đóng** → cảnh báo `TRAPPED_PERSON`, bật đầu ra khẩn cấp (đèn, còi, sưởi, tắt quạt). Bộ đếm chạy trên ESP32 nên mất mạng vẫn chạy.

**C8 ⭐ Cảnh báo cửa mở lâu?**
> Mở ≥ 30 giây: cảnh báo (đèn). Mở > 60 giây: nghiêm trọng (còi). Đếm trên thiết bị theo đồng hồ của ESP32. Backend chỉ phản ánh trạng thái cảnh báo theo telemetry, không tự đếm giờ. — DEC-022.

**C9 ⭐⭐⭐ Nếu mmWave bỏ sót người nằm bất động thì hệ thống có nhốt người không?**
> Có thể — đây là **giới hạn thật** nhóm ghi ở DEC-017. Hệ thống dùng **hai nguồn độc lập** (RFID và mmWave) và beam để giảm rủi ro, nhưng nếu người vào không quẹt thẻ **và** mmWave không thấy thì cả hai đều sai. Thực tế cần thêm: chốt thoát hiểm cơ học mở từ bên trong, camera nhiệt, quy trình kiểm tra trước khi đóng. Mô hình **không** đánh giá được độ nhạy của radar thật. Trên Wokwi còn yếu hơn: PIR chỉ bắt **chuyển động**, nên người đứng yên lâu sẽ không được thấy; Wokwi không có radar mmWave.

**C10 ⭐⭐⭐ An toàn dựa vào phần mềm, lỡ ESP32 treo thì sao?**
> Đúng, phần mềm không đủ cho an toàn tính mạng. Thực tế cần **relay an toàn độc lập, chốt thoát hiểm cơ học, watchdog phần cứng**. Mô hình chứng minh logic điều khiển; nhóm **không** khẳng định đạt chứng nhận an toàn (slide 26).

---

## D. Truyền thông MQTT

**D1 ⭐ Tại sao chọn MQTT mà không dùng HTTP?**
> MQTT là **publish/subscribe** nhẹ, thiết bị giữ một kết nối và nhận lệnh đẩy xuống ngay, không phải hỏi liên tục. Có sẵn **QoS**, **Last Will** (broker tự báo thiết bị offline khi rớt mạng), **retained** (bản tin cuối cho người mới subscribe) và **phiên bền**. HTTP phù hợp cho dashboard gọi backend, nên nhóm dùng cả hai đúng chỗ.

**D2 ⭐ Cấu trúc topic?**
> `khoguard/v1/WH01/devices/<device_id>/<kind>` với kind là `telemetry`, `status`, `events`, `commands`, `acks`. Có số phiên bản `v1` để đổi định dạng sau này không phá thiết bị cũ.

**D3 ⭐⭐ Dùng QoS mấy? Sao không QoS 2?**
> **QoS 1** (ít nhất một lần). Có thể bị gửi trùng, nên chống trùng ở **cơ sở dữ liệu**: telemetry duy nhất theo (thiết bị, boot, seq), event theo (thiết bị, event_id), lệnh ở ESP32 nhớ 8 ID gần nhất để ACK lại **mà không chạy lại**. Như vậy đạt "đúng một lần" về kết quả mà không tốn bắt tay 4 bước của QoS 2.

**D4 ⭐⭐ Retain dùng cho bản tin nào?**
> `telemetry` và `status` **có retain** để backend mới kết nối biết ngay trạng thái cuối. `events`, `acks`, `commands` **không retain** — đặc biệt lệnh retain sẽ bị **chạy lại** khi thiết bị nối lại, rất nguy hiểm. Backend cũng không coi telemetry retained là dữ liệu mới.

**D5 ⭐⭐ Last Will là gì, nhóm dùng thế nào?**
> Khi kết nối, ESP32 đăng ký sẵn bản tin "offline" với broker. Nếu ESP32 rớt mạng không báo trước, broker tự gửi bản tin đó. Mỗi lần kết nối có **session_id mới**, backend đối chiếu session để **Will của phiên cũ không đánh offline phiên mới**.

**D6 ⭐⭐⭐ Thiết bị dùng clean session, backend dùng persistent session. Tại sao khác nhau?**
> - **Thiết bị — clean session:** lệnh gửi cho phiên cũ **không bao giờ** được giao lại sau khi nối lại (lệnh cũ có thể đã sai bối cảnh).
> - **Backend — persistent session** (client ID cố định, `clean: false`): khi backend tắt hoặc MySQL lỗi, broker **giữ lại** telemetry/event/ack QoS1 (tối đa 1000 tin, 1 ngày) rồi giao khi backend quay lại, không mất dữ liệu. — DEC-025.

**D7 ⭐⭐⭐ Làm sao chống một thiết bị giả danh thiết bị khác?**
> Ba lớp: **mỗi thiết bị một tài khoản MQTT**; **ACL** của broker chỉ cho thiết bị ghi vào topic của chính nó và đọc `commands` của chính nó; backend kiểm **envelope khớp topic** (device_id, zone, door đúng registry). Thiết bị không thể gửi lệnh vì chỉ tài khoản backend được ghi `commands`.

**D8 ⭐⭐ Bản tin có định dạng thế nào, kiểm tra ra sao?**
> JSON có envelope chung: `schema_version, warehouse_id, device_id, boot_id, session_id, seq, kind, clock_synced, sent_at, uptime_ms, payload`. Backend kiểm bằng **JSON Schema (Ajv, chế độ strict)** cộng kiểm tra ngữ nghĩa (đúng khu, đúng cửa của thiết bị). Sai thì loại, **không ép kiểu hay bỏ qua trường lạ**. Firmware giới hạn bản tin ≤ 4096 byte. — `contracts/`.

**D9 ⭐⭐⭐ ESP32 không có đồng hồ thật (NTP), vậy lệnh hết hạn kiểm thế nào?**
> Không dựa vào giờ. Mỗi lệnh gắn **boot_id + session_id** của phiên hiện tại và **expected_revision** (số phiên bản trạng thái mà người vận hành đang nhìn). ESP32 từ chối nếu khác phiên (`COMMAND_EXPIRED`) hoặc trạng thái đã đổi (`REVISION_MISMATCH`). Reboot/nối lại tạo phiên mới nên lệnh cũ tự vô hiệu. Hạn 10 giây do **backend** quản lý. Bản tin ghi `clock_synced: false`, `sent_at: null` để không ai hiểu nhầm là có giờ thật. — DEC-020.

**D10 ⭐⭐ Gateway Wokwi để làm gì? Sao dùng bản native?**
> ESP32 trong Wokwi cần gateway để ra mạng của máy (tới `host.wokwi.internal`). Gateway tích hợp của extension **không tự nối lại** sau khi broker khởi động lại (thử 45 giây); gateway native 2.0.1 nối lại được, nên nhóm chọn bản native và kiểm SHA-256 file tải về. — DEC-011.

---

## E. Bảo mật

**E1 ⭐⭐ TLS cấu hình thế nào? Sao không dùng `setInsecure()`?**
> Broker TLS ở cổng **18885**, chứng chỉ ký bởi **CA demo riêng** của dự án, SAN gồm `localhost`, `host.wokwi.internal`, `127.0.0.1`. ESP32 nhúng CA và **xác minh cả chuỗi chứng chỉ lẫn tên máy**. `setInsecure()` bỏ xác minh → mã hóa nhưng không biết đang nói chuyện với ai (dễ bị man-in-the-middle), nên **cấm**. Đã thử CA sai và hostname sai: ESP32 từ chối. — DEC-024, DEC-039.

**E2 ⭐⭐ Mật khẩu, khóa lưu ở đâu?**
> Trong thư mục `.local` (ngoài Git, phân quyền NTFS chỉ người dùng hiện tại), file `kg_secrets.h` được **sinh ra** khi build. Không có secret trong mã nguồn; Vite chặn truy cập HTTP vào `.local`. Firmware bin/elf có nhúng secret cũng chỉ nằm trong `.local`. — DEC-009.

**E3 ⭐⭐ Đăng nhập dashboard bảo vệ thế nào?**
> Mật khẩu băm **scrypt**. Phiên là cookie `kg_session` **HttpOnly, SameSite=Strict**, hạn 8 giờ; token ngẫu nhiên 32 byte, DB chỉ lưu **SHA-256** của token. Sai 5 lần thì khóa tên đăng nhập 60 giây. POST phải có **Origin** của dashboard và `Content-Type: application/json` để chống CSRF. — DEC-026.

**E3b ⭐⭐⭐ Sao mật khẩu demo chỉ là `1234`?**
> Chỉ để gõ nhanh khi trình bày trên máy demo; mọi dịch vụ chỉ nghe `127.0.0.1`. Cài đặt mới vẫn **sinh mật khẩu ngẫu nhiên 192-bit**, và cơ chế bảo vệ vẫn giữ: mật khẩu dashboard băm scrypt, khóa sau 5 lần sai, mỗi thiết bị một tài khoản MQTT với ACL. Đưa ra mạng thì phải đổi lại mật khẩu dài ngẫu nhiên. — DEC-041.

**E4 ⭐⭐⭐ Cookie không có cờ `Secure`, vậy có an toàn không?**
> Chưa đặt vì dashboard chạy `http://127.0.0.1` cục bộ; đặt `Secure` thì trình duyệt sẽ không gửi cookie qua HTTP. **Nếu đưa ra mạng phải có HTTPS và bật `Secure`** — nhóm ghi rõ ở DEC-026 và hướng phát triển.

**E5 ⭐⭐ Phân quyền kiểm ở đâu?**
> Ở **backend**, theo vai trò lấy từ phiên. Giao diện chỉ khóa nút cho tiện. Người thực hiện ghi trong nhật ký lấy **từ phiên**, không từ dữ liệu client gửi lên, nên không giả mạo được. — DEC-027.

**E6 ⭐⭐ CSV injection là gì? Nhóm chặn thế nào?**
> Ô chữ bắt đầu bằng `=`, `+`, `-`, `@`, Tab, CR có thể bị Excel hiểu là **công thức** và chạy lệnh. Nhóm thêm dấu `'` phía trước các ô đó (theo khuyến nghị OWASP), số vẫn giữ kiểu số. Cột xuất là danh sách cố định nên không lộ hash/token. — DEC-030.

---

## F. Backend và cơ sở dữ liệu

**F1 ⭐ Tại sao chọn MySQL, không MongoDB?**
> Dữ liệu có **quan hệ rõ** (kho → khu → cửa → thiết bị; vị trí → giữ chỗ; người dùng → phiên). Nhận hàng cần **transaction và ràng buộc duy nhất** để không giữ trùng. MySQL đã có sẵn trên máy; vận hành hai DB không cần thiết cho phạm vi này. — DEC-001.

**F2 ⭐⭐ "Thiết bị sống" (fresh) được xác định thế nào?**
> Phải có `status: online` của **kết nối hiện tại** **và** telemetry cùng phiên không quá **10 giây**. Bản tin retained, bản tin trùng, bản tin phiên cũ **không** kéo dài độ mới. Backend khởi động lại hoặc DB lỗi thì xóa xác nhận "sống" cho tới khi thiết bị gửi lại. — DEC-005, DEC-014.

**F3 ⭐⭐⭐ Người vận hành bấm Đóng, backend trả 202 — cửa đã đóng chưa?**
> **Chưa chắc.** 202 chỉ là backend đã nhận và gửi lệnh. Kết quả thật là **ACK của ESP32** (applied/rejected/expired kèm lý do) và **telemetry** cho thấy contact đổi. Backend chờ ACK tối đa 10 + 2 giây; ACK muộn được lưu `late_ack`. Giao diện hiện trạng thái chờ cho đến khi có ACK.

**F4 ⭐⭐ Backend có tự tính số người trong kho không?**
> Không. **ESP32 là nguồn sự thật** của số người khu C. Backend chỉ lưu và hiển thị, không tự cộng trừ theo sự kiện RFID hay sửa theo mmWave — nếu không sẽ có hai con số mâu thuẫn. — DEC-016.

**F5 ⭐⭐ Giữ chỗ đồng thời — hai người cùng giữ một ô thì sao?**
> Transaction khóa **dòng kho trước rồi dòng vị trí**, và DB có **unique `active_slot`** — dù code sai, DB vẫn chặn giữ trùng. Mỗi yêu cầu có `request_id` do client sinh, gửi lại không tạo bản giữ thứ hai. Đã có test hai yêu cầu đồng thời. — DEC-029.

**F6 ⭐⭐ Ngưỡng 95% tính đúng thế nào?**
> Bằng số nguyên: từ chối khi `(đang chứa + đang giữ + 1) × 100 > 95 × số vị trí khả dụng`. Không dùng phần trăm làm tròn trên UI (94,6% hiển thị 95% có thể gây quyết định sai). Vị trí đang xả đá không tính là khả dụng. Khu đệm D là cổng riêng: ≥ 95% thì dừng nhận.

**F7 ⭐⭐ Migration database quản lý thế nào?**
> Có **journal migration** với checksum từng file; migration dở dang, checksum đổi hoặc schema lạ thì **từ chối chạy**, không tự reset. Có marker sở hữu (server UUID + setup ID) để backend không ghi nhầm vào DB của ứng dụng khác. `/api/ready` chỉ trả 200 khi đủ 6 migration và MQTT đã subscribe. — DEC-013.

**F8 ⭐ Tại sao không dùng Express?**
> Backend chỉ cần một số route, `node:http` có sẵn đủ dùng, giảm phụ thuộc. Giới hạn kích thước body, header, timeout được tự cấu hình. — DEC-012.

**F9 ⭐⭐ Health và Ready khác nhau thế nào?**
> `/api/health`: process còn sống (luôn 200). `/api/ready`: **sẵn sàng phục vụ** — DB đúng schema/migration **và** MQTT đã kết nối, subscribe đủ; thiếu thì 503. Tách ra để công cụ giám sát không khởi động lại backend chỉ vì DB tạm lỗi.

---

## G. Giao diện

**G1 ⭐ Giao diện nhận dữ liệu thời gian thực bằng gì?**
> Tải lần đầu bằng **REST**, sau đó **WebSocket** `/ws` đẩy **snapshot đầy đủ** mỗi giây. Gửi snapshot đầy đủ (không gửi phần chênh lệch) để mất một gói cũng không làm giao diện sai lệch lâu dài.

**G2 ⭐⭐ Dữ liệu cũ hiển thị thế nào? Sao không ẩn đi?**
> Vẫn hiển thị giá trị cuối kèm nhãn **cũ/chưa rõ** và nguồn. Ẩn đi thì người vận hành mất thông tin tra cứu; nhưng giao diện **không cho dùng dữ liệu cũ để gửi lệnh đóng**, và backend cũng chặn (`409 DEVICE_NOT_LIVE`).

---

## H. Kiểm thử và kết quả

**H1 ⭐ Nhóm kiểm thử những gì?**
> - **109 unit test JS** (contract, ingest, lệnh, giữ chỗ, đăng nhập…).
> - **2 bộ test C++** cho `controller.h`.
> - **Integration**: chạy với MySQL và broker thật.
> - **Nghiệm thu trên Wokwi** với firmware thật: RFID, presence, beam, liên động, panic, mất broker, bộ đếm thời gian; bổ sung 9/9 nhóm (tín hiệu unknown, reboot, TLS sai, dữ liệu cũ).
> - **Thử tải** 50 nguồn ảo.

**H2 ⭐⭐⭐ "FakeEdge" là gì? Có phải nhóm giả kết quả firmware không?**
> FakeEdge là bản Node làm lại quy tắc ở dạng rút gọn, **chỉ dùng để chạy tự động 4 kịch bản demo khi Wokwi tắt**. Nhóm **không** tính nó là nghiệm thu firmware. Nghiệm thu firmware tách riêng, chạy trên ESP32 Wokwi thật, người gạt công tắc, kết quả xác nhận bằng Serial và telemetry. — DEC-031, DEC-034.

**H3 ⭐⭐⭐ P95 211 ms có phải độ trễ tới màn hình không?**
> **Không.** Đó là từ lúc thiết bị publish tới lúc **WebSocket** nhận được. Thời gian React vẽ lên màn hình (DOM) **chưa đo** — nhóm ghi là việc còn lại của M16. Mục tiêu đề ra là P95 ≤ 2 giây.

**H4 ⭐⭐ 50 nguồn ảo có phải 50 thiết bị không?**
> Không. 50 nguồn dồn qua **5 tài khoản** đã đăng ký, vì thêm 45 tài khoản chỉ để đo sẽ phải nới cấu hình bảo mật. Kết quả chứng minh backend lưu đủ **2.000/2.000** bản tin ở mức tải đó, chưa chứng minh 50 kết nối TCP riêng. — DEC-031.

**H5 ⭐⭐ Thử mất broker thế nào mà không ảnh hưởng dịch vụ khác?**
> Script chỉ dừng **đúng tiến trình Mosquitto của dự án** (nhận diện qua dòng lệnh chứa file cấu hình của dự án), không đụng broker 1883 hay MySQL dùng chung. Trong lúc dừng, bằng chứng duy nhất là Serial `OUTPUTS` (vì telemetry không gửi được), có cả thời điểm theo đồng hồ thiết bị. — DEC-034.

**H6 ⭐⭐ Kiểm thử phát hiện lỗi gì?**
> Ba lỗi đã sửa có test hồi quy:
> 1. Từ chối lệnh tới thiết bị cũ làm **mọi thiết bị mất trạng thái sống** (DEC-040).
> 2. Gói của **kết nối MQTT đã đóng** vẫn bị xác nhận PUBACK dù chưa lưu → mất dữ liệu (DEC-036).
> 3. Telemetry tồn đọng sau lỗi DB bị loại và mất → nay lưu làm **lịch sử** nhưng không làm thiết bị "sống" lại (DEC-035).

**H7 ⭐⭐⭐ Lỗi ghi MySQL xử lý thế nào? Tại sao một thiết bị lỗi lại chặn cả kho?**
> Không ghi được thì **không gửi PUBACK** → broker giữ tin → DB hết lỗi thì nhận lại, lưu đúng một lần. Thử khóa dòng 9,5 giây: readiness báo lỗi, nhả khóa thì 3 bản tồn đọng được lưu sau 418 ms. Đúng là chặn ingest cả kho trong lúc lỗi — nhóm **chấp nhận** vì nguyên tắc "không báo đã nhận khi chưa lưu" quan trọng hơn. Chưa thử trường hợp đĩa đầy.

---

## I. Câu hỏi "bẫy" và câu hỏi mở rộng

**I1 ⭐⭐⭐ Hệ thống của em có dùng được ngoài thực tế ngay không?**
> Chưa. Đây là **mô hình kiểm chứng nguyên lý**. Cần phần cứng thật, chốt thoát hiểm cơ học, relay an toàn, đánh giá cảm biến trong môi trường lạnh, HTTPS, và chuyên gia an toàn duyệt quy tắc.

**I2 ⭐⭐⭐ Nếu hacker chiếm được backend, có ra lệnh nhốt người được không?**
> Backend chỉ gửi **yêu cầu**. ESP32 **tự kiểm tra lại toàn bộ** điều kiện an toàn trước khi đóng: còn người, hiện diện, beam che, tín hiệu chưa rõ đều bị từ chối. Backend **không** có lệnh ghi đè an toàn. Panic và đảo chiều chạy cục bộ, không cần mạng. Tuy vậy kẻ tấn công vẫn có thể **mở** cửa hoặc làm sai lịch sử — nên vẫn cần bảo mật đầy đủ.

**I3 ⭐⭐⭐ Sao không đặt quy tắc an toàn ở backend cho dễ cập nhật?**
> Vì mạng **có thể mất** đúng lúc nguy hiểm; độ trễ mạng cũng không đảm bảo. Quy tắc an toàn tính mạng phải chạy **gần cơ cấu chấp hành nhất**. Backend chỉ làm việc không ảnh hưởng tính mạng: lưu trữ, báo cáo, phân quyền, nhận hàng.

**I4 ⭐⭐ Lịch ca có chặn người ra không?**
> **Không bao giờ chặn ra.** Ca làm việc chỉ để **ghi nhận/kiểm tra** (đúng ca, ngoài ca, thẻ thu hồi). Không đổi quyết định cho vào của thiết bị, không đổi số người hay liên động. — DEC-028.

**I5 ⭐⭐ Nếu thẻ bị thu hồi trong DB mà ESP32 vẫn cho vào thì sao?**
> Danh sách thẻ ở thiết bị và ở DB là hai nơi. Nhật ký sẽ ghi **"Thẻ đã thu hồi"** để người vận hành cập nhật thiết bị. Đồng bộ danh sách thẻ xuống thiết bị là hướng phát triển.

**I6 ⭐⭐ Mở rộng lên nhiều kho, nhiều ESP32 thì sửa những gì?**
> Topic đã có `WH01`; thêm thiết bị vào registry `contracts/devices.json`, tạo tài khoản MQTT + ACL tương ứng, migration seed mới. Giữ chỗ hiện đi tuần tự qua một khóa mỗi kho — đủ cho một kho, nhiều kho lớn cần thiết kế lại khóa. Broker cục bộ cần thay bằng cụm broker và mạng riêng/VLAN.

**I7 ⭐⭐ Đề tài còn thiếu gì so với kế hoạch?**
> M16 còn đo độ trễ tới DOM; M17 còn bàn giao cho người khác chạy lại trên máy khác. Không có truy vết pallet bằng RFID, chưa nối WMS, chưa có xuất kho. Nhóm ghi rõ trong slide 26 và `Agent.md`.

**I8 ⭐ Nhóm đã dùng AI hỗ trợ không? Phần nào là của nhóm?**
> *(Trả lời trung thực theo thực tế của nhóm.)* Gợi ý: nêu rõ nhóm dùng công cụ nào, ở khâu nào; nhấn mạnh **nhóm tự kiểm chứng** mọi kết quả bằng test, nghiệm thu Wokwi và giải thích được từng quyết định trong `DESITION.md`.

---

## J. Câu hỏi nhanh — trả lời một câu

| Câu hỏi | Trả lời |
| --- | --- |
| Board, framework? | ESP32 DevKit, Arduino core 2.0.17, PlatformIO espressif32 7.0.1 |
| Thư viện firmware? | MQTT (256dpi) 2.5.3, ArduinoJson 7.4.3, DHT 1.4.7 |
| Chu kỳ telemetry? | 2 giây |
| Ngưỡng dữ liệu cũ? | 10 giây |
| Hạn lệnh cửa? | 10 giây, chờ ACK thêm 2 giây |
| Chống dội? | 30 ms |
| Cửa không tới nơi? | 10 giây → dừng, `LOCAL_INPUT_FAILURE` |
| Cảnh báo cửa mở? | ≥ 30 s cảnh báo, > 60 s nghiêm trọng |
| Mắc kẹt? | mmWave thấy người > 5 phút khi hai cửa đóng |
| Hàng đợi trên ESP32? | Event 32, ACK 4, nhớ 8 ID lệnh |
| Kích thước bản tin tối đa? | 4096 byte |
| Cổng broker? | 18884 thường (localhost), 18885 TLS |
| Ngưỡng sức chứa? | Cảnh báo 85 %, từ chối vượt 95 %, khu đệm ≥ 95 % dừng nhận |
| Hạn giữ chỗ? | 15 phút |
| Hạn phiên đăng nhập? | 8 giờ; sai 5 lần khóa 60 giây |
| Thẻ demo? | DEMO-017, DEMO-018 hợp lệ; DEMO-999 không hợp lệ |
| Lý do từ chối lệnh? | OCCUPIED, PRESENCE_DETECTED, BEAM_BLOCKED, PANIC_ACTIVE, INPUT_UNKNOWN, INTERLOCK_ACTIVE, REVISION_MISMATCH, COMMAND_EXPIRED… |

---

## Ôn nhanh 10 câu dễ bị hỏi nhất

1. Điều kiện đóng cửa (C1) và vì sao "chưa biết = không an toàn" (C2).
2. Mất mạng thì an toàn còn hoạt động không (B4, I3).
3. Panic chốt và cách reset (C5).
4. Reboot thì số người thế nào (B6).
5. Vì sao MQTT, QoS 1, retain (D1, D3, D4).
6. Lệnh hết hạn khi không có NTP (D9).
7. API 202 có nghĩa cửa đã đóng không (F3).
8. TLS và vì sao không `setInsecure()` (E1).
9. FakeEdge, 50 nguồn ảo, 211 ms — nói đúng giới hạn (H2, H3, H4).
10. Dùng được ngoài thực tế chưa, còn thiếu gì (I1, I7, C9).
