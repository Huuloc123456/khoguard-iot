# Cấu hình KhoGuard một khu trên Windows

Thực hiện tại thư mục gốc dự án bằng PowerShell. Phạm vi: C, ESP-C01, D07–D08. Không chạy lại bước tạo secret khi máy đã cấu hình.

## Công cụ

Node.js 24/npm, Git, MySQL Server, Mosquitto, VS Code, PlatformIO và Wokwi. Python 3.10+ chỉ cần cho bài lab tiếp nhận hàng trong [labs/python](../labs/python/README.md), không có thư viện ngoài. Wokwi for VS Code cần license hợp lệ theo nhà cung cấp. Docker/PostgreSQL không cần cho ThingsBoard Cloud.

## Cài và cấu hình lần đầu

```powershell
npm.cmd ci
npm.cmd run infra:setup
```

Mở `.local/mysql-admin.env` trên máy, điền MYSQL_ADMIN_USER/PASSWORD có quyền tạo schema và tài khoản riêng. Không gửi giá trị vào chat. Lưu rồi chạy:

```powershell
npm.cmd run infra:db:init
npm.cmd run db:migrate
npm.cmd run auth:setup
npm.cmd run infra:tls:setup
npm.cmd run firmware:gateway:setup
npm.cmd run firmware:build
```

TLS setup chạy khi broker dự án chưa bật. Tài khoản web demo lưu ở `.local/dashboard-users.json`. Cấu hình backend `.local/runtime.env`, CA/key trong `.local/tls`, header firmware `.local/firmware/kg_secrets.h`. `.local` phải được Git bỏ qua và Vite chặn HTTP.

## Máy đã có bản nhiều khu

Không reset DB hoặc đổi checksum migration đã áp dụng. Seed v1 được lưu cố định trong `db/seeds/registry-v1.json`. `node scripts/setup-mqtt.mjs` dùng lại mật khẩu hiện có, tạo ACL chỉ cho ESP-C01/backend/observer. Account cũ giữ riêng trên máy nhưng không có grant topic. Dừng broker dự án trước khi ghi cấu hình và bật lại sau đó. Không dừng Mosquitto service 1883 đang dùng cho việc khác.

## Chạy

```powershell
.\run.bat
```

Trong một cửa sổ VS Code firmware: F1 → Wokwi: Start Simulator. Dùng [hướng dẫn demo](HUONG_DAN_DEMO.md). Cổng web 5173, backend 3001, broker 18884/18885, MySQL 3306, gateway 9011 và forward 9080. HTTP health 200 chỉ xác nhận tiến trình; `/api/ready` phải báo database ready và mqtt connected.

## ThingsBoard Cloud

Theo [THINGSBOARD.md](THINGSBOARD.md), điền key tại `.local/thingsboard-cloud.env`, chạy setup rồi bridge. Cloud phụ có 3 widget cho khu C. API key chỉ cần setup/check, bridge dùng device token riêng. Dừng bridge sau demo để tránh gửi dữ liệu không cần thiết.

## Kiểm tra

`npm.cmd test`, `npm.cmd run build`, `npm.cmd run firmware:build`. Với MySQL và broker đang chạy, dừng Wokwi/backend/Vite/bridge rồi chạy `npm.cmd run verify:all`. Runner tự bật dịch vụ kiểm tra và giả lập ESP-C01. Xem `.local/verify-all.json`. Nghiệm thu Wokwi tương tác ghi riêng, không suy ra từ FakeEdge.
