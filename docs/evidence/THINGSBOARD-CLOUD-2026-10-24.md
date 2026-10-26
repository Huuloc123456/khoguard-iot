# ThingsBoard Cloud — kết nối và phục hồi 24/10/2026

**Đã tạo thiết bị/dashboard và xác nhận dữ liệu trên Cloud thật.** Giữ website KhoGuard/MySQL, không RPC. [Dashboard](https://thingsboard.cloud/dashboards/569b8ac0-cf55-11f1-afdc-397ada9afcbe). Readback sau phục hồi hoàn tất 09:54 UTC+7 ngày 24/10/2026. Chưa xác nhận giao diện trình duyệt hoặc dữ liệu môi trường mới từ Wokwi.

## Đã kiểm tra

- `npm.cmd test`: **131/131 đạt**, 0 bỏ qua, gồm 11 ca ThingsBoard. [Log](THINGSBOARD-CLOUD-2026-10-24/unit.tap).
- `node --check scripts/thingsboard.mjs`: đạt.
- `git diff --check`: đạt; các cảnh báo LF/CRLF là cấu hình Git hiện có.
- 11 test: registry/cửa, null/unverified, stale, timestamp gốc, snapshot sai/cũ/tương lai, nguồn mất kết nối, gộp trường, URL/host/TLS chính thức, chia bản tin tối đa 50 trường không mất giá trị/thời điểm, dashboard 4 bảng khu + 2 biểu đồ không widget điều khiển.
- Định danh widget `system.cards.entities_table` và `system.charts.basic_timeseries` được chính API Cloud trả 200, descriptor lần lượt `latest`/`timeseries`. Chưa kiểm chứng hiển thị bằng trình duyệt.
- `thingsboard:setup` khi API key trống dừng với `CLOUD_API_KEY_REQUIRED`, không in bí mật và không gọi Cloud có xác thực.
- Setup có key thật tạo `KhoGuard-WH01` và dashboard 6 widget; token chỉ lưu `.local`. Bật broker riêng, backend, Vite và SIM-C02; không tạo dữ liệu Node giả cho các nguồn Wokwi.
- MQTT/TLS + QoS1 và `thingsboard:check` đạt: [trước ngắt](THINGSBOARD-CLOUD-2026-10-24/live-before-outage.json). D09 fresh; các nguồn Wokwi stale/chưa rõ được chuyển nguyên nghĩa. Không có số đo môi trường mới trong lượt này.
- Dừng đúng PID backend của lượt này, giữ MySQL/broker/Vite/bridge/SIM-C02. Cloud nhận `source_available=false` cho cả 5 nguồn sau khoảng 12 giây: [kết quả](THINGSBOARD-CLOUD-2026-10-24/outage.json). Backend được bật lại trong finally; bridge tự gửi dữ liệu trở lại, [readback sau phục hồi](THINGSBOARD-CLOUD-2026-10-24/live-after-recovery.json) đạt.

## Lỗi phát hiện và sửa khi nghiệm thu

- Dùng hostname web làm MQTT host chưa đúng tài liệu mới: đã đổi sang `mqtt.thingsboard.cloud` / `mqtt.eu.thingsboard.cloud`, giữ TLS và kiểm tra chứng chỉ.
- Gói snapshot có 103 trường không nhận được PUBACK; HTTP Device API chẩn đoán trả 500 với gói này, nhưng bản tin nhỏ và các phần 50/50/3 trường đều trả 200. Không kết luận giới hạn gói chính xác chỉ từ lỗi này.
- Thêm test RED: host sai và gói quá 50 trường lỗi; sửa host/chia gói, GREEN 11/11. Bridge gửi từng object tối đa 50 trường, giữ timestamp gốc và đợi PUBACK. Sau sửa đọc lại dữ liệu từ Cloud thành công. Không hạ QoS hoặc bỏ xác minh TLS.

## Chưa kiểm tra

- Hiển thị UI Cloud trên trình duyệt/điện thoại; biểu đồ môi trường từ Wokwi đang chạy.
- Retry sau khi chính Cloud/Internet bị ngắt; lượt này kiểm tra nguồn backend ngắt/phục hồi.
- Hạn mức/quota theo thời gian dài. Không kích hoạt gói trả phí.

## Đầu ra

- `scripts/thingsboard.mjs`: setup, bridge, check.
- `integrations/thingsboard.mjs`: ánh xạ/kiểm tra snapshot, gộp dữ liệu theo device và cấu hình Cloud.
- `integrations/thingsboard-dashboard.mjs`: mẫu dashboard giám sát.
- `infra/thingsboard/dashboard-template.json`: JSON với ID placeholder; chưa phải dashboard đã kết nối.
- [Hướng dẫn người dùng](D:/huit/iot/source/khoguard-iot/docs/THINGSBOARD.md).

Thiết bị Cloud `KhoGuard-WH01` là một đại diện toàn kho. Các nguồn gốc hiện riêng qua tiền tố telemetry; không báo là đã tạo 5 device Cloud. API key đã xuất hiện trong chat nên khuyến nghị người dùng thu hồi sau setup/check; bridge dùng device token riêng.
