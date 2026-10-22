# Hướng dẫn demo KhoGuard

Làm theo từng bước để demo trực tiếp trước giảng viên. Đi kèm: [kịch bản thuyết trình](KICH_BAN_THUYET_TRINH.md) (slide 19–20), [checklist](CHECKLIST_DEMO.md), [câu hỏi ôn tập](CAU_HOI_ON_TAP.md). Cài đặt từ đầu xem [hướng dẫn cấu hình](HUONG_DAN_CAU_HINH.md).

**Hai cách demo:**

| Cách | Khi nào dùng | Nguồn ESP-C01 |
| --- | --- | --- |
| **A. Trực tiếp với Wokwi** (chính) | Buổi trình bày; người demo quẹt thẻ RFID, bấm nút/PIR, gạt công tắc cửa, bấm trên dashboard | Firmware ESP32 thật trên Wokwi |
| **B. Tự động `demo:scenarios`** (dự phòng) | Wokwi trục trặc, hoặc cần chạy nhanh 4 kịch bản | FakeEdge bằng Node (không phải firmware) |

> Trong PowerShell dùng `npm.cmd` thay cho `npm` nếu máy chặn `npm.ps1`.

---

## 1. Chuẩn bị một lần (trước ngày demo)

1. Build firmware mới nhất. Bắt buộc vì `main.cpp` đã chuyển sang thư viện `lib/khoguard`:

   ```powershell
   npm.cmd run firmware:build
   ```

   Kết quả phải là `[SUCCESS]`, tạo `.local/firmware-build/esp32dev/firmware.bin`.
2. Chạy thử toàn bộ mục 2–5 ít nhất **một lần trọn vẹn** trên đúng máy sẽ dùng để trình bày.
3. Tài khoản đăng nhập: `operator` / `1234`. Danh sách đầy đủ ở [TAI_KHOAN.md](TAI_KHOAN.md).
4. Chụp sẵn ảnh dự phòng: dashboard khi đủ 5 thiết bị `fresh`, Serial có `MQTT_ONLINE`.
5. (Tùy chọn) Chạy thử demo mất broker bằng harness `npm.cmd run wokwi:acceptance`. **Không** làm trên sân khấu, chỉ trình bày bằng bằng chứng.

---

## 2. Khởi động (15 phút trước giờ)

**Cách nhanh:** nhấp đúp `run.bat` ở thư mục gốc dự án. Script mở 5 cửa sổ dưới đây theo đúng thứ tự, chờ từng cổng sẵn sàng, mở **4 cửa sổ VS Code** (khu C và 3 nút khu A, B, D) và trình duyệt. Phần nào đang chạy thì bỏ qua. Sau đó chỉ còn bấm **F1 → Wokwi: Start Simulator** trong từng cửa sổ VS Code, rồi đăng nhập.

| Lệnh | Tác dụng |
| --- | --- |
| `run.bat` | Đầy đủ (mặc định): ESP-C01 và 3 nút khu A, B, D chạy trên Wokwi; Node chỉ chạy cửa D09 |
| `run.bat fake` | Không cần Wokwi: khu A, B, D và ESP-C01 đều giả lập bằng Node (cách B). **Không** mở Wokwi cùng lúc |
| `run.bat web` | Khu A, B, D giả lập bằng Node, không có ESP-C01 |
| `run.bat status` | Xem dịch vụ nào đang chạy |
| `close.bat` | Dừng mọi thứ `run.bat` đã mở. Không đụng MySQL, Mosquitto 1883 hay chương trình khác |
| `close.bat list` | Chỉ liệt kê, không dừng |

MySQL không được `run.bat` bật (là service Windows); script chỉ cảnh báo nếu nó chưa chạy. Wokwi Simulator tắt bằng tay trong VS Code.

**Cách thủ công:** mở 5 cửa sổ PowerShell tại `D:\huit\iot\source\khoguard-iot`. Bật **theo đúng thứ tự**:

| Cửa sổ | Lệnh | Chờ thấy |
| --- | --- | --- |
| T1 — Broker | `npm.cmd run infra:mqtt:start` | Mosquitto nghe 18884 và 18885 |
| T2 — Backend | `npm.cmd run backend:start` | Backend nghe `127.0.0.1:3001` |
| T3 — Dashboard | `npm.cmd run dev -- --strictPort` | Vite `http://127.0.0.1:5173` |
| T4 — Cửa D09 (Node) | `npm.cmd run demo:warehouse -- --seed=17` | Gửi dữ liệu SIM-C02. Thêm `--with-fake-zones` nếu khu A/B/D không chạy Wokwi |
| T5 — Gateway Wokwi | `npm.cmd run firmware:gateway:start` | Nghe `ws://127.0.0.1:9011` |

MySQL là service Windows, phải đang chạy sẵn (`Get-Service MySQL*`).

**Bật ESP32 trên Wokwi:**

1. `code --new-window firmware`
2. Trong VS Code mới: **F1 → Wokwi: Start Simulator**. Giữ tab Simulator **luôn hiển thị** (ẩn tab có thể làm mô phỏng chậm).
3. Mở Serial Monitor của Wokwi. Phải thấy:

   ```text
   KHOGUARD_M12 boot=<32 ký tự> core=2.0.17 transport=mqtts:18885 CA-verified; ...
   MQTT_ONLINE boot=... session=...
   TELEMETRY_ACK seq=1
   ```

**Bật 3 nút khu A, B, D trên Wokwi:**

1. Mở 3 cửa sổ VS Code: `code --new-window firmware/wokwi/zone-a` (tương tự `zone-b`, `zone-d`). `run.bat` đã mở sẵn.
2. Trong từng cửa sổ: **F1 → Wokwi: Start Simulator**.
3. Serial Monitor phải có `KHOGUARD_ZONE device=SIM-A01 zone=A ...` rồi `MQTT_ONLINE SIM-A01 ...`.
4. Đầu tiên mỗi khu báo số người *chưa xác minh*; khi PIR không có chuyển động vài giây thì về 0 (đã xác minh). Màn hình LCD của khu hiện nhiệt độ, độ ẩm, số người và cửa đang mở.

Thao tác trên nút khu:

| Muốn làm | Thao tác | Thấy |
| --- | --- | --- |
| Mở/đóng cửa | Gạt công tắc `D0x cửa` (HIGH = mở) | Dashboard đổi trạng thái cửa, Nhật ký có sự kiện cửa |
| Cửa mở lâu | Để cửa mở | Sau 30 s LED vàng sáng và cảnh báo "Cửa … mở từ 30 giây"; sau 60 s LED đỏ, mức nghiêm trọng |
| Người vào/ra | Bấm nút xanh **Vào** / nút đỏ **Ra** | Số người khu đó tăng/giảm 1 |
| Có người | Bấm vào **PIR** → **Simulate Motion** | Dashboard hiện có hiện diện trong ~10 s |
| Nhiệt độ ngoài ngưỡng | Bấm DHT22, kéo nhiệt độ (ví dụ khu B lên 10 °C) | Cảnh báo "Nhiệt độ khu B ngoài ngưỡng"; kéo về thì tự hết |

Nút khu không có khóa, rèm quang hay panic nên dashboard hiện các tín hiệu đó là *chưa rõ*, và không gửi được lệnh cửa tới khu A/B/D (chỉ khu C điều khiển được).

**Nếu không bật được Wokwi cho khu A/B/D:** chạy `run.bat web` hoặc thêm `--with-fake-zones` cho T4. Khi đó Node giả lập 3 khu ở chế độ sinh động: cửa tự đóng mở, thỉnh thoảng mở quá 30/60 giây; kho B định kỳ lên 9,5 °C (sau khoảng 1 phút, lặp mỗi 5 phút), kho A lên 31,5 °C (sau khoảng 3 phút, lặp mỗi 7 phút). Giao diện vẫn ghi nguồn là Wokwi, nên phải nói rõ với giảng viên đây là bản giả lập. Muốn các khu đứng yên thì thêm `--steady`.

**Mở dashboard:**

1. Trình duyệt mở <http://127.0.0.1:5173>.
2. Góc trên: **Nguồn dữ liệu → Backend / MQTT** (không dùng *Demo giao diện*).
3. Đăng nhập `operator`.
4. Thanh bên có *Backend đã kết nối* và *MQTT đã kết nối*; cả **5 thiết bị `fresh`**; ESP-C01 có nhãn nguồn Wokwi.

**Kiểm nhanh (tùy chọn):** `npm.cmd run firmware:check -- <boot-ID trên Serial>` phải báo `PASS` và đúng boot ID đó.

---

## 3. Trạng thái nền trước khi demo

Mạch khu C (DEC-044) gồm:
- **Giữ công tắc:** cửa (contact) và rèm quang (beam).
- **Nút đỏ:** panic.
- **Cảm biến:** PIR (hiện diện), đầu đọc RFID MFRC522 kèm công tắc chọn chiều.
- **Cơ cấu chấp hành:** 2 servo (cánh cửa), 2 relay khóa (kèm đèn xanh), buzzer (còi), LED đèn/sưởi/quạt.

Đặt như sau:

| Linh kiện | Trạng thái | Ý nghĩa |
| --- | --- | --- |
| Công tắc `D07 contact`, `D08 contact` | **LOW** | Hai cửa đóng |
| Công tắc `D07 beam`, `D08 beam` | **HIGH** | Rèm quang thông |
| Nút `D07 PANIC`, `D08 PANIC` | Không bấm | Không khẩn cấp |
| PIR | Không bấm *Simulate Motion* trong ~10 s | Không thấy người |
| Công tắc `Chiều quẹt` | **HIGH** | Quẹt thẻ là **vào** |

Kết quả cần có:

- **Wokwi:** hai relay khóa đóng và hai đèn xanh *khóa* sáng; *Quạt* sáng; hai servo ở 0° (cửa đóng); đèn, buzzer, sưởi tắt. Serial có `RFID_READER ready`.
- **Dashboard khu C:** **0 người (đã xác minh)**, D07/D08 *Đóng · Đã khóa*.
- **Nếu số người là "chưa xác minh"** (vừa reboot hoặc còn thẻ ở trong): gạt `Chiều quẹt` sang LOW (ra), quẹt các thẻ còn ở trong, gạt lại HIGH, chờ PIR hết tín hiệu.

---

## 4. Bố trí màn hình

- Màn chiếu: PowerPoint ở chế độ trình chiếu.
- Chuẩn bị sẵn 2 cửa sổ để `Alt+Tab`:
  1. **Trình duyệt**, trang **Giám sát cửa** (khung *Điều khiển cửa khu C* có nút **Mở cửa / Đóng cửa / Đặt lại khẩn cấp**).
  2. **VS Code**: tab Simulator bên trái, Serial Monitor phía dưới.
- Nếu có hai màn hình: dashboard một bên, Wokwi một bên, để giảng viên thấy cả hai cùng lúc.
- Phóng to trình duyệt 125–150% để người ngồi xa đọc được.

> **Mẹo quan trọng:** sau mỗi lần gạt công tắc hoặc quẹt thẻ, **đợi 2–3 giây** (một chu kỳ telemetry) rồi mới bấm nút trên dashboard. Bấm ngay có thể nhận `REVISION_MISMATCH`: lệnh được gửi theo trạng thái cũ nên thiết bị từ chối. Đây là đúng thiết kế, nhưng làm demo rối.

---

## 5. Các kịch bản demo trực tiếp

Mỗi kịch bản ghi **Làm**, **Thấy trên Wokwi/Serial**, **Thấy trên dashboard** và **Câu nói** để giải thích.

### Demo 1 — Ra/vào bằng RFID (≈ 45 giây)

Bấm vào **đầu đọc RFID** trên mạch để mở bảng điều khiển: chọn thẻ rồi bấm **Tap**. Thẻ **Xanh dương = DEMO-017**, **Xanh lá = DEMO-018**, **Đỏ = DEMO-999** (đã thu hồi). Công tắc `Chiều quẹt`: HIGH = vào, LOW = ra.

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | `Chiều quẹt` HIGH, chọn thẻ **Xanh dương**, bấm **Tap** | Serial: `RFID_EVENT door=D07 card=DEMO-017 dir=in result=0 count=1 verified=1`. Dashboard khu C: **1 người** |
| 2 | Bấm **Tap** thẻ Xanh dương lần nữa | `result=1` (duplicate), **vẫn 1 người** |
| 3 | (Tùy chọn) chọn thẻ **Đỏ**, **Tap** | `result=2` (unauthorized), số người không đổi; Nhật ký vẫn ghi thẻ bị từ chối |
| 4 | Đợi 2 s, dashboard D07 bấm **Đóng cửa** | Dashboard: *Bị từ chối: RFID còn người trong kho* (OCCUPIED). Serial: `COMMAND … D07 close -> OCCUPIED` |
| 5 | Gạt `Chiều quẹt` LOW, **Tap** thẻ Xanh dương, gạt lại HIGH | `dir=out count=0 verified=1`. Dashboard: **0 người** |

Nếu đầu đọc không phản hồi (Serial báo `RFID_READER missing`), vẫn demo được bằng cách gõ vào Serial Monitor `RFID D07 DEMO-017 IN` / `OUT`.

**Câu nói:** "Đọc lặp không tăng số người. Còn người thì chính ESP32 từ chối đóng, kể cả khi lệnh tới từ dashboard."

### Demo 2 — RFID báo 0 người nhưng cảm biến vẫn thấy người (≈ 30 giây)

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | Bấm vào **PIR**, chọn **Simulate Motion** | Dashboard: cảnh báo *RFID báo 0 người nhưng mmWave còn tín hiệu ở khu C* |
| 2 | Trong vòng 10 s, D07 bấm **Đóng cửa** (bấm Simulate Motion lại nếu cần giữ tín hiệu) | *Bị từ chối: mmWave còn phát hiện người trong kho* (PRESENCE_DETECTED) |
| 3 | Không bấm gì thêm | PIR tự về LOW sau 10 s; cảnh báo tự hết |

**Câu nói:** "RFID có thể sai, ví dụ người đi theo không quẹt thẻ. Hai nguồn độc lập phải cùng nói *không có người* mới được đóng." Nếu bị hỏi: PIR chỉ bắt **chuyển động**, người đứng yên lâu có thể không thấy; thiết kế thật dùng radar mmWave, Wokwi không có linh kiện này.

### Demo 3 — Khẩn cấp (panic) và đặt lại (≈ 90 giây)

Bắt đầu với cửa D07 **đóng**.

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | Bấm nút đỏ **D07 PANIC** (hoặc phím `7` khi mạch đang được chọn) | **Wokwi:** hai relay nhả, đèn *khóa* tắt; servo D07 quay sang 90° (cửa mở ra); *Đèn*, *Sưởi* sáng, **buzzer kêu**; *Quạt* tắt. **Serial:** `INPUT_EVENT door=D07 panic=1 …` và `OUTPUTS …`. **Dashboard:** cảnh báo khẩn cấp, D07 *Khẩn cấp đang chốt* |
| 2 | Trong **10 giây**, gạt **D07 contact → HIGH** (cảm biến báo cửa đã mở tới nơi) | Motor dừng, D07 hiện *Mở · Không khóa* |
| 3 | (Nút đã tự nhả sau khi bấm) | Panic **vẫn chốt**: đèn, buzzer, sưởi vẫn bật |
| 4 | Ở cảnh báo khẩn cấp, bấm **Tiếp nhận** | Hiện *Đã tiếp nhận* nhưng D07 **vẫn** *Khẩn cấp đang chốt* |
| 5 | D07 bấm **Đóng cửa** | *Bị từ chối: nút khẩn cấp đang chốt hoặc chưa nhả* (PANIC_ACTIVE) |
| 6 | Đợi 2 s, D07 bấm **Đặt lại khẩn cấp** | *Đã áp dụng tại thiết bị*. Sưởi tắt, quạt sáng lại. Đèn/còi có thể **vẫn sáng** nếu D07 đã mở quá 30/60 s: đó là cảnh báo cửa mở lâu, sẽ tắt khi đóng cửa |
| 7 | Đợi 2 s, D07 bấm **Đóng cửa** | *Đã áp dụng tại thiết bị*, servo D07 quay về 0°, D07 *Đang đóng* |
| 8 | Trong **10 giây**, gạt **D07 contact → LOW** | Motor dừng, relay khóa D07 đóng lại và đèn *khóa* sáng, đèn/buzzer tắt; dashboard *Đóng · Đã khóa* |

**Lưu ý:**
- Muốn chứng minh "nút phải được nhả trước": **giữ chuột** trên nút D07 PANIC rồi bấm **Đặt lại khẩn cấp** trên dashboard → bị từ chối (PANIC_ACTIVE).
- Servo chỉ để **nhìn** cánh cửa. Vị trí cửa vẫn do công tắc contact (cảm biến độc lập với motor) báo, nên vẫn phải gạt contact.
- Quên gạt contact trong 10 giây thì Serial in `SAFETY_EVENT door=D07 travel timeout LOCAL_INPUT_FAILURE` và motor dừng. Đây là cơ chế bảo vệ khi cửa kẹt, giải thích được, không phải lỗi.

**Câu nói:** "Panic nhả khóa cả hai cửa, bỏ qua liên động. Tiếp nhận cảnh báo chỉ ghi nhận, không xóa panic. Xóa cần nút đã nhả **và** người có quyền ra lệnh. Mất broker thì toàn bộ phản ứng này vẫn chạy trên ESP32; nhóm đã kiểm chứng ở lượt nghiệm thu."

### Demo 4 — Nhận hàng và giữ chỗ (≈ 60 giây)

Dashboard → trang **Nhận hàng**.

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | Xem khung **Sức chứa nhận hàng** | Tỷ lệ đang dùng của từng kho và khu đệm D |
| 2 | **Loại hàng** *Lạnh −22 đến −16°C (kho C)*, **Kích thước** *Vừa*, **Tải trọng** `800` → **Giữ chỗ** | Thành công, có mã vị trí `C-…`, hạn 15 phút; xuất hiện trong *Giữ chỗ gần đây* |
| 3 | Cùng loại, **Tải trọng** `2000` → **Giữ chỗ** | *Từ chối: không còn vị trí phù hợp nhiệt độ, kích thước và tải trọng.* (`NO_SUITABLE_SLOT`): ô lớn nhất chịu 1500 kg |
| 4 | Ở giữ chỗ bước 2, bấm **Hủy** | Vị trí được trả lại |

Từ chối vì **vượt 95%** (`CAPACITY_LIMIT`) cần đẩy kho gần đầy, nên không làm tay trên sân khấu. Chiếu ảnh slide 20 hoặc chạy cách B, kịch bản 4 (mục 6).

**Câu nói:** "Sức chứa tính cả vị trí đang chứa và đang giữ. Hai người giữ cùng lúc thì MySQL chặn bằng ràng buộc duy nhất, không chỉ bằng code."

### Demo thêm (khi còn thời gian)

**5a. Liên động hai cửa (≈ 20 giây)**
1. Gạt **D07 contact → HIGH** (D07 đang mở).
2. Đợi 2 s, bấm **Mở cửa** ở **D08** → *Bị từ chối: liên động hai cửa, cửa còn lại chưa đóng* (INTERLOCK_ACTIVE).
3. Gạt D07 contact về LOW.

**5b. Rèm quang làm cửa đảo chiều (≈ 30 giây)**
1. D07 mở (contact HIGH), không người, PIR không tín hiệu, beam HIGH.
2. Bấm **Đóng cửa** D07 → servo D07 bắt đầu quay về 0°.
3. **Ngay lập tức** gạt **D07 beam → LOW** (bị che).
4. Thấy servo quay ngược lại 90° và Serial `SAFETY_EVENT door=D07 closing reversed BEAM_BLOCKED`.
5. Gạt beam về HIGH.

**5c. Cửa mở lâu**
1. Để D07 mở (contact HIGH).
2. Sau **30 giây** LED *Đèn khẩn cấp* sáng và dashboard cảnh báo cửa mở lâu.
3. Sau **60 giây** buzzer kêu, mức nghiêm trọng.
4. Đóng lại (contact LOW): cảnh báo tự hết.

**5d. Nhật ký và CSV**
1. Bấm **Lịch sử / CSV**, chọn *Lệnh cửa*, bấm **Lọc**.
2. Thấy đủ các lệnh vừa demo kèm lý do từ chối.
3. Bấm **Xuất CSV** và mở bằng Excel: tiếng Việt hiển thị đúng.

---

## 6. Cách B — Demo tự động (dự phòng)

Dùng khi Wokwi không chạy được. Script dùng **FakeEdge** (ESP-C01 giả bằng Node), nên **phải dừng** Simulator Wokwi và `demo:warehouse` (T4) trước. Hai nguồn không được dùng chung tài khoản ESP-C01.

```powershell
npm.cmd run demo:scenarios -- --scenario=all
```

Hoặc từng kịch bản `--scenario=1` … `--scenario=4`. Kết quả mong đợi:

```text
M16 demo scenarios passed: 4 scenario(s), 20 steps.
```

| # | Kịch bản | Điểm phải thấy |
| --- | --- | --- |
| 1 | Ra/vào hợp lệ | Đóng khi còn người → *OCCUPIED*; ra hết → đóng *applied* |
| 2 | RFID 0 nhưng còn người | Cảnh báo lệch; đóng → *PRESENCE_DETECTED* |
| 3 | Khẩn cấp | Panic mở D07; tiếp nhận không xóa; đóng → *PANIC_ACTIVE*; nối lại không nhân đôi event |
| 4 | Kho đầy | Hai yêu cầu đồng thời: một 201, một 409 `CAPACITY_LIMIT`; không vượt 95% |

Mở dashboard cạnh terminal để thấy thay đổi. **Phải nói rõ:** "Đây là bản tự động với ESP giả lập bằng Node. Nghiệm thu firmware thật nhóm làm trên Wokwi, bằng chứng ở `docs/evidence/WOKWI-2026-10-13.md`."

Xong thì bật lại T4 và Wokwi.

---

## 7. Xử lý sự cố nhanh

| Hiện tượng | Nguyên nhân thường gặp | Xử lý (≤ 1 phút, không thì chuyển sang ảnh/cách B) |
| --- | --- | --- |
| ESP-C01 `stale`, Serial vẫn có `SENSOR_HEARTBEAT` | Gateway đã khởi động lại, Simulator giữ kết nối cũ | Đóng hẳn tab Wokwi → T5 chạy gateway → F1 **Wokwi: Start Simulator** |
| Serial `MQTT_RETRY` liên tục | Broker (T1) hoặc gateway (T5) chưa chạy | Bật T1, T5 rồi khởi động lại Simulator |
| Serial báo lỗi chứng chỉ | Chạy `infra:tls:setup` mà chưa build lại firmware | `npm.cmd run firmware:build`, Start Simulator lại |
| Nút điều khiển bị mờ | Chưa đăng nhập operator, hoặc ESP-C01 không `fresh` | Đăng nhập lại; xử lý dòng đầu |
| Lệnh bị `REVISION_MISMATCH` | Bấm ngay sau khi gạt/quẹt | Đợi 2–3 s rồi bấm lại |
| Lệnh bị `INPUT_UNKNOWN` | Số người chưa xác minh (vừa reboot / còn thẻ trong) | Quẹt OUT các thẻ còn trong, Presence LOW, đợi vài giây |
| Lệnh *hết hạn* (expired) | ESP không trả ACK trong 12 s | Kiểm Serial có `MQTT_ONLINE`; nếu không, xử lý dòng đầu |
| `409 DEVICE_NOT_LIVE` | Dữ liệu ESP-C01 cũ quá 10 s | Đúng thiết kế: backend không gửi lệnh theo dữ liệu cũ. Khôi phục kết nối rồi thử lại |
| Dashboard trắng/không kết nối | Backend (T2) hoặc Vite (T3) dừng | Xem cửa sổ T2/T3, chạy lại lệnh |
| Extension Wokwi bị kẹt | VS Code | F1 → **Developer: Reload Window** |

**Nguyên tắc:** không gỡ lỗi lâu trước giảng viên. Nói "Phần này nhóm đã ghi bằng chứng" và chuyển sang ảnh trong slide hoặc cách B.

---

## 8. Sau demo — trả trạng thái

1. Nhả hết panic (LOW). Nếu còn chốt thì bấm **Đặt lại khẩn cấp** cho cửa đó.
2. Presence LOW, beam HIGH, contact LOW (cửa đóng); quẹt OUT các thẻ còn trong.
3. Trang **Nhận hàng**: **Hủy** các giữ chỗ demo còn hiệu lực.
4. Kiểm tra cảnh báo đã *hết* khi điều kiện kết thúc. Cả 5 thiết bị `fresh`.
5. Tắt Wokwi Simulator trong VS Code, rồi nhấp đúp `close.bat` (hoặc Ctrl+C từng cửa sổ theo thứ tự ngược T5 → T1). **Không** reset cơ sở dữ liệu để dọn lịch sử.
