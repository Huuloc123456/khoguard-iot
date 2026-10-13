# Hướng dẫn cấu hình KhoGuard từ đầu đến cuối

Tài liệu này đi từ một máy Windows mới tới lúc dashboard chạy dữ liệu thật và bốn kịch bản demo. Mỗi bước ghi rõ lệnh, nơi chạy, kết quả mong đợi và cách kiểm tra. Tất cả lệnh chạy trong **PowerShell** tại thư mục gốc dự án, trừ khi ghi khác.

- Sơ đồ kiến trúc: [docs/architecture/kien-truc-tong-the.html](architecture/kien-truc-tong-the.html)
- Sơ đồ luồng lệnh cửa: [docs/architecture/luong-lenh-cua.html](architecture/luong-lenh-cua.html)
- Chi tiết API: [server/README.md](../server/README.md). Firmware: [firmware/README.md](../firmware/README.md). Hạ tầng: [infra/README.md](../infra/README.md).

> Nguyên tắc an toàn: không dán mật khẩu vào chat, không đưa thư mục `.local/` vào Git, không dừng Mosquitto service 1883 hoặc MySQL 3306 đang dùng cho việc khác. Các script dự án không bao giờ in mật khẩu.

## Mục lục

1. [Tổng quan cổng, tiến trình và file](#1-tổng-quan-cổng-tiến-trình-và-file)
2. [Cài công cụ](#2-cài-công-cụ)
3. [Lấy mã nguồn và cài thư viện](#3-lấy-mã-nguồn-và-cài-thư-viện)
4. [Tạo `.local` và cấu hình broker](#4-tạo-local-và-cấu-hình-broker)
5. [Tạo chứng chỉ TLS](#5-tạo-chứng-chỉ-tls)
6. [Tạo schema và tài khoản MySQL](#6-tạo-schema-và-tài-khoản-mysql)
7. [Khởi động broker](#7-khởi-động-broker)
8. [Migration và tài khoản dashboard](#8-migration-và-tài-khoản-dashboard)
9. [Khởi động backend](#9-khởi-động-backend)
10. [Khởi động dashboard và đăng nhập](#10-khởi-động-dashboard-và-đăng-nhập)
11. [Nguồn dữ liệu: mô phỏng các khu](#11-nguồn-dữ-liệu-mô-phỏng-các-khu)
12. [Nguồn dữ liệu: ESP32 ESP-C01 trên Wokwi](#12-nguồn-dữ-liệu-esp32-esp-c01-trên-wokwi)
13. [Bốn kịch bản demo](#13-bốn-kịch-bản-demo)
14. [Lịch sử và xuất CSV](#14-lịch-sử-và-xuất-csv)
15. [Kiểm tra toàn bộ](#15-kiểm-tra-toàn-bộ)
16. [Dừng, khởi động lại hằng ngày và reset](#16-dừng-khởi-động-lại-hằng-ngày-và-reset)
17. [Xử lý lỗi thường gặp](#17-xử-lý-lỗi-thường-gặp)

## 1. Tổng quan cổng, tiến trình và file

| Thành phần | Địa chỉ | Chạy bằng | Ghi chú |
| --- | --- | --- | --- |
| Mosquitto dự án | `127.0.0.1:18884` (không mã hóa), `127.0.0.1:18885` (TLS) | `npm run infra:mqtt:start` | Không phải service 1883 có sẵn; anonymous tắt, ACL mặc định từ chối |
| MySQL | `127.0.0.1:3306`, schema `khoguard_demo` | Service MySQL của Windows | Backend dùng `khoguard_runtime`, migration dùng `khoguard_migrate` |
| Backend | `http://127.0.0.1:3001` | `npm run backend:start` | REST `/api/*`, WebSocket `/ws` |
| Dashboard | `http://127.0.0.1:5173` | `npm run dev` | Vite proxy `/api` và `/ws` tới 3001 |
| Wokwi gateway | `ws://127.0.0.1:9011` (và 9080 mọi interface, do upstream) | `npm run firmware:gateway:start` | ESP32 tới máy qua `host.wokwi.internal` |

Mở **5 cửa sổ PowerShell** khi chạy đầy đủ, đặt tên để dễ nhớ:

| Terminal | Việc |
| --- | --- |
| T1 | Broker Mosquitto dự án |
| T2 | Backend |
| T3 | Dashboard Vite |
| T4 | Mô phỏng các khu (SIM-*) |
| T5 | Wokwi gateway (chỉ khi chạy ESP32) |
| T0 | Gõ lệnh cấu hình và kiểm tra |

File trong `.local/` (sinh tự động, đã bị Git bỏ qua và Vite chặn):

| File | Nội dung |
| --- | --- |
| `runtime.env` | Biến môi trường backend: DB, MQTT, cổng |
| `mysql-admin.env` | Tài khoản admin MySQL do bạn điền, chỉ dùng một lần ở bước 6 |
| `mysql-users.json`, `mysql-state.json` | Mật khẩu runtime/migration và marker sở hữu schema |
| `mosquitto/` | `mosquitto.conf`, `passwords` (hash), `acl`, `accounts.json` (mật khẩu từng thiết bị), `data/` |
| `tls/` | `ca.key`, `ca.crt`, `server.key`, `server.crt` (CA demo) |
| `dashboard-users.json` | Mật khẩu ba tài khoản dashboard |
| `firmware/kg_secrets.h`, `firmware-build/` | Mật khẩu + CA cho firmware và file build |
| `*-check.json`, `load-test.json`, `verify-all.json` | Kết quả kiểm tra, không chứa secret |

## 2. Cài công cụ

Cài theo thứ tự, mỗi mục kiểm tra ngay sau khi cài.

### 2.1 Node.js 24 LTS

1. Tải bộ cài Windows x64 tại <https://nodejs.org>, chọn bản 24 LTS.
2. Cài với tùy chọn mặc định (có `npm`, thêm vào PATH).
3. Mở PowerShell **mới** và kiểm tra:

```powershell
node --version   # v24.x
npm --version
```

### 2.2 Git for Windows (có sẵn openssl)

1. Tải tại <https://git-scm.com/download/win>, cài mặc định vào `C:\Program Files\Git`.
2. Kiểm tra:

```powershell
git --version
& 'C:\Program Files\Git\usr\bin\openssl.exe' version
```

Script TLS tự tìm openssl theo thứ tự: biến `OPENSSL`, PATH, `C:\Program Files\Git\usr\bin\openssl.exe`, `C:\Program Files\OpenSSL-Win64\bin\openssl.exe`.

### 2.3 MySQL Server

1. Tải MySQL Installer tại <https://dev.mysql.com/downloads/installer/>, chọn **Server only**.
2. Cấu hình: port **3306**, đặt mật khẩu `root`, chạy như Windows Service.
3. Kiểm tra service:

```powershell
Get-Service | Where-Object Name -like 'MySQL*'
Test-NetConnection 127.0.0.1 -Port 3306   # TcpTestSucceeded : True
```

### 2.4 Mosquitto 2.x

1. Tải bộ cài Windows 64-bit tại <https://mosquitto.org/download/>.
2. Cài vào đúng thư mục mặc định **`C:\Program Files\Mosquitto`** (script dự án gọi `mosquitto.exe` và `mosquitto_passwd.exe` ở đây).
3. Nếu bộ cài tạo service Mosquitto trên 1883, giữ nguyên. Dự án chạy một broker riêng trên 18884/18885.
4. Kiểm tra:

```powershell
& 'C:\Program Files\Mosquitto\mosquitto.exe' -h | Select-Object -First 1
Test-Path 'C:\Program Files\Mosquitto\mosquitto_passwd.exe'   # True
```

### 2.5 VS Code, PlatformIO và Wokwi (chỉ cần khi chạy ESP32)

1. Cài VS Code tại <https://code.visualstudio.com>, chọn "Add to PATH" để dùng lệnh `code`.
2. Trong VS Code, mở Extensions (Ctrl+Shift+X), cài **PlatformIO IDE** và **Wokwi Simulator**.
3. Mở PlatformIO một lần để nó tự cài PlatformIO Core. Kiểm tra:

```powershell
Test-Path "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe"   # True
```

4. Kích hoạt license Wokwi: F1 → **Wokwi: Request a New License**, làm theo trình duyệt. Đã cài extension chưa có nghĩa là license chạy được; phải thử Start Simulator ở bước 12.

### 2.6 g++ (tùy chọn)

Chỉ dùng để chạy test C++ của firmware trên máy tính (MSYS2/MinGW). Không có g++ thì `verify:all` ghi bước đó là *bỏ qua*.

## 3. Lấy mã nguồn và cài thư viện

Ở T0:

```powershell
cd D:\huit\iot\source\khoguard-iot
npm ci
```

- Nếu Vite của dự án đang chạy, dừng nó (Ctrl+C ở cửa sổ Vite) trước `npm ci` để thư viện native không bị khóa.
- `.npmrc` tắt lifecycle script khi cài, nên không có script lạ chạy lúc cài.

Kiểm tra nhanh:

```powershell
npm test        # # pass 100, # fail 0
npm run build   # tạo dist/
```

## 4. Tạo `.local` và cấu hình broker

```powershell
npm run infra:setup
```

Lệnh này:

1. Tạo `.local/` và đặt quyền NTFS chỉ cho người dùng hiện tại và SYSTEM.
2. Sinh mật khẩu ngẫu nhiên 192-bit cho 7 tài khoản MQTT: `khoguard-backend`, `khoguard-observer` và 5 thiết bị `SIM-A01`, `SIM-B01`, `ESP-C01`, `SIM-C02`, `SIM-D01`.
3. Tạo `.local/mosquitto/mosquitto.conf`, `passwords`, `acl`, `accounts.json`, `runtime.env` và `mysql-admin.env` trống.

Kết quả mong đợi: `MQTT config ready: localhost:18884, 7 accounts, default-deny ACL. Secrets are only in protected .local/.`

Chạy lại lệnh này an toàn: mật khẩu đã có được giữ nguyên.

## 5. Tạo chứng chỉ TLS

Chạy **trước** khi khởi động broker lần đầu (nếu broker đang chạy thì khởi động lại sau bước này):

```powershell
npm run infra:tls:setup
```

Lệnh này:

1. Tạo CA demo và chứng chỉ broker trong `.local/tls/` với SAN `localhost`, `host.wokwi.internal`, `127.0.0.1`.
2. Thêm `listener 18885 127.0.0.1` (TLS ≥ 1.2) vào cấu hình broker dự án.
3. Đổi `MQTT_PORT=18884` thành `MQTT_PORT=18885` trong `.local/runtime.env`, nên backend và các script dùng TLS.

Kết quả mong đợi: `TLS ready in .local/tls (new demo CA); broker adds 127.0.0.1:18885; backend uses MQTT_PORT=18885. ... No key printed.`

Nếu báo không tìm thấy openssl: `$env:OPENSSL='C:\Program Files\Git\usr\bin\openssl.exe'; npm run infra:tls:setup`.

## 6. Tạo schema và tài khoản MySQL

1. Mở file admin bằng Notepad:

```powershell
notepad .local\mysql-admin.env
```

2. Điền tài khoản admin MySQL, lưu file:

```text
MYSQL_ADMIN_USER=root
MYSQL_ADMIN_PASSWORD=<mật khẩu root của bạn>
```

Mật khẩu có ký tự `#` thì đặt trong dấu ngoặc kép.

3. Tạo schema và hai tài khoản riêng:

```powershell
npm run infra:db:init
```

Kết quả mong đợi: `Created khoguard_demo, ownership marker, runtime DML account and migration DDL account. No existing schema/account changed.`

- Lệnh tạo `khoguard_demo`, `khoguard_runtime@localhost` (chỉ SELECT/INSERT/UPDATE/DELETE) và `khoguard_migrate@localhost` (DDL cho schema này), rồi ghi mật khẩu vào `runtime.env`.
- Nếu schema hoặc tài khoản trùng tên đã tồn tại mà không có marker của dự án, lệnh dừng và không sửa gì.
- Sau khi thành công có thể xóa giá trị `MYSQL_ADMIN_PASSWORD` trong file; backend không dùng tài khoản admin.

Kiểm tra:

```powershell
npm run infra:db:check   # MySQL PASS: 6 checks
```

## 7. Khởi động broker

Ở **T1**:

```powershell
cd D:\huit\iot\source\khoguard-iot
npm run infra:mqtt:start
```

- Broker chạy foreground trên 18884 và 18885; giữ cửa sổ mở. Ctrl+C dừng broker này.
- Nếu báo cổng bị chiếm, kiểm tra tiến trình đang giữ cổng (`Get-NetTCPConnection -LocalPort 18884`); script không tự kill tiến trình khác.

Kiểm tra ở T0:

```powershell
npm run infra:mqtt:check   # MQTT PASS: 11 checks
npm run infra:tls:check    # M12 TLS PASS: 6 groups
```

`infra:mqtt:check` publish fixture lên topic demo, nên chạy trước khi bật mô phỏng.

## 8. Migration và tài khoản dashboard

Ở T0:

```powershell
npm run db:migrate
npm run auth:setup
```

- `db:migrate` áp lần lượt `001_inventory` → `006_reservations` (4 khu, 5 thiết bị, 12 cửa, telemetry, sự kiện, lệnh, cảnh báo, tài khoản, ca, slot). Chạy lại không đổi gì.
- `auth:setup` tạo `viewer`, `operator`, `admin`; mật khẩu ngẫu nhiên lưu ở `.local/dashboard-users.json`, DB chỉ giữ hash scrypt.

Xem mật khẩu dashboard (chỉ trên máy của bạn):

```powershell
Get-Content .local\dashboard-users.json
```

| Tài khoản | Quyền |
| --- | --- |
| `viewer` | Chỉ xem |
| `operator` | Xem, gửi lệnh cửa, tiếp nhận cảnh báo, nhận hàng, xem nhật ký ra vào |
| `admin` | Như operator, thêm nhật ký đăng nhập |

Muốn đổi mật khẩu: sửa giá trị trong `dashboard-users.json` (≥ 12 ký tự), chạy lại `npm run auth:setup`; phiên cũ của tài khoản đó bị thu hồi.

## 9. Khởi động backend

Ở **T2**:

```powershell
cd D:\huit\iot\source\khoguard-iot
npm run backend:start
```

Kiểm tra ở T0:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
Invoke-RestMethod http://127.0.0.1:3001/api/ready
```

Kết quả `ready` phải là `status: ready`, `database: ready`, `mqtt: connected`. Nếu `not_ready`, xem broker (T1) và MySQL service.

Kiểm tra tích hợp (backend đang chạy):

```powershell
npm run backend:check     # 9 checks
npm run telemetry:check   # 10 nhóm
npm run events:check      # 5 nhóm
npm run control:check     # 7 nhóm
npm run auth:check        # 5 nhóm
npm run reservations:check
```

Các lệnh này dùng boot ID riêng và không xóa dữ liệu cũ. Không chạy chúng khi mô phỏng hoặc Wokwi đang gửi dữ liệu.

## 10. Khởi động dashboard và đăng nhập

Ở **T3**:

```powershell
cd D:\huit\iot\source\khoguard-iot
npm run dev -- --strictPort
```

1. Mở trình duyệt tại <http://127.0.0.1:5173>.
2. Ở góc trên, chọn **Nguồn dữ liệu → Backend / MQTT**. (*Demo giao diện* chỉ dùng số mẫu trong trình duyệt.)
3. Đăng nhập bằng `operator` và mật khẩu ở bước 8.
4. Thanh bên hiện *Backend đã kết nối* và *MQTT đã kết nối*. Khi chưa có nguồn dữ liệu, các khu hiện *chưa có dữ liệu/không rõ*; đó là đúng, hệ thống không tự giả số 0.

## 11. Nguồn dữ liệu: mô phỏng các khu

Ở **T4**, chạy 4 thiết bị mô phỏng (khu A, B, D và cửa D09 khu C) với seed cố định:

```powershell
cd D:\huit\iot\source\khoguard-iot
npm run demo:warehouse -- --seed=17
```

- Mỗi thiết bị dùng tài khoản MQTT riêng, gửi mỗi 2 giây qua TLS. Ctrl+C gửi trạng thái offline rồi thoát.
- Thêm `--seconds=600` để tự dừng sau 10 phút.
- Chỉ khi **không** chạy Wokwi, thêm `--with-fake-esp` để có ESP-C01 giả lập bằng Node. Không chạy hai nguồn cùng tài khoản ESP-C01.

Dashboard lúc này hiện nhiệt độ/ẩm khu A, B, D và trạng thái 12 cửa. Số liệu là mô phỏng, được ghi nhãn trong UI.

## 12. Nguồn dữ liệu: ESP32 ESP-C01 trên Wokwi

### 12.1 Build firmware

Ở T0:

```powershell
npm run firmware:build
```

- Lệnh chạy `firmware:prepare` (ghi mật khẩu ESP-C01 và CA demo vào `.local/firmware/kg_secrets.h`, chọn cổng 18885) rồi gọi `pio run`. Lần đầu tải thư viện nên lâu hơn.
- File build nằm ở `.local/firmware-build/esp32dev/firmware.bin` và `.elf`, đúng với `firmware/wokwi.toml`.
- Nếu build bằng nút PlatformIO trong VS Code, chạy `npm run firmware:prepare` trước.

### 12.2 Cài và chạy gateway

```powershell
npm run firmware:gateway:setup
```

Tải `wokwigw` 2.0.1 vào `.local/wokwigw-2.0.1/` và đối chiếu SHA-256. Chạy lại khi đã có thì chỉ kiểm hash.

Ở **T5**:

```powershell
cd D:\huit\iot\source\khoguard-iot
npm run firmware:gateway:start
```

Gateway nghe `ws://127.0.0.1:9011`. Script từ chối chạy nếu cổng 9011 hoặc 9080 bị chiếm. Windows Firewall có thể hỏi quyền cho 9080: chọn **Hủy/không cho phép** mạng công cộng, firmware không có HTTP server.

### 12.3 Chạy simulator

1. Ở T0: `code --new-window firmware`
2. Trong cửa sổ VS Code mới: **F1 → Wokwi: Start Simulator**. Giữ tab simulator hiển thị (ẩn tab có thể làm simulator chậm).
3. Mở Serial Monitor của Wokwi. Dòng banner phải có `KHOGUARD_M12 ... transport=tls` và `boot=<32 ký tự>`.
4. Ở T0, đối chiếu dữ liệu thật từ ESP32:

```powershell
npm run firmware:check -- <boot-ID-32-ký-tự>
```

### 12.4 Thao tác trên ESP32 mô phỏng

| Muốn làm | Thao tác trong Wokwi |
| --- | --- |
| Quẹt thẻ | Gõ vào Serial Monitor: `RFID D07 DEMO-017 IN`, `RFID D07 DEMO-017 OUT`, `RFID D08 DEMO-999 IN` |
| Đổi nhiệt/ẩm | Bấm DHT22, kéo thanh nhiệt độ/độ ẩm |
| Cửa tới vị trí | Sau khi gửi lệnh mở/đóng, gạt switch contact của cửa đó trong 10 s |
| Rèm quang bị chắn / panic / còn người | Gạt switch beam, bấm nút panic, gạt switch mmWave |
| Gửi lệnh cửa | Dashboard → *Giám sát cửa* → D07/D08 → *Mở* / *Đóng* (tài khoản operator) |

Thẻ `DEMO-017`, `DEMO-018` được phép; `DEMO-999` và thẻ lạ bị từ chối. Sau mỗi lần boot, số người là *chưa xác minh* cho tới khi mmWave clear và không thẻ nào đang ở trong.

Thứ tự khi chạy lại: broker (T1) → gateway (T5) → Start Simulator. Nếu extension bị kẹt: F1 → **Developer: Reload Window**.

## 13. Bốn kịch bản demo

### 13.1 Chạy tự động

Cần broker + backend đang chạy; **dừng Wokwi** (script dùng ESP-C01 giả lập bằng Node):

```powershell
npm run demo:scenarios -- --scenario=all
```

Hoặc từng kịch bản `--scenario=1` … `--scenario=4`. Kết quả mong đợi: `M16 demo scenarios passed: 4 scenario(s), 20 steps.`, chi tiết ở `.local/demo-scenarios.json`. Kịch bản 4 tự hủy các giữ chỗ demo khi xong.

| # | Kịch bản | Điều phải thấy |
| --- | --- | --- |
| 1 | Ra/vào hợp lệ | Mở D07 *applied*; DEMO-017 vào → khu C 1 người; đóng khi còn người → *rejected OCCUPIED*; ra → 0; clear → đóng *applied* |
| 2 | RFID 0 nhưng còn người | Cảnh báo sai lệch hiện diện; đóng → *rejected PRESENCE_DETECTED*; mmWave hết → cảnh báo tự hết |
| 3 | Khẩn cấp | Panic → D07 mở, nhả khóa, cảnh báo nguy hiểm; tiếp nhận không xóa; đóng → *rejected PANIC_ACTIVE*; mất kết nối rồi nối lại: event không nhân đôi, event mất hiện gap |
| 4 | Kho đầy | 244/258 vị trí; hai yêu cầu đồng thời → một 201, một 409 `CAPACITY_LIMIT`; không vượt 95% |

### 13.2 Chạy tay với Wokwi

Làm theo bảng trên bằng thao tác ở mục 12.4 và trang *Nhận hàng* trên dashboard. Đối chiếu Serial Monitor, dashboard (*Nhật ký*, *Lịch sử / CSV*) và MySQL.

## 14. Lịch sử và xuất CSV

1. Dashboard → nút **Lịch sử / CSV** ở đầu trang (hoặc mục *Nhật ký*).
2. Chọn loại: sự kiện thiết bị, cảnh báo, lệnh cửa, giữ chỗ, ra vào theo ca (ra vào chỉ operator/admin).
3. Chọn khoảng thời gian (giờ Việt Nam, tối đa 31 ngày), khu A–D và loại chi tiết; bấm **Lọc**. *Tải thêm* lấy trang tiếp theo.
4. **Xuất CSV** tải tối đa 5.000 dòng theo đúng bộ lọc. File UTF-8 có BOM, mở đúng tiếng Việt trong Excel; ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm `'` để Excel không chạy công thức.

API tương ứng: `GET /api/reports/events|alerts|commands|reservations|access?from=&to=&zone=&type=&limit=&cursor=` (xem [server/README.md](../server/README.md)).

## 15. Kiểm tra toàn bộ

Chạy một lệnh để kiểm toàn bộ theo đúng thứ tự phụ thuộc. Cần broker (T1) và MySQL đang chạy. **Dừng** backend (T2), Vite (T3), mô phỏng (T4) và Wokwi trước, vì lệnh tự bật/tắt chúng:

```powershell
npm run verify:all
```

Thứ tự: unit test → test C++ firmware (nếu có g++) → `infra:mqtt:check`, `infra:db:check`, `infra:tls:check` → `infra:secrets:check` (tự bật Vite) → với backend tự bật: `backend:check`, `telemetry:check`, `events:check`, `control:check`, `auth:check`, `reservations:check`, `demo:scenarios` → không có backend: `recovery:check`, `reports:check`, `load:test`.

- Bỏ qua bước: `npm run verify:all -- --skip=load:test,infra:secrets:check`
- Kết quả từng bước ở `.local/verify-all.json`; số liệu tải ở `.local/load-test.json`.
- `infra:secrets:check` cần thư mục là Git checkout (có `.gitignore`).

Chạy riêng phép đo tải (dừng backend thường trước):

```powershell
npm run load:test -- --nodes=50 --seconds=60 --burst=500
```

50 node là 50 nguồn ảo gửi qua 5 tài khoản thiết bị đã đăng ký (25 message/s). Mục tiêu: P95 publish → hiển thị ≤ 2 s.

## 16. Dừng, khởi động lại hằng ngày và reset

**Dừng** (Ctrl+C ở từng cửa sổ, theo thứ tự): Wokwi (Stop Simulator) → T5 gateway → T4 mô phỏng → T3 Vite → T2 backend → T1 broker. Không dừng service MySQL hay Mosquitto 1883.

**Khởi động lại hằng ngày** (không cần lặp bước 2–6, 8):

```powershell
# T1
npm run infra:mqtt:start
# T2
npm run backend:start
# T3
npm run dev -- --strictPort
# T4 (tùy chọn)
npm run demo:warehouse -- --seed=17
# T5 + Wokwi (tùy chọn)
npm run firmware:gateway:start
```

Sau khi kéo code mới: `npm ci` (dừng Vite trước), `npm run db:migrate`, `npm run firmware:build` nếu firmware đổi.

**Reset dữ liệu demo:**

- Giữ chỗ: kịch bản 4 tự hủy; hoặc hủy ở trang *Nhận hàng*.
- Cảnh báo tự hết khi điều kiện kết thúc; panic cần lệnh *đặt lại khẩn cấp* riêng.
- Không xóa `.local/` rồi bootstrap lại trên schema đang có: sẽ mất credential và script sẽ từ chối nhận lại schema. Không drop schema để "làm sạch"; rollback thủ công chỉ làm sau khi backup (xem server/README).

## 17. Xử lý lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `npm ci` báo EPERM/EBUSY | Vite hoặc Node của dự án đang giữ file | Dừng Vite/backend dự án, chạy lại |
| `infra:mqtt:start` báo cổng bị chiếm | Broker dự án đã chạy ở cửa sổ khác | `Get-NetTCPConnection -LocalPort 18884,18885`; dừng đúng cửa sổ đó |
| `/api/ready` → `mqtt: disconnected` | Broker chưa chạy, hoặc đã `infra:tls:setup` mà chưa khởi động lại broker | Ctrl+C rồi `npm run infra:mqtt:start` ở T1, đợi backend tự kết nối lại |
| `/api/ready` → `database: unavailable` | MySQL service dừng hoặc chưa migrate | `Get-Service MySQL*`; `npm run db:migrate` |
| Backend thoát với `Missing or invalid <TÊN>` | `runtime.env` thiếu/sai biến | Chạy lại `infra:setup`, `infra:db:init` theo thứ tự; không sửa tay mật khẩu |
| `infra:db:init` dừng vì collision | Schema/tài khoản trùng tên đã có từ trước | Kiểm tra nguồn gốc schema; không xóa nếu không chắc là của dự án |
| Dashboard hiện *Mất kết nối backend* | Backend (T2) dừng | Khởi động lại; UI không tự quay về số mẫu |
| Đăng nhập báo 429 | Sai mật khẩu 5 lần | Đợi 60 giây rồi thử lại với mật khẩu trong `dashboard-users.json` |
| Lệnh cửa 409 `DEVICE_NOT_LIVE` | ESP-C01 chưa gửi telemetry live (Wokwi tắt) | Chạy Wokwi hoặc `demo:warehouse -- --with-fake-esp` |
| Lệnh cửa *expired* | ESP không ack trong 12 s | Xem Serial Monitor; gateway T5 phải đang chạy |
| Serial báo TLS lỗi / không kết nối | Chưa `firmware:prepare` sau `infra:tls:setup`, hoặc gateway chưa chạy | `npm run firmware:build`, chạy T5 trước Start Simulator |
| Wokwi báo license | License chưa kích hoạt/hết hạn | F1 → Wokwi: Request a New License |
| `recovery:check`, `reports:check`, `load:test` báo PORT_IN_USE | Backend thường đang chạy | Dừng T2 trước |
| `reservations:check` từ chối | Còn giữ chỗ pending của người khác | Hủy ở trang *Nhận hàng* rồi chạy lại |
| `verify:all` báo "Dừng backend đang chạy" | Backend T2 đang chạy | Dừng T2, chạy lại |
