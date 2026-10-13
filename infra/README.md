# M02 — môi trường cục bộ KhoGuard

Đã kiểm tra ngày 12/10/2026 trên Windows: Mosquitto 2.1.2, MySQL 26.7.0, Node 24.19. M02 có broker/schema/account thật; dashboard vẫn dùng dữ liệu mẫu, chưa có backend ingest hoặc firmware.

Tiến độ sau M02: [firmware M03](../firmware/README.md) đã gửi telemetry; [backend M04](../server/README.md) có inventory/pool/health/readiness. MQTT ingest và dashboard dữ liệu thật thuộc M05–M06.

## Chuẩn bị và khởi động

```powershell
npm ci
npm run infra:setup
```

`.npmrc` tắt lifecycle install scripts; các dependency đang dùng không có install hook. Trên Windows, dừng Vite của dự án trước `npm ci` để thư viện native không bị khóa. Không dừng toàn bộ process Node hoặc dịch vụ MySQL/Mosquitto khác.

`infra:setup` tạo `.local/`, giới hạn NTFS cho người dùng hiện tại và SYSTEM, sinh mật khẩu ngẫu nhiên 192-bit và cấu hình broker. Chạy lại giữ nguyên mật khẩu/account đã có. Script không sửa config hoặc password file của dịch vụ đang chạy.

Thông tin admin chỉ dùng lúc bootstrap: mở `.local/mysql-admin.env`, điền `MYSQL_ADMIN_USER` và `MYSQL_ADMIN_PASSWORD`, lưu lại. Nếu password có `#`, đặt giá trị trong dấu ngoặc kép theo định dạng env. Không gửi password vào chat và không đưa vào `VITE_*`.

```powershell
npm run infra:db:init
npm run infra:mqtt:start
```

`infra:mqtt:start` chạy foreground trên **127.0.0.1:18884**, kiểm tra cổng trước khi start. Nếu cổng bị chiếm, dừng và kiểm tra; không tự kill process khác. Ctrl+C dừng broker của terminal này. Đây là MQTT không TLS chỉ dành localhost; TLS ở M12, private gateway Wokwi phải xác minh ở M03. [Cấu hình Mosquitto](https://mosquitto.org/man/mosquitto-conf-5.html).

## Tài khoản và quyền

| Tài khoản | Quyền |
| --- | --- |
| MQTT `khoguard-backend` | Đọc telemetry/events/status/acks của các device; ghi commands |
| MQTT `khoguard-observer` | Chỉ đọc năm loại topic; dùng để quan sát bằng MQTTX |
| MQTT năm device trong registry | Chỉ ghi dữ liệu của chính mình, chỉ đọc commands của chính mình |
| MySQL `khoguard_runtime@localhost` | SELECT/INSERT/UPDATE/DELETE trên `khoguard_demo.*` |
| MySQL `khoguard_migrate@localhost` | DDL/DML cần cho migration trên `khoguard_demo.*`; không có GRANT OPTION/global privileges |

Broker mặc định deny, anonymous bị chặn. Hash password do `mosquitto_passwd` tạo; file hash chỉ đưa vào sử dụng khi đã tạo đủ account. [Password utility](https://mosquitto.org/man/mosquitto_passwd-1.html).

Bootstrap từ chối nếu schema/tên account đã tồn tại mà không có marker của lần provision này; không ALTER USER, reset password hay drop database. Sau khi hoàn tất, chạy lại xác minh setup ID/server UUID rồi bỏ qua DDL/GRANT. Chuỗi lệnh bootstrap không được rollback như một transaction DML: setup bị gián đoạn có state `creating` sẽ chặn retry tự động; phải đối chiếu marker và xử lý đúng tài nguyên dự án. [CREATE USER](https://dev.mysql.com/doc/refman/8.4/en/create-user.html), [GRANT](https://dev.mysql.com/doc/refman/8.4/en/grant.html).

`db/bootstrap.sql` là template được helper kiểm tra collision và thay token bằng password hex ngẫu nhiên; không chạy template trực tiếp. Bảng `infra_meta` chỉ giữ marker ownership M02; migration/seed nghiệp vụ ở M04.

## File local và bảo vệ secret

- `.local/mysql-admin.env`: admin do người dùng điền, ứng dụng không sử dụng account này.
- `.local/runtime.env`: cấu hình backend/migration tương lai; có thể dùng Node `--env-file=.local/runtime.env` khi script runtime được triển khai.
- `.local/mysql-users.json`, `mysql-state.json`: credential và marker của schema.
- `.local/mosquitto/accounts.json`: password theo username; nhập account observer vào MQTTX để quan sát.
- `.local/mosquitto/passwords`, `acl`, `mosquitto.conf`, `data/`: broker/persistence riêng.
- `.local/mqtt-check.json`, `mysql-check.json`: kết quả probe không chứa secret.

`.local/` bị Git ignore và Vite chặn HTTP; `.env*`, `.pem`, `.key` có bảo vệ tương ứng. Các `.env.example` là mẫu trống. Không xóa `.local` rồi bootstrap lại trên schema đang có: sẽ mất credential/marker cục bộ và script từ chối nhận sở hữu schema đó.

## Kiểm thử chạy lại

Mở broker ở một terminal, mở Vite ở terminal thứ hai:

```powershell
npm run dev -- --strictPort
```

Terminal kiểm thử:

```powershell
npm test
npm run infra:mqtt:check
npm run infra:db:check
npm run infra:secrets:check
npm run build
```

MQTT có 11 kiểm tra thực tế; DB có 6 kiểm tra, gồm DML rollback, DDL migration và từ chối quyền; secret check xác minh 4 file Git ignore và 5 URL HTTP 403. DB probe chỉ cleanup bảng chính lần chạy đã tạo thành công.

MQTT probe gửi fixture lên topic demo: chạy trước phiên demo hoặc khi nguồn/backend mô phỏng đã dừng, không chạy chen vào phiên đang đo. DB probe không reset dữ liệu nghiệp vụ. `npm test` chỉ unit/contract; các probe integration chạy riêng.

Dependency runtime dùng manifest/lockfile gốc; chưa có server manifest riêng. [MQTT.js](https://github.com/mqttjs/MQTT.js), [mysql2](https://sidorares.github.io/node-mysql2/docs).

M03 sẽ tạo firmware và thử Wokwi/private gateway; các probe Node không chứng minh license, TLS hoặc firmware đã chạy.
