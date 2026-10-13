# KhoGuard

**Hệ thống IoT mô phỏng giám sát kho hàng có kho lạnh**: 4 khu, 12 cửa, nhiệt độ/độ ẩm, đếm người bằng RFID, bảo vệ người trong kho lạnh (không đóng cửa khi còn người, nút khẩn cấp mở cửa ngay cả khi mất mạng), cảnh báo, điều khiển cửa có xác nhận, giữ chỗ nhận hàng theo sức chứa, lịch sử và xuất CSV.

Đồ án môn Internet of Things — Nhóm 17. Không có phần cứng thật: ESP32 chạy trong **Wokwi** (lập trình bằng **PlatformIO** trong VS Code), các khu còn lại do **script Node** giả lập. Toàn bộ chạy trên một máy Windows, chỉ ở `127.0.0.1`.

```text
ESP32 trên Wokwi (khu C) ──MQTT/TLS──┐
                                      ├── Mosquitto riêng ── Backend Node ── MySQL
Script Node giả lập (khu A, B, C, D) ─┘     :18884/:18885      :3001          khoguard_demo
                                                                 │
                                                        REST + WebSocket
                                                                 │
                                                  Dashboard React (Vite :5173)
```

> Muốn hiểu sâu từng thành phần, luồng dữ liệu, bảng DB và lý do thiết kế: đọc **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Mục lục

- [Tính năng](#tính-năng)
- [Trạng thái hiện tại](#trạng-thái-hiện-tại)
- [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
- [Chạy nhanh](#chạy-nhanh)
- [Sử dụng dashboard](#sử-dụng-dashboard)
- [Thao tác với ESP32 trên Wokwi](#thao-tác-với-esp32-trên-wokwi)
- [Danh sách lệnh](#danh-sách-lệnh)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [Kiểm thử](#kiểm-thử)
- [Bảo mật và secret](#bảo-mật-và-secret)
- [Xử lý lỗi thường gặp](#xử-lý-lỗi-thường-gặp)
- [Giới hạn](#giới-hạn)
- [Tài liệu](#tài-liệu)

---

## Tính năng

| Nhóm | Có gì |
| --- | --- |
| **Giám sát** | Sơ đồ 4 khu, trạng thái 12 cửa (mở/đóng/đang chạy/khóa), nhiệt độ – độ ẩm theo ngưỡng từng khu, nguồn dữ liệu từng thiết bị (*Wokwi* hay *Node mô phỏng*), độ mới dữ liệu (*mới / cũ / chưa có*) |
| **An toàn cửa (tại ESP32)** | Chặn đóng khi còn người (RFID), mmWave còn phát hiện, rèm quang bị chắn, panic, hoặc tín hiệu chưa rõ; đảo chiều khi đang đóng; panic chốt, nhả khóa và mở cửa; liên động hai cửa khu C; timer cửa mở 30 s / 60 s và người mắc kẹt 5 phút; đèn, còi, sưởi, quạt mô phỏng bằng LED |
| **RFID** | Thẻ demo `DEMO-017`, `DEMO-018` (được phép), `DEMO-999` (thu hồi); chống đọc lặp, số người không âm, sau reboot số người là *chưa xác minh* |
| **Lệnh cửa** | Operator gửi *Mở / Đóng / Đặt lại khẩn cấp* cho D07, D08; ESP32 tự kiểm tra rồi trả *đã áp dụng / bị từ chối (lý do) / hết hạn*; cửa trên UI chỉ đổi theo dữ liệu thiết bị |
| **Cảnh báo** | Cửa mở lâu, mắc kẹt, panic, lệch số người, nhiệt độ ngoài ngưỡng (có trễ 0,5 °C), mất cảm biến, mất kết nối; *tiếp nhận* chỉ ghi nhận, cảnh báo tự hết khi điều kiện hết |
| **Nhận hàng** | Giữ một vị trí phù hợp nhiệt độ/kích thước/tải trọng trong 15 phút; cảnh báo từ 85 %, từ chối khi vượt 95 % hoặc khu đệm ùn tắc; an toàn với hai yêu cầu đồng thời |
| **Lịch sử** | Sự kiện thiết bị, cảnh báo, lệnh cửa, giữ chỗ, ra vào theo ca; lọc theo giờ Việt Nam, khu, loại; xuất CSV UTF-8 (chặn ô công thức) |
| **Tài khoản** | `viewer` (chỉ xem), `operator` (vận hành), `admin` (thêm nhật ký đăng nhập); cookie HttpOnly, khóa sau 5 lần sai |
| **Bền vững** | Dữ liệu lưu MySQL, còn sau khi tải lại trang/khởi động lại backend; MQTT qua TLS với CA riêng; chống trùng tin, phát hiện tin bị mất |
| **Chế độ demo** | *Demo giao diện* chạy 4 kịch bản mẫu trong trình duyệt, không cần backend |

---

## Trạng thái hiện tại

Cập nhật 13/10/2026. Chi tiết và bằng chứng từng mốc ở [Agent.md](Agent.md) và [docs/evidence/](docs/evidence/).

| Mốc | Nội dung | Trạng thái |
| --- | --- | --- |
| M00 | Dashboard React nền trắng | ✅ Đạt |
| M01 | Hợp đồng MQTT/snapshot, registry, validator | ✅ Đạt |
| M02 | Broker riêng, tài khoản/ACL, schema MySQL riêng | ✅ Đạt |
| M03 | Firmware ESP32 trên Wokwi gửi telemetry, reconnect | ✅ Đạt |
| M04 | Backend HTTP, migration, health/readiness | ✅ Đạt |
| M05 | MQTT → MySQL → snapshot/lịch sử | ✅ Đạt |
| M06 | Dashboard nhận dữ liệu backend (REST + WebSocket) | ✅ Đạt (nguồn script) |
| M07 | Firmware đọc input cửa/rèm quang/panic/mmWave | ✅ Đạt (Wokwi) |
| M08 | RFID, số người, event ingest | ✅ Đạt (Wokwi) |
| M09 | Quy tắc an toàn cục bộ (cổng đóng, panic, liên động) | ✅ Đạt (test C++) |
| M10 | Lệnh cửa có ack, output mô phỏng | ✅ Đạt (Wokwi) |
| M11 | Cảnh báo, timer, tiếp nhận | ✅ Đạt (Wokwi: 30 s / 60 s khi mất broker, mắc kẹt 5 phút) |
| M12 | TLS, offline, phục hồi | ✅ Đạt (Wokwi TLS, T08 mất broker) |
| M13 | Đăng nhập, vai trò, ca làm việc | ✅ Đạt |
| M14 | Giữ chỗ và điều kiện nhận hàng | ✅ Đạt |
| M15 | Lịch sử, báo cáo, CSV | ✅ Đạt |
| M16 | Toàn kho, 4 kịch bản, đo tải | 🟡 4 kịch bản + T08 đạt trên Wokwi, tải P95 186–242 ms; còn T17/T24/T26 một phần |
| M17 | Đóng gói, bàn giao | ⬜ Chưa làm |

**Nghiệm thu Wokwi đã xong** (13/10/2026, [bằng chứng](docs/evidence/WOKWI-2026-10-13.md)): RFID, mmWave, liên động, rèm quang, panic, T08 (panic khi broker dừng), lệnh trùng/cũ, timer. **Việc còn lại:** T17 (khu đệm đầy, integration), T24 (DB đầy/lỗi ghi), T26 (825/1440 px, bàn phím) để đóng M16; sửa `demo:warehouse` tự nối lại khi broker dừng; M17 (Postman, checklist demo, chạy thử từ bản clone sạch).

---

## Yêu cầu hệ thống

| Công cụ | Phiên bản đã kiểm | Bắt buộc? |
| --- | --- | --- |
| Windows 10/11 + PowerShell | Windows 11 | Có |
| Node.js + npm | 24.19 / 11.17 | Có |
| MySQL Server | 26.7 (service có sẵn) | Có (backend) |
| Mosquitto | 2.x tại `C:\Program Files\Mosquitto` | Có (backend) |
| Git for Windows | 2.55 (có sẵn `openssl` cho TLS) | Có |
| VS Code + PlatformIO + Wokwi extension | 1.141 / Core 6.2 / Wokwi 4.0 | Chỉ khi chạy ESP32 |
| g++ (qua WSL) | 15.2 | Tùy chọn, cho test C++ |

Chỉ xem giao diện mẫu thì chỉ cần Node.js.

---

## Chạy nhanh

### Cách 1 — Chỉ xem giao diện (không cần MQTT/MySQL)

```powershell
npm ci
npm run dev
```

Mở <http://127.0.0.1:5173>, chọn **Nguồn dữ liệu → Demo giao diện**, bấm **Mô phỏng** để chạy 4 kịch bản mẫu.

### Cách 2 — Hệ thống đầy đủ

Lần đầu trên máy mới làm theo **[docs/HUONG_DAN_CAU_HINH.md](docs/HUONG_DAN_CAU_HINH.md)** (mỗi bước có lệnh, kết quả mong đợi và cách kiểm tra). Tóm tắt:

```powershell
npm ci                       # cài thư viện (dừng Vite trước nếu đang chạy)
npm run infra:setup          # tạo .local/, mật khẩu MQTT, ACL, cấu hình broker
npm run infra:tls:setup      # CA demo + chứng chỉ broker, bật cổng TLS 18885
notepad .local\mysql-admin.env   # điền MYSQL_ADMIN_USER / MYSQL_ADMIN_PASSWORD
npm run infra:db:init        # tạo schema khoguard_demo + 2 tài khoản riêng
npm run db:migrate           # áp migration 001 → 006
npm run auth:setup           # tạo viewer / operator / admin
```

Mỗi lần chạy, mở các cửa sổ PowerShell riêng tại thư mục dự án:

| Cửa sổ | Lệnh | Ghi chú |
| --- | --- | --- |
| T1 | `npm run infra:mqtt:start` | Broker dự án 18884/18885 (giữ mở) |
| T2 | `npm run backend:start` | Backend `http://127.0.0.1:3001` |
| T3 | `npm run dev -- --strictPort` | Dashboard `http://127.0.0.1:5173` |
| T4 | `npm run demo:warehouse -- --seed=17` | Dữ liệu mô phỏng khu A, B, D và cửa D09 |
| T5 | `npm run firmware:gateway:start` | Chỉ khi chạy ESP32 trên Wokwi |

> Nếu PowerShell báo *running scripts is disabled* khi gọi `npm`, dùng `npm.cmd` (ví dụ `npm.cmd run backend:start`).

Kiểm tra nhanh:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/ready   # status: ready, database: ready, mqtt: connected
```

Mật khẩu dashboard nằm ở `.local\dashboard-users.json` (chỉ trên máy bạn):

```powershell
Get-Content .local\dashboard-users.json
```

### Chạy ESP32 trên Wokwi

```powershell
npm run firmware:gateway:setup   # lần đầu: tải gateway Wokwi và kiểm SHA-256
npm run firmware:build           # sinh secret firmware vào .local rồi build PlatformIO
```

Trong VS Code: **F1 → Wokwi: Select Config File → `firmware/wokwi.toml`**, rồi **F1 → Wokwi: Start Simulator**. Serial Monitor phải in `KHOGUARD_M12 boot=… transport=mqtts:18885 CA-verified`. Thứ tự khởi động: broker → gateway → simulator.

---

## Sử dụng dashboard

1. Mở <http://127.0.0.1:5173>, chọn **Nguồn dữ liệu → Backend / MQTT**, đăng nhập (`operator` để thao tác, `viewer` để chỉ xem).
2. Thanh bên hiện *Backend đã kết nối · MQTT đã kết nối*; dải trên cùng cho biết bao nhiêu thiết bị có dữ liệu mới.
3. Các trang:

| Trang | Làm được gì |
| --- | --- |
| **Tổng quan** | Sơ đồ khu, chi tiết khu, cảnh báo cần tiếp nhận, nhật ký gần đây |
| **Sơ đồ kho** | Chọn khu, xem môi trường |
| **Giám sát cửa** | Điều khiển D07/D08 (operator), bảng 12 cửa với nguồn từng cửa |
| **Môi trường** | Nhiệt độ/độ ẩm và ngưỡng từng khu |
| **Nhận hàng** | Sức chứa kho + khu đệm, giữ chỗ, xác nhận nhập kho, hủy |
| **Nhật ký** | Ra vào theo ca; **Lịch sử / CSV** với bộ lọc và xuất file |

Ý nghĩa hiển thị:

- **“—”** là *chưa có dữ liệu*, không phải 0.
- **Dữ liệu cũ**: thiết bị không gửi trong 10 s; giá trị giữ để tra cứu, **không** coi là an toàn.
- Gửi lệnh cửa → *Đang chờ ESP-C01 xác nhận…* → *Đã áp dụng* / *Bị từ chối: lý do* / *Hết hạn*. Biểu tượng cửa chỉ đổi khi thiết bị báo trạng thái mới.
- **Tiếp nhận** cảnh báo không xóa cảnh báo; panic cần lệnh **Đặt lại khẩn cấp** riêng sau khi nút đã nhả.

---

## Thao tác với ESP32 trên Wokwi

| Muốn làm | Thao tác |
| --- | --- |
| Mở/đóng cửa bằng tay | Gạt công tắc `contact07` / `contact08` (HIGH = mở) |
| Chắn rèm quang | Gạt `beam07` / `beam08` sang LOW |
| Nhấn nút khẩn cấp | Gạt `panic07` / `panic08` sang HIGH |
| Có người trong kho (mmWave) | Gạt `presence` sang HIGH |
| Đổi nhiệt độ/độ ẩm | Bấm DHT22, kéo thanh trượt |
| Quẹt thẻ | Gõ vào Serial Monitor: `RFID D07 DEMO-017 IN`, `RFID D07 DEMO-017 OUT`, `RFID D08 DEMO-999 IN` |
| Gửi lệnh cửa | Dashboard → *Giám sát cửa* → D07/D08 |

10 LED cho biết output: khóa D07/D08 (xanh lá), motor mở (xanh dương) / đóng (cam) từng cửa, đèn khẩn cấp (trắng), còi (đỏ), sưởi (đỏ), quạt (cyan). Sau khi gửi lệnh mở/đóng, gạt công tắc contact của cửa đó trong 10 s để mô phỏng cửa tới vị trí.

### Nghiệm thu bán tự động trên Wokwi

```powershell
npm run wokwi:acceptance
```

Script mở Serial qua `127.0.0.1:4000` (RFC2217), tự gửi các lượt quẹt thẻ, quan sát MQTT bằng tài khoản chỉ đọc, gửi lệnh qua API và **tự dừng/bật lại broker dự án** cho bước T08. Ở các bước cần gạt công tắc, nó in `>>> THAO TÁC: …` rồi chờ tới khi telemetry xác nhận. Chạy lại từ một bước: `npm run wokwi:acceptance -- --from=S4a`. Bằng chứng (serial log, MQTT, kết quả) ghi vào `.local/wokwi-acceptance/runs/<thời điểm>/`.

---

## Danh sách lệnh

Tất cả chạy bằng `npm run <lệnh>` tại thư mục gốc.

### Phát triển

| Lệnh | Việc |
| --- | --- |
| `dev` | Vite dev server `127.0.0.1:5173` (proxy `/api`, `/ws` → 3001) |
| `build` / `preview` | Build production vào `dist/` / xem bản build |
| `test` | 102 unit test (`node --test`) |

### Hạ tầng (chạy một lần hoặc khi cần)

| Lệnh | Việc |
| --- | --- |
| `infra:setup` | Tạo `.local/` (quyền NTFS riêng), 7 tài khoản MQTT, ACL, cấu hình broker, `runtime.env` |
| `infra:tls:setup` | CA demo + chứng chỉ, listener TLS 18885, chuyển backend sang TLS |
| `infra:db:init` | Tạo schema + tài khoản `khoguard_runtime` / `khoguard_migrate` bằng admin |
| `db:migrate` | Áp migration 001–006 (chạy lại là no-op) |
| `auth:setup` | Tạo/đổi mật khẩu tài khoản dashboard |
| `infra:mqtt:start` | Chạy broker dự án |
| `firmware:prepare` / `firmware:build` | Sinh `kg_secrets.h` / build firmware ESP32 |
| `firmware:gateway:setup` / `firmware:gateway:start` | Tải / chạy gateway Wokwi |

### Chạy và mô phỏng

| Lệnh | Việc |
| --- | --- |
| `backend:start` | Backend |
| `demo:warehouse -- --seed=17 [--seconds=600] [--with-fake-esp]` | 4 thiết bị mô phỏng; `--with-fake-esp` chỉ khi **không** chạy Wokwi |
| `demo:environment` | Chỉ SIM-A01 (nguồn môi trường M05) |
| `demo:scenarios -- --scenario=all\|1\|2\|3\|4` | 4 kịch bản tự động với ESP32 giả lập (backend chạy, Wokwi tắt) |
| `load:test -- --nodes=50 --seconds=60 --burst=500` | Đo tải (tự bật backend riêng) |

### Kiểm tra

| Lệnh | Cần gì đang chạy | Kiểm |
| --- | --- | --- |
| `infra:mqtt:check` | broker | 11 kiểm tra tài khoản/ACL |
| `infra:tls:check` | broker | CA giả, sai hostname, ACL qua TLS |
| `infra:db:check` | MySQL | 6 kiểm tra schema/quyền |
| `infra:secrets:check` | — (tự bật Vite) | File secret bị Git bỏ qua, URL secret trả 403 |
| `backend:check`, `telemetry:check`, `events:check`, `control:check`, `auth:check`, `reservations:check` | broker + backend | Tích hợp từng mốc |
| `recovery:check`, `reports:check` | broker (backend **tắt**, tự bật) | Phục hồi, báo cáo |
| `firmware:check -- <boot-id>` | Wokwi | Telemetry thật từ ESP32 |
| `wokwi:acceptance` | broker + backend + Wokwi | Nghiệm thu firmware thật |
| `verify:all [-- --skip=a,b]` | broker + MySQL (backend, Vite, Wokwi **tắt**) | Toàn bộ theo đúng thứ tự |

---

## Cấu trúc dự án

```text
contracts/   Hợp đồng dữ liệu: registry thiết bị, JSON Schema MQTT/snapshot, validator dùng chung
firmware/    ESP32: controller.h (quy tắc an toàn thuần C++), main.cpp (GPIO/MQTT/TLS), test C++, mạch Wokwi
server/      Backend Node: ingest MQTT, snapshot, cảnh báo, lệnh, HTTP API, WebSocket, đăng nhập, giữ chỗ, báo cáo
db/          Migration SQL 001–006, rollback, bộ chạy migration có journal/checksum
src/         Dashboard React
scripts/     Thiết lập, mô phỏng, kiểm tra tích hợp, đo tải, nghiệm thu Wokwi
infra/       Mẫu cấu hình Mosquitto (không secret)
tests/       Unit test node:test
docs/        Hướng dẫn cấu hình, sơ đồ, bằng chứng kiểm thử
.local/      (không vào Git) mật khẩu, khóa TLS, cấu hình sinh ra, build firmware, log
```

Mô tả từng file: [ARCHITECTURE.md §5](ARCHITECTURE.md#5-cấu-trúc-thư-mục).

---

## Kiểm thử

```powershell
npm test         # 102 unit test
npm run build    # build dashboard
npm run verify:all   # toàn bộ (broker + MySQL bật; backend, Vite, Wokwi tắt)
```

Kết quả gần nhất trên máy Windows dự án (13/10/2026): 102/102 unit test; hai bộ test C++; build web và ESP32; 14 script kiểm tra tích hợp; 4 kịch bản/20 bước; tải 2000/2000 tin, P95 publish → WebSocket 242 ms. Xem [docs/evidence/CHECK-WINDOWS-2026-10-13.md](docs/evidence/CHECK-WINDOWS-2026-10-13.md). Ma trận 27 trường hợp T01–T27: [Agent.md §10](Agent.md).

---

## Bảo mật và secret

- Mọi mật khẩu, khóa TLS, cấu hình sinh ra nằm trong **`.local/`**: bị `.gitignore`, bị Vite chặn phục vụ, chỉ user hiện tại + SYSTEM đọc được. **Không đưa `.local/` vào Git, không dán mật khẩu vào chat.**
- Script dự án không bao giờ in mật khẩu. Biến `VITE_*` không chứa secret.
- Dịch vụ dự án chỉ nghe `127.0.0.1`. Không dùng broker 1883 hay schema MySQL khác; script không dừng tiến trình không thuộc dự án.
- MQTT: không anonymous, ACL theo thiết bị, TLS với CA demo riêng, không bỏ kiểm chứng chỉ.
- `.npmrc` tắt script cài đặt của thư viện.

Chi tiết các lớp bảo vệ: [ARCHITECTURE.md §15](ARCHITECTURE.md#15-bảo-mật-theo-lớp).

---

## Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| `npm` báo *running scripts is disabled* | Dùng `npm.cmd …` |
| `npm ci` báo EPERM/EBUSY | Dừng Vite/backend dự án rồi chạy lại |
| `/api/ready` → `mqtt: disconnected` | Chưa chạy broker (T1), hoặc vừa `infra:tls:setup` mà chưa khởi động lại broker |
| `/api/ready` → `database: unavailable` | MySQL service dừng hoặc chưa `db:migrate` |
| Dashboard báo *Mất kết nối backend* | Backend (T2) chưa chạy; dashboard tự nối lại khi backend lên |
| ESP-C01 *chưa có dữ liệu* | Gateway (T5) chưa chạy hoặc simulator chưa Start; xem Serial Monitor có `MQTT_ONLINE` |
| Lệnh cửa *DEVICE_NOT_LIVE* | ESP-C01 không gửi dữ liệu trong 10 s |
| Lệnh bị *REVISION_MISMATCH* | Trạng thái vừa đổi; xem lại rồi gửi lại |
| `infra:mqtt:start` báo cổng bị chiếm | Broker dự án đã chạy ở cửa sổ khác |

Bảng đầy đủ: [docs/HUONG_DAN_CAU_HINH.md §17](docs/HUONG_DAN_CAU_HINH.md#17-xử-lý-lỗi-thường-gặp).

---

## Giới hạn

- Mô hình mô phỏng để trình diễn nguyên lý; **không** thay thế Safety PLC, relay an toàn độc lập, cơ cấu mở bằng tay hay kiểm định thiết bị. Thời gian phản ứng mô phỏng không phải cam kết an toàn phần cứng.
- mmWave, rèm quang, contact, panic là công tắc; RFID là dòng Serial; CO₂, ảnh nhiệt, AI không được triển khai.
- Chỉ ESP-C01 (cửa D07, D08) nhận lệnh; cửa các khu khác là dữ liệu mô phỏng.
- Số liệu chứa hàng là dữ liệu demo, chưa nối WMS.
- Chỉ chạy localhost (cookie chưa `Secure`).
- `demo:warehouse` thoát khi broker dừng; chạy lại sau khi broker bật.

---

## Tài liệu

| Tài liệu | Nội dung |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc chi tiết: thành phần, hợp đồng dữ liệu, firmware, backend, DB, dashboard, luồng, an toàn, bảo mật, kiểm thử |
| [docs/HUONG_DAN_CAU_HINH.md](docs/HUONG_DAN_CAU_HINH.md) | Cài đặt và vận hành từng bước trên Windows |
| [docs/architecture/](docs/architecture/README.md) | Sơ đồ kiến trúc tổng thể và luồng lệnh cửa (HTML/PNG) |
| [Agent.md](Agent.md) | Kế hoạch M00–M17, quy tắc nghiệp vụ, ma trận kiểm thử T01–T27, bốn kịch bản demo |
| [DESITION.md](DESITION.md) | Các quyết định DEC-001…DEC-033 và lý do |
| [QUA_TRINH.md](QUA_TRINH.md) | Nhật ký thực hiện, kết quả kiểm tra, lỗi đã gặp |
| [contracts/README.md](contracts/README.md) | Hợp đồng MQTT/API chi tiết |
| [server/README.md](server/README.md) | API backend, migration, kiểm thử |
| [firmware/README.md](firmware/README.md) | Build/chạy firmware, mạch, RFID, TLS |
| [infra/README.md](infra/README.md) | Broker, MySQL, tài khoản, bảo vệ secret |
| [docs/evidence/](docs/evidence/) | Bằng chứng kiểm thử từng mốc |
