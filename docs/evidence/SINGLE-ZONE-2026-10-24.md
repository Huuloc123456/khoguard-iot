# KhoGuard một khu — bằng chứng 24–25/10/2026

Phạm vi: khu C, ESP-C01, D07/D08. Giữ hai cửa để minh họa liên động trong cùng một khu. Múi giờ máy UTC+7; các JSON ghi UTC nên lượt sáng 25/10 có timestamp `2026-10-24T23:...Z`.

## Thay đổi được kiểm tra

- Registry, snapshot, React demo, bộ lọc API/report/access/reservation và dashboard chỉ chọn phạm vi hoạt động. Các truy vấn A/B/D và thiết bị đã bỏ bị từ chối.
- Giữ seed v1 trong `db/seeds/registry-v1.json`, không đổi SQL migration/checksum đã áp dụng, không xóa lịch sử MySQL. Backend check xác nhận chạy lại migration/seed không đổi dữ liệu.
- Còn một môi trường firmware `esp32dev`. MQTT ACL chỉ cấp topic ESP-C01 cho ba vai trò hiện hành. Firmware khu khác và simulator cũ được chuyển vào bản sao lưu riêng, không chạy cạnh ESP-C01.
- Đối chiếu 30 phần tử điện trong `firmware/diagram.json` với GPIO firmware; thêm 5 điện trở 220 Ω nối tiếp LED. Tên PIR và HC-SR04 đúng chức năng mô phỏng. Có bảng GPIO, nguồn và sơ đồ SVG riêng.

## Kết quả tự động

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| Node unit | 128/128, không bỏ qua | [TAP](SINGLE-ZONE-2026-10-24/unit.tap) |
| `npm.cmd run build` | Vite production thành công, 104 module | Đã chạy trên bản một khu; không phải kiểm tra DOM |
| PlatformIO `esp32dev` | Thành công; RAM 47.644 B, flash 934.657 B | Build local `.local/firmware-build/esp32dev/` |
| Controller và safety C++ | Hai binary biên dịch/chạy qua WSL đạt; chạy lại binary cuối đạt | [C++](SINGLE-ZONE-2026-10-24/cpp-final.log) |
| `npm.cmd run verify:all` | 17 bước đạt, 0 lỗi; một nhánh C++ bỏ qua trên Windows do thiếu g++ PATH | [JSON](SINGLE-ZONE-2026-10-24/verification-final.json), [log](SINGLE-ZONE-2026-10-24/verification-final.log) |
| `npm.cmd run scope:check` | Đúng C / ESP-C01 / D07,D08, 78 slot, không staging, từ chối phạm vi cũ | [Snapshot kiểm tra](SINGLE-ZONE-2026-10-24/scope-final.json) |
| ThingsBoard API đọc lại | Một nguồn ESP-C01; dashboard 3 widget, giữ ID cũ | [Cloud](SINGLE-ZONE-2026-10-24/cloud-final.log) |
| PPTX | 33 slide; package/layout/font policy/import không có finding; đã xem ảnh render từng slide | [Validation](SINGLE-ZONE-2026-10-24/presentation-validation.json) |
| DOCX | Word mở, repaginate và xuất PDF được 13 trang; đã xem ảnh render đủ trang | Bản cuối `docs/Bao_cao_KhoGuard_mot_khu.docx` |

17 bước của runner gồm unit, MQTT, DB, TLS, bảo vệ secret, backend, scope, telemetry, events, control, auth, reservations, write-fault, 4 kịch bản/20 bước demo, recovery, reports và load. C++ được kiểm tra riêng qua WSL, không ghi nhánh Windows bị bỏ qua là đã chạy.

### Đo tải một danh tính thiết bị

| Lượt | Lưu bản tin | P95 publish → WebSocket | P95 ingest burst | Reconnect fresh |
| --- | --- | --- | --- | --- |
| 24/10, số liệu dùng trong slide/Word | 58/58, mất 0 | 625 ms, 8 mẫu steady | 381 ms | 0,7 s |
| 25/10, runner cuối | 58/58, mất 0 | 499 ms, 8 mẫu steady | 288 ms | 0,2 s |

[Lượt 24/10](SINGLE-ZONE-2026-10-24/load-2026-10-24.json), [lượt 25/10](SINGLE-ZONE-2026-10-24/load-2026-10-25.json). Đây là 1 nguồn kiểm thử và 50 bản tin burst, không phải 50 ESP vật lý. Chưa đo từ publish tới DOM; kết quả WebSocket chỉ là mẫu không bị ghi đè trong cửa sổ broadcast.

## Tệp bàn giao và sao lưu

- [README](../../README.md), [bảng linh kiện](../LINH_KIEN_VA_NOI_DAY.md), [sơ đồ nối dây](../diagrams/so-do-noi-day.svg), [kiến trúc](../diagrams/kien-truc-mot-khu.svg).
- [PowerPoint](../slides/KhoGuard-thuyet-trinh.pptx), [Word](../Bao_cao_KhoGuard_mot_khu.docx), [nội dung từng slide](../NOI_DUNG_SLIDE.md).
- Word đồng thời cập nhật bản `D:\huit\iot\doc\Nhóm_17_42_Báo_cáo_mô_phỏng_đã_chỉnh_sửa.docx`; hash hai bản giống nhau.
- Giữ bản gốc PPT/Word, diff trước thay đổi và nguồn nhiều khu trong `.local/single-zone-backup-20261024/`. ZIP người dùng cung cấp được giữ nguyên. Thao tác xóa hàng loạt ban đầu bị duyệt tự động chặn (`blocked by policy`), nên chọn lưu trữ bằng di chuyển có kiểm tra đường dẫn, không xóa đệ quy.
- PDF/PNG dùng QA và script authoring tạm ở `.local/office/`, không đưa vào mã nguồn hay gói bàn giao.

## Trạng thái và giới hạn

Broker riêng, MySQL, backend, Vite và bridge hoạt động ở cuối lượt. Cloud nhận snapshot và phản ánh **stale** khi Wokwi chưa gửi mẫu mới; không tạo dữ liệu môi trường mới để thay thế. Backend sẵn sàng không có nghĩa ESP đang online.

Chưa nghiệm thu lại linh kiện tương tác Wokwi trên diagram mới, chưa xem bố cục trình duyệt/điện thoại và chưa thử phần cứng thật. Bằng chứng Wokwi 13/10 là lịch sử cấu hình trước. Các ca cần làm lại nằm trong [checklist](../CHECKLIST_DEMO.md) và [công việc còn lại](../../tasks/todo.md).

PIR không phát hiện chắc người bất động; xác minh count 0 khi PIR clear là giả định demo. HC-SR04 không phải rèm quang bảo vệ người. ECHO trực tiếp chỉ dùng mô phỏng số; mạch thật cần chuyển mức, nguồn tải riêng và kiểm tra chân strapping. Chưa xác nhận cực tính relay bằng thao tác simulator hiện hành. Không dùng sơ đồ này để vận hành kho có người thật.

## Chạy thử bổ sung sáng 25/10

Đã bật gateway và Start Wokwi trong đúng cửa sổ VS Code. Quan sát Serial có MQTT_ONLINE, heartbeat −18,4 °C/55%, ACK telemetry tăng liên tục và hai sonar clear sau khởi tạo. Web trả HTTP 200; database/MQTT ready. [Scope chạy thử](SINGLE-ZONE-2026-10-24/scope-run-2026-10-25.json) ghi fresh; [Cloud đọc lại](SINGLE-ZONE-2026-10-24/cloud-run-2026-10-25.log) ghi fresh và nhiệt độ mới. Trạng thái stale ở checkpoint trước là lịch sử, không phải kết quả sau khi Start.

Mới xác nhận khởi động và đường truyền; các ca tương tác, relay và bố cục trình duyệt còn giữ nguyên trạng thái chưa nghiệm thu đầy đủ.
