# Kịch bản thuyết trình — KhoGuard

**Dùng kèm:** `docs/slides/KhoGuard-thuyet-trinh.pptx` (28 slide) và nội dung gốc [NOI_DUNG_SLIDE.md](NOI_DUNG_SLIDE.md).  
**Thời lượng:** khoảng 22 phút, trong đó demo trực tiếp chừng 3 phút; còn 5–10 phút cho hỏi đáp.  
**Câu hỏi ôn tập phản biện:** [CAU_HOI_ON_TAP.md](CAU_HOI_ON_TAP.md).  
**Thao tác demo chi tiết:** [HUONG_DAN_DEMO.md](HUONG_DAN_DEMO.md).

## Cách dùng kịch bản

- Mỗi slide có: **thời gian**, **lời nói** (đọc tự nhiên, không cần thuộc từng chữ), **thao tác** (bấm, chỉ hình, chuyển tab) và **câu chuyển** sang slide sau.
- Chữ **in đậm** trong lời nói là ý bắt buộc phải nói; phần còn lại có thể rút gọn khi thiếu giờ.
- Ký hiệu: ▶ thao tác, ⏱ thời gian, ↪ câu chuyển.
- Nếu nhóm 3 người, gợi ý chia: **Người 1** slide 01–06, **Người 2** slide 07–18, **Người 3** slide 19–28 và điều phối hỏi đáp. Người chuyển lượt nói một câu nối, không đứng im chờ.

## Chuẩn bị 15 phút trước giờ

Theo [CHECKLIST_DEMO.md](CHECKLIST_DEMO.md), tóm tắt:

1. MySQL, broker dự án (18884/18885), backend 3001, Vite 5173, gateway Wokwi 9011, `demo:warehouse` đều chạy.
2. Mở Wokwi Simulator, đăng nhập dashboard bằng tài khoản **operator**, cả 5 thiết bị hiển thị `fresh`.
3. Trạng thái nền: không bấm nút panic, cửa D07/D08 đóng, beam clear, PIR không tín hiệu, công tắc *Chiều quẹt* ở HIGH (vào), không có thẻ ở trong.
4. Sắp sẵn 3 cửa sổ: PowerPoint (trình chiếu), trình duyệt trang **Giám sát cửa**, VS Code tab **Wokwi** + Serial Monitor.
5. Dán sẵn vào clipboard/ghi chú: `RFID D07 DEMO-017 IN` và `RFID D07 DEMO-017 OUT`.
6. **Phương án dự phòng:** nếu Wokwi hoặc broker trục trặc, không sửa trên sân khấu — dùng ảnh trong slide 19–22 và nói rõ đó là ảnh bằng chứng từ lượt nghiệm thu ngày 13/10/2026.

---

## Mở đầu (⏱ ~1 phút 15)

### Slide 01 — KhoGuard (⏱ 0:45)

**Lời nói:**
> Kính chào thầy/cô và các bạn. Nhóm 17 xin trình bày đề tài 42: **KhoGuard — hệ thống IoT mô phỏng giám sát kho hàng và an toàn kho lạnh**.
> Mô hình của nhóm quản lý **4 khu vực, 12 cửa**, theo dõi nhiệt độ, độ ẩm, số người và trạng thái cửa. Trọng tâm của đề tài là **bảo vệ người làm việc trong kho lạnh**: quyết định an toàn được đưa xuống ngay tại thiết bị ESP32, không phụ thuộc mạng hay máy chủ.
> Toàn bộ chạy mô phỏng: ESP32 trên Wokwi, lập trình bằng PlatformIO, truyền qua MQTT, lưu MySQL và hiển thị trên giao diện React.

▶ Chỉ vào sơ đồ 4 khu, dừng ở khu C.  
↪ "Bài trình bày gồm năm phần."

### Slide 02 — Nội dung trình bày (⏱ 0:30)

**Lời nói:**
> Nhóm đi theo năm phần: khảo sát và thiết kế tổng thể; thiết kế an toàn kho lạnh; triển khai; demo và kết quả kiểm thử; cuối cùng là giới hạn và hướng phát triển.
> Hai phần đầu bám theo tài liệu thiết kế của nhóm; ba phần sau là những gì **đã chạy được và có bằng chứng**.

↪ "Trước hết, vì sao kho hàng cần IoT?"

---

## Chương 1 — Khảo sát và thiết kế (⏱ ~3 phút)

### Slide 03 — Vì sao cần giám sát kho bằng IoT? (⏱ 0:45)

**Lời nói:**
> Một kho có nhiều cửa, nhiều khu thì rất khó theo dõi bằng tay. Có bốn vấn đề chính:
> một là **cửa mở lâu** làm thất thoát nhiệt, ảnh hưởng hàng bảo quản;
> hai là thông tin ra vào, môi trường, sức chứa **nằm rời rạc** ở nhiều nơi;
> ba là phải kiểm soát **sức chứa** trước khi nhận hàng;
> và quan trọng nhất, ở kho lạnh phải biết **còn ai bên trong không** trước khi đóng cửa, và xử lý được khi có người bấm khẩn cấp.

▶ Khoanh khu C và hai cửa D07/D08 trên hình.  
↪ "Từ các vấn đề đó, nhóm đặt ra mục tiêu chức năng."

### Slide 04 — Mục tiêu và nhóm chức năng (⏱ 0:45)

**Lời nói:**
> Hệ thống có năm nhóm chức năng: giám sát cửa và môi trường theo khu; kiểm soát ra vào bằng RFID có đối chiếu ca làm; **chặn đóng cửa khi còn người, có vật cản hoặc tín hiệu chưa rõ**; cảnh báo và lưu lịch sử; và kiểm tra sức chứa, giữ vị trí trước khi nhận hàng.
> Đây là giao diện giám sát. Lưu ý: giao diện chỉ **hiển thị và gửi yêu cầu**; quyết định có đóng cửa hay không là của **firmware ESP32**.

↪ "Phạm vi mô hình cụ thể như sau."

### Slide 05 — Phạm vi: 4 khu, 12 cửa (⏱ 0:45)

**Lời nói:**
> Kho có bốn khu: A kho thường, B kho mát, C kho lạnh âm 22 đến âm 16 độ, D khu đệm. Mỗi khu ba cửa, tổng 12 cửa.
> Có **5 thiết bị**: **ESP-C01 là ESP32 thật chạy trên Wokwi**, điều khiển hai cửa D07, D08 của kho lạnh; bốn thiết bị còn lại là script Node mô phỏng, trong đó D09 do script SIM-C02 quản lý.
> Các dải nhiệt độ là cấu hình của mô hình, không phải tiêu chuẩn cho mọi loại hàng.

↪ "Về kiến trúc, nhóm thiết kế theo mô hình IoT bốn tầng."

### Slide 06 — Kiến trúc IoT 4 tầng (⏱ 0:45)

**Lời nói:**
> Tầng **thu thập và chấp hành**: cảm biến, RFID, công tắc cửa, đèn còi.
> Tầng **mạng**: gateway và bản tin MQTT có mã hóa TLS.
> Tầng **máy chủ**: broker Mosquitto, backend Node.js và MySQL.
> Tầng **ứng dụng**: dashboard giám sát, điều khiển, lịch sử, báo cáo.
> Tài liệu thiết kế có đề xuất mạng công nghiệp, VLAN; trong bản demo, nhóm dùng gateway Wokwi và dịch vụ chạy trên máy để kiểm chứng luồng xử lý.

↪ "Phần quan trọng nhất là thiết kế an toàn cho kho lạnh."

---

## Chương 2 — Thiết kế an toàn kho lạnh (⏱ ~5 phút)

### Slide 07 — Các tín hiệu cần theo dõi (⏱ 0:45)

**Lời nói:**
> Firmware đọc bảy đầu vào: mỗi cửa có **công tắc vị trí (contact), rèm quang (beam) và nút panic**; cộng một cảm biến **hiện diện mmWave** dùng chung. Nhiệt ẩm đo bằng DHT22.
> Trên Wokwi, thẻ được quẹt qua **đầu đọc RFID MFRC522** đặt ở cửa D07, có công tắc chọn chiều vào/ra. Hiện diện dùng **cảm biến PIR**; vì PIR chỉ bắt chuyển động, thiết kế thật dùng radar mmWave. Khóa cửa là **relay**, cánh cửa là **servo**, còi là **buzzer**; đèn, sưởi, quạt là LED.
> Mọi tín hiệu đều được **chống dội 30 ms**; trước khi ổn định, firmware coi tín hiệu là **chưa rõ** chứ không coi là an toàn.

↪ "Với các tín hiệu đó, quy tắc đóng cửa là…"

### Slide 08 — Chỉ đóng khi mọi điều kiện an toàn (⏱ 1:00)

**Lời nói:**
> Đây là quy tắc cốt lõi: **Cho phép đóng = số người đã xác minh bằng 0 VÀ không hiện diện VÀ rèm quang thông**.
> Firmware kiểm theo thứ tự: có panic thì từ chối; tín hiệu nào chưa rõ thì từ chối với lý do `INPUT_UNKNOWN`; còn người thì `OCCUPIED`; mmWave thấy người thì `PRESENCE_DETECTED`; rèm bị che thì `BEAM_BLOCKED`.
> Điểm nhóm muốn nhấn mạnh: **"chưa biết" luôn bị xử lý như "không an toàn"**. Và nếu đang đóng mà điều kiện mất đi — ví dụ có người bước vào rèm — cửa **tự đảo chiều mở lại**.

▶ Chỉ lần lượt các nhánh trên sơ đồ, dừng lâu ở nhánh "chưa rõ → từ chối".  
↪ "Vậy làm sao biết số người?"

### Slide 09 — RFID và hiện diện kiểm tra chéo (⏱ 0:50)

**Lời nói:**
> Mỗi thẻ hợp lệ quét vào thì số người tăng, quét ra thì giảm. Firmware nhớ **từng thẻ đang ở trong hay ngoài**, nên quét lặp không tăng thêm, và ra mà chưa vào thì không làm số âm. Thẻ không hợp lệ bị từ chối nhưng **vẫn được ghi nhật ký**.
> RFID có thể sai, nên nhóm **kiểm tra chéo với mmWave**: số người bằng 0 mà mmWave vẫn thấy người thì vẫn chặn đóng.
> Sau khi khởi động lại, ESP32 không biết ai đang ở trong, nên số người là **"chưa xác minh"** và gửi lên là `null`, **không gửi số 0**. Chỉ khi mmWave thông và không còn thẻ nào bên trong thì mới xác minh lại bằng 0.

↪ "Kho lạnh có hai cửa nên cần liên động."

### Slide 10 — Liên động hai cửa và cảnh báo mở lâu (⏱ 0:50)

**Lời nói:**
> Ở chế độ bình thường, **chỉ được mở một cửa khi cửa còn lại đã đóng và đứng yên** — để hạn chế thất thoát lạnh. Vi phạm thì lệnh mở bị từ chối `INTERLOCK_ACTIVE`.
> Cửa mở từ **30 giây** thì bật đèn cảnh báo; quá **60 giây** thì nâng lên mức nghiêm trọng và bật còi. Các bộ đếm này chạy **ngay trên ESP32**, nên mất mạng vẫn đếm.
> Nhưng **khi có panic, liên động bị bỏ qua**: cứu người ưu tiên hơn giữ nhiệt.

↪ "Cụ thể phản ứng khẩn cấp như sau."

### Slide 11 — Xử lý khẩn cấp tại thiết bị (⏱ 0:50)

**Lời nói:**
> Khi bấm panic: **nhả khóa cả hai cửa, yêu cầu mở cửa, bật đèn, còi, sưởi và tắt quạt lạnh**.
> Panic được **chốt**: nhả nút không tự xóa. Muốn xóa phải nhả nút **và** người vận hành gửi lệnh reset. Bấm "tiếp nhận cảnh báo" trên giao diện **không** xóa panic.
> Nếu mmWave thấy người trong khi **hai cửa đều đóng quá 5 phút**, hệ thống coi là **nghi người mắc kẹt**: báo động `TRAPPED_PERSON`, bật đèn, còi, sưởi và tắt quạt như khi khẩn cấp.
> Tất cả chạy cục bộ — **mất broker thì vẫn phản ứng**. Ngoài thực tế cần thêm chốt thoát hiểm cơ học và relay an toàn độc lập; mô hình chưa có phần này.

↪ "Ngoài an toàn người, hệ thống còn kiểm soát sức chứa."

### Slide 12 — Kiểm soát sức chứa trước khi nhận hàng (⏱ 0:50)

**Lời nói:**
> Khi có lô hàng đến, hệ thống tìm vị trí **phù hợp nhiệt độ, kích thước và tải trọng**, chọn ô vừa nhất.
> Sức chứa tính bằng **vị trí đang chứa cộng vị trí đang giữ**. Từ 85% thì cảnh báo; nếu giữ thêm làm **vượt 95% thì từ chối**. Khu đệm từ 95% thì dừng nhận dù kho còn chỗ.
> Giữ chỗ có hạn **15 phút**. MySQL có **ràng buộc duy nhất** nên hai yêu cầu cùng lúc không thể giữ trùng một ô.
> Ngưỡng tính bằng số nguyên trên dữ liệu thật, không dùng số phần trăm đã làm tròn trên giao diện.

↪ "Đó là phần thiết kế. Tiếp theo là cách nhóm triển khai."

---

## Chương 3 — Triển khai (⏱ ~4 phút 30)

### Slide 13 — Công cụ và công nghệ (⏱ 0:40)

**Lời nói:**
> Firmware viết bằng **C++ trên ESP32, build bằng PlatformIO**, chạy trên **Wokwi**. Các khu còn lại mô phỏng bằng script Node.
> Truyền thông dùng **Mosquitto với MQTT/TLS**. Máy chủ là **Node.js**, dữ liệu ở **MySQL**, giao diện **React + Vite**.
> Về tổ chức firmware: toàn bộ quy tắc an toàn nằm trong một file `controller.h` thuần C++, **test được trên máy tính** mà không cần phần cứng; phần đọc chân, mạng, MQTT tách thành thư viện `lib/khoguard`, và `main.cpp` chỉ gọi thư viện.

↪ "Dữ liệu và lệnh đi qua hệ thống như sau."

### Slide 14 — Luồng dữ liệu và điều khiển (⏱ 1:00)

**Lời nói:**
> Chiều lên: ESP32 và các script gửi **telemetry mỗi 2 giây** qua MQTT/TLS tới broker. Backend **kiểm tra bản tin theo JSON Schema**, lưu MySQL, rồi đẩy lên giao diện qua **WebSocket**.
> Chiều xuống: người vận hành bấm "Đóng D07" → backend tạo lệnh có **hạn 10 giây**, gắn với **phiên hiện tại của thiết bị** và **số phiên bản trạng thái** mà người đó đang nhìn → ESP32 tự kiểm tra lại toàn bộ điều kiện an toàn → trả **ACK áp dụng hoặc từ chối kèm lý do**.
> Điểm quan trọng: **API trả 202 chỉ nghĩa là đã nhận yêu cầu**, không có nghĩa cửa đã đóng. Bằng chứng là ACK và telemetry từ thiết bị.

▶ Đi theo mũi tên trên sơ đồ tuần tự.  
↪ "Dữ liệu được lưu như thế nào?"

### Slide 15 — MySQL (⏱ 0:45)

**Lời nói:**
> MySQL lưu: cấu trúc kho, thiết bị, trạng thái hiện tại, lịch sử telemetry; sự kiện RFID, cảnh báo, lệnh cửa; tài khoản, phiên đăng nhập, ca làm, giữ chỗ.
> Nhóm dùng **transaction và khóa duy nhất** để không lưu trùng — ví dụ telemetry duy nhất theo thiết bị, lần khởi động và số thứ tự — và không giữ trùng vị trí.
> Nhóm chọn MySQL vì dữ liệu **có quan hệ rõ ràng** và nghiệp vụ nhận hàng cần **tính nhất quán**.

↪ "Người vận hành nhìn thấy gì?"

### Slide 16 — Dashboard (⏱ 0:45)

**Lời nói:**
> Dashboard tiếng Việt có sáu trang: Tổng quan, Sơ đồ kho, Giám sát cửa, Môi trường, Nhận hàng, Nhật ký.
> Mỗi số liệu đều ghi **nguồn** — Wokwi hay script — và **độ mới**: mới, cũ hoặc chưa rõ. Dữ liệu quá **10 giây** được coi là cũ: vẫn xem được để tra cứu nhưng **không được dùng để gửi lệnh đóng**.
> Lệnh cửa hiển thị các trạng thái: chờ, đã áp dụng, bị từ chối, hết hạn.

↪ "Về phân quyền và bảo mật…"

### Slide 17 — Phân quyền, lịch ca, bảo mật (⏱ 0:45)

**Lời nói:**
> Ba vai trò: **viewer** chỉ xem, **operator** được điều khiển và nhận hàng, **admin** xem thêm nhật ký đăng nhập. Quyền được **kiểm tra ở backend**, không chỉ ẩn nút trên giao diện.
> Quẹt RFID được đối chiếu với lịch ca; ngoài ca thì **ghi nhận để kiểm tra**, nhưng **không bao giờ chặn người đi ra**.
> Mỗi thiết bị có **tài khoản MQTT riêng và ACL**, chỉ được gửi lên đúng topic của mình. Kết nối dùng TLS có **xác minh chứng chỉ và tên máy**. Mật khẩu, khóa nằm ngoài mã nguồn.

↪ "Cuối cùng là truy vết."

### Slide 18 — Nhật ký và báo cáo (⏱ 0:30)

**Lời nói:**
> Có thể tra cứu sự kiện, cảnh báo, lệnh cửa, giữ chỗ; lọc theo thời gian, khu và loại; xuất **CSV UTF-8** mở được trong Excel, có **chặn chèn công thức** độc hại.
> "Tiếp nhận cảnh báo" chỉ ghi lại rằng người vận hành đã biết; **nó không làm sự cố biến mất**.

↪ "Bây giờ nhóm xin demo trực tiếp."

---

## Chương 4 — Demo và kết quả (⏱ ~6 phút 30)

### Slide 19 — Demo 1–2: Ra/vào và kiểm tra chéo (⏱ 1:30)

**Lời nói mở:**
> Nhóm demo trên ESP32 đang chạy Wokwi, bên phải là dashboard đang kết nối thật.

▶ **Thao tác (vừa làm vừa nói):**

1. Chuyển sang Wokwi, bấm vào đầu đọc RFID, chọn **thẻ Xanh dương** (DEMO-017), bấm **Tap**.
   > "Có một người vào. Serial báo `RFID_EVENT … count=1`, dashboard số người khu C lên 1."
2. Bấm **Tap** lần nữa.
   > "Quét lặp — kết quả `duplicate`, số người **vẫn là 1**."
3. Trên dashboard bấm **Đóng D07**.
   > "Lệnh bị từ chối, lý do **OCCUPIED** — còn người bên trong."
4. Gạt công tắc *Chiều quẹt* sang LOW (ra), **Tap** thẻ Xanh dương, gạt lại HIGH.
   > "Người đi ra, số người về 0 và đã xác minh."
5. Bấm vào **PIR** → **Simulate Motion**, rồi bấm **Đóng D07** trong vòng 10 giây.
   > "RFID nói 0 người, nhưng cảm biến vẫn thấy có người — lệnh bị từ chối **PRESENCE_DETECTED**."
6. Không cần làm gì: PIR tự hết tín hiệu sau 10 giây.

↪ "Tình huống tiếp theo là khẩn cấp."

### Slide 20 — Demo 3–4: Panic và từ chối nhận hàng (⏱ 1:30)

▶ **Thao tác:**

1. Trên Wokwi bấm **nút đỏ D07 PANIC**.
   > "Hai relay khóa nhả, servo D07 mở cửa ra, đèn và sưởi bật, buzzer kêu, quạt tắt. Dashboard hiện cảnh báo panic."
   ▶ Trong 10 giây gạt **D07 contact → HIGH** để cửa "tới nơi" (các bước đầy đủ ở [HUONG_DAN_DEMO.md](HUONG_DAN_DEMO.md#demo-3--khẩn-cấp-panic-và-đặt-lại--90-giây)).
2. Nút panic đã tự nhả sau khi bấm.
   > "Nhả nút nhưng **panic vẫn chốt**. Phải có operator gửi lệnh reset."
3. (Nếu còn thời gian) bấm **Tiếp nhận cảnh báo** để chứng minh panic không mất, rồi gửi **Reset panic**.

**Lời nói:**
> Trường hợp **mất broker**, nhóm đã thử ở lượt nghiệm thu: dừng broker, bấm panic — **ESP32 vẫn phản ứng đầy đủ**, Serial ghi lại mức đầu ra; khi broker bật lại, sự kiện được gửi lên.
> Với nhận hàng: yêu cầu giữ chỗ làm vượt ngưỡng 95% hoặc không có ô phù hợp sẽ **bị từ chối** — như ảnh bên phải.

> ⚠️ Không dừng broker trên sân khấu. Nói theo bằng chứng [WOKWI-2026-10-13.md](evidence/WOKWI-2026-10-13.md).

↪ "Ngoài các tình huống bình thường, nhóm thử cả những tình huống lỗi."

### Slide 21 — Tín hiệu chưa rõ và dữ liệu cũ (⏱ 0:50)

**Lời nói:**
> Khi rèm quang, mmWave hoặc công tắc cửa **chưa xác nhận**, firmware từ chối đóng với `INPUT_UNKNOWN`. Dòng RFID bị hỏng, quá dài thì số người chuyển sang chưa xác minh và tiếp tục chặn.
> Ở phía máy chủ, nếu telemetry của thiết bị **cũ quá 10 giây**, backend trả **409 DEVICE_NOT_LIVE** và **không gửi lệnh** xuống — vì người vận hành đang nhìn dữ liệu cũ.
> Các lỗi đầu vào này nhóm tạo bằng một bản firmware kiểm thử riêng trên Wokwi, **`controller.h` giữ nguyên từng byte**.

↪ "Hai tình huống khó hơn là khởi động lại và chứng chỉ sai."

### Slide 22 — Reboot và chứng chỉ sai (⏱ 0:50)

**Lời nói:**
> Nhóm khởi động lại ESP32 thật bằng `ESP.restart()`: **mã boot đổi**, số người trở về **chưa xác minh**; nếu mmWave vẫn thấy người thì lệnh đóng bị `INPUT_UNKNOWN`. Lệnh của phiên cũ **không bao giờ chạy** sau reboot.
> Với TLS: cho ESP32 dùng **CA sai** hoặc kiểm **sai tên máy** — chính ESP32 từ chối kết nối, không gửi telemetry. Nạp lại cấu hình đúng thì kết nối lại được.
> Đây là kiểm thử **trên ESP32 Wokwi**, không chỉ bằng client Node.

↪ "Tổng hợp kết quả kiểm thử."

### Slide 23 — Kết quả kiểm thử (⏱ 0:50)

**Lời nói:**
> **109 trên 109** unit test JavaScript đạt. Hai bộ test C++ của quy tắc an toàn đạt. Kiểm thử bổ sung trên Wokwi **9 trên 9 nhóm** đạt.
> Thử tải với **50 nguồn ảo**: lưu đủ **2.000 trên 2.000** bản tin. Độ trễ từ lúc thiết bị gửi tới WebSocket có **P95 là 211 ms**.
> Nhóm nói rõ giới hạn: 50 nguồn ảo dồn qua 5 tài khoản thiết bị, không phải 50 thiết bị thật; 211 ms là tới WebSocket, **chưa đo tới lúc vẽ lên màn hình**.

↪ "Kiểm thử cũng giúp nhóm tìm ra lỗi thật."

### Slide 24 — Lỗi phát hiện và khắc phục (⏱ 0:50)

**Lời nói:**
> Lỗi thứ nhất: khi từ chối một lệnh tới thiết bị dữ liệu cũ, backend xử lý như lỗi cơ sở dữ liệu nên **xóa xác nhận phiên của mọi thiết bị** — cả kho bỗng thành "cũ". Nhóm tách lỗi nghiệp vụ khỏi lỗi MySQL và viết test hồi quy.
> Lỗi thứ hai: khi MySQL bị khóa, có bản tin bị **báo đã nhận cho broker nhưng chưa lưu**, nên mất. Nhóm sửa để **không xác nhận khi chưa lưu**. Thử khóa bảng 9,5 giây: hệ thống báo chưa sẵn sàng, nhả khóa thì **3 bản tin tồn đọng được lưu đúng một lần** sau 418 ms.

↪ "Xin chuyển sang phần kết luận."

---

## Chương 5 — Kết luận (⏱ ~2 phút 10)

### Slide 25 — Kết quả đạt được (⏱ 0:40)

**Lời nói:**
> Nhóm đã dựng được **luồng IoT đầy đủ** từ ESP32 qua MQTT, backend, MySQL tới giao diện; giám sát 4 khu, 12 cửa; kiểm chứng chặn đóng, liên động, panic, bộ đếm thời gian và **phản ứng khi mất mạng**; có phân quyền, nhận hàng, nhật ký, xuất CSV. Mỗi kết quả đều có **báo cáo bằng chứng** đi kèm.

### Slide 26 — Giới hạn (⏱ 0:40)

**Lời nói:**
> Nhóm cũng nói rõ giới hạn: cảm biến, cửa, đầu ra **đều mô phỏng**; chưa có camera nhiệt, CO₂, relay an toàn hay chốt thoát hiểm thật; chưa kết nối WMS hay truy vết pallet. Còn hai việc chưa xong: **đo độ trễ tới màn hình** và **bàn giao để người khác chạy lại** trên máy khác.
> Mô hình **không được xem là hệ thống an toàn đã chứng nhận**.

### Slide 27 — Hướng phát triển (⏱ 0:30)

**Lời nói:**
> Bước tiếp theo: hoàn tất phép đo và bàn giao; thử trên phần cứng thật; tích hợp WMS và RFID cho hàng hóa; triển khai HTTPS khi mở ra ngoài máy cục bộ; và đánh giá cảm biến bổ sung bằng dữ liệu thực tế.

### Slide 28 — Cảm ơn (⏱ 0:20)

**Lời nói:**
> Phần trình bày của nhóm 17 đến đây là hết. Cảm ơn thầy/cô và các bạn đã lắng nghe. Nhóm sẵn sàng demo thêm và nhận câu hỏi.

▶ Giữ slide này; để dashboard và Wokwi mở sẵn ở cửa sổ phía sau.

---

## Khi bị thiếu hoặc dư thời gian

| Tình huống | Cách xử lý |
| --- | --- |
| Còn < 15 phút | Dùng bản rút gọn 15 slide trong [NOI_DUNG_SLIDE.md](NOI_DUNG_SLIDE.md#gợi-ý-rút-gọn-còn-15-slide); demo chỉ làm bước 1, 3, 4 của slide 19 và bước 1 của slide 20. |
| Demo lỗi | Nói: "Phần này nhóm đã ghi bằng chứng ở lượt nghiệm thu" → chuyển sang ảnh trên slide, không gỡ lỗi trước hội đồng. |
| Dashboard báo `stale` | ESP chưa gửi telemetry mới: kiểm tra gateway; nếu không kịp, demo bằng Serial Monitor (vẫn thấy `RFID_EVENT`, `OUTPUTS`, `COMMAND`). |
| Dư thời gian | Demo thêm rèm quang: bấm Đóng D07 rồi gạt beam → cửa tự đảo chiều, Serial in `SAFETY_EVENT … closing reversed BEAM_BLOCKED`. |

## Sau buổi trình bày

Trả trạng thái nền theo mục "Sau demo" trong [CHECKLIST_DEMO.md](CHECKLIST_DEMO.md): reset panic, chờ PIR hết tín hiệu, beam clear, hủy giữ chỗ demo.
