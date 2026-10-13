# Hướng dẫn demo KhoGuard

Làm theo từng bước để demo trực tiếp trước giảng viên. Đi kèm: [kịch bản thuyết trình](KICH_BAN_THUYET_TRINH.md) (slide 19–20), [checklist](CHECKLIST_DEMO.md), [câu hỏi ôn tập](CAU_HOI_ON_TAP.md). Cài đặt từ đầu xem [hướng dẫn cấu hình](HUONG_DAN_CAU_HINH.md).

**Hai cách demo:**

| Cách | Khi nào dùng | Nguồn ESP-C01 |
| --- | --- | --- |
| **A. Trực tiếp với Wokwi** (chính) | Buổi trình bày; người demo gõ Serial, gạt công tắc, bấm trên dashboard | Firmware ESP32 thật trên Wokwi |
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

**Cách nhanh:** nhấp đúp `run.bat` ở thư mục gốc dự án. Script mở 5 cửa sổ dưới đây theo đúng thứ tự, chờ từng cổng sẵn sàng, mở VS Code thư mục `firmware` và trình duyệt. Phần nào đang chạy thì bỏ qua. Sau đó chỉ còn bấm **F1 → Wokwi: Start Simulator** và đăng nhập.

| Lệnh | Tác dụng |
| --- | --- |
| `run.bat` | Đầy đủ, ESP-C01 chạy trên Wokwi (mặc định) |
| `run.bat fake` | ESP-C01 giả lập bằng Node (cách B). **Không** mở Wokwi cùng lúc |
| `run.bat web` | Chỉ broker, backend, dashboard và các khu mô phỏng |
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
| T4 — Các khu mô phỏng | `npm.cmd run demo:warehouse -- --seed=17` | Gửi dữ liệu SIM-A01, SIM-B01, SIM-C02, SIM-D01 |
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

**Mở dashboard:**

1. Trình duyệt mở <http://127.0.0.1:5173>.
2. Góc trên: **Nguồn dữ liệu → Backend / MQTT** (không dùng *Demo giao diện*).
3. Đăng nhập `operator`.
4. Thanh bên có *Backend đã kết nối* và *MQTT đã kết nối*; cả **5 thiết bị `fresh`**; ESP-C01 có nhãn nguồn Wokwi.

**Kiểm nhanh (tùy chọn):** `npm.cmd run firmware:check -- <boot-ID trên Serial>` phải báo `PASS` và đúng boot ID đó.

---

## 3. Trạng thái nền trước khi demo

Trên mạch Wokwi, mỗi công tắc có nhãn ghi nghĩa của mức HIGH. Đặt như sau:

| Công tắc | Mức | Ý nghĩa |
| --- | --- | --- |
| `D07 contact`, `D08 contact` | **LOW** | Hai cửa đóng |
| `D07 beam`, `D08 beam` | **HIGH** | Rèm quang thông |
| `D07 panic`, `D08 panic` | **LOW** | Không khẩn cấp |
| `Presence` | **LOW** | Không thấy người |

Kết quả cần có:

- **LED:** hai LED *khóa* xanh sáng, *Quạt* sáng; motor, đèn, còi, sưởi tắt.
- **Dashboard khu C:** **0 người (đã xác minh)**, D07/D08 *Đóng · Đã khóa*.
- **Nếu số người là "chưa xác minh"** (vừa reboot hoặc còn thẻ ở trong): gõ `RFID D07 DEMO-017 OUT` / `RFID D07 DEMO-018 OUT` cho thẻ còn trong, giữ Presence LOW, chờ vài giây.

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

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | Serial Monitor gõ `RFID D07 DEMO-017 IN` + Enter | Serial: `RFID_EVENT door=D07 card=DEMO-017 dir=in result=0 count=1 verified=1`. Dashboard khu C: **1 người** |
| 2 | Gõ lại `RFID D07 DEMO-017 IN` | `result=1` (duplicate), **vẫn 1 người** |
| 3 | (Tùy chọn) gõ `RFID D07 DEMO-999 IN` | `result=2` (unauthorized), số người không đổi; Nhật ký vẫn ghi thẻ bị từ chối |
| 4 | Đợi 2 s, dashboard D07 bấm **Đóng cửa** | Dashboard: *Bị từ chối: RFID còn người trong kho* (OCCUPIED). Serial: `COMMAND … D07 close -> OCCUPIED` |
| 5 | Gõ `RFID D07 DEMO-017 OUT` | `count=0 verified=1`. Dashboard: **0 người** |

**Câu nói:** "Đọc lặp không tăng số người. Còn người thì chính ESP32 từ chối đóng, kể cả khi lệnh tới từ dashboard."

### Demo 2 — RFID báo 0 người nhưng cảm biến vẫn thấy người (≈ 30 giây)

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | Gạt **Presence → HIGH** | Dashboard: cảnh báo *RFID báo 0 người nhưng mmWave còn tín hiệu ở khu C* |
| 2 | Đợi 2 s, D07 bấm **Đóng cửa** | *Bị từ chối: mmWave còn phát hiện người trong kho* (PRESENCE_DETECTED) |
| 3 | Gạt **Presence → LOW** | Cảnh báo tự hết sau một chu kỳ |

**Câu nói:** "RFID có thể sai, ví dụ người đi theo không quẹt thẻ. Hai nguồn độc lập phải cùng nói *không có người* mới được đóng."

### Demo 3 — Khẩn cấp (panic) và đặt lại (≈ 90 giây)

Bắt đầu với cửa D07 **đóng**.

| # | Làm | Thấy |
| --- | --- | --- |
| 1 | Gạt **D07 panic → HIGH** | **LED:** *khóa* D07 và D08 tắt; *D07 motor mở* sáng; *Đèn*, *Còi*, *Sưởi* sáng; *Quạt* tắt. **Serial:** `INPUT_EVENT door=D07 panic=1 …` và dòng `OUTPUTS …`. **Dashboard:** cảnh báo khẩn cấp, D07 *Khẩn cấp đang chốt* |
| 2 | Trong **10 giây**, gạt **D07 contact → HIGH** (cửa đã mở tới nơi) | *D07 motor mở* tắt, D07 hiện *Mở · Không khóa* |
| 3 | Gạt **D07 panic → LOW** (nhả nút) | Panic **vẫn chốt**: đèn, còi, sưởi vẫn sáng |
| 4 | Ở cảnh báo khẩn cấp, bấm **Tiếp nhận** | Hiện *Đã tiếp nhận* nhưng D07 **vẫn** *Khẩn cấp đang chốt* |
| 5 | D07 bấm **Đóng cửa** | *Bị từ chối: nút khẩn cấp đang chốt hoặc chưa nhả* (PANIC_ACTIVE) |
| 6 | Đợi 2 s, D07 bấm **Đặt lại khẩn cấp** | *Đã áp dụng tại thiết bị*. Sưởi tắt, quạt sáng lại. Đèn/còi có thể **vẫn sáng** nếu D07 đã mở quá 30/60 s: đó là cảnh báo cửa mở lâu, sẽ tắt khi đóng cửa |
| 7 | Đợi 2 s, D07 bấm **Đóng cửa** | *Đã áp dụng tại thiết bị*, LED *D07 motor đóng* sáng, D07 *Đang đóng* |
| 8 | Trong **10 giây**, gạt **D07 contact → LOW** | Motor tắt, *khóa D07* sáng lại, đèn/còi tắt; dashboard *Đóng · Đã khóa* |

**Lưu ý:**
- Nếu bấm **Đặt lại khẩn cấp** khi panic còn HIGH, lệnh bị từ chối (PANIC_ACTIVE). Có thể làm cố ý để chứng minh nút phải được nhả trước.
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
1. D07 mở (contact HIGH), không người, presence LOW, beam HIGH.
2. Bấm **Đóng cửa** D07 → *D07 motor đóng* sáng.
3. **Ngay lập tức** gạt **D07 beam → LOW** (bị che).
4. Thấy Serial `SAFETY_EVENT door=D07 closing reversed BEAM_BLOCKED`, motor đóng tắt.
5. Gạt beam về HIGH.

**5c. Cửa mở lâu**
1. Để D07 mở (contact HIGH).
2. Sau **30 giây** LED *Đèn khẩn cấp* sáng và dashboard cảnh báo cửa mở lâu.
3. Sau **60 giây** *Còi* sáng, mức nghiêm trọng.
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
