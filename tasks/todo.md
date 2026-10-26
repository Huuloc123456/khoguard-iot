# Công việc rút gọn một khu

- [x] Registry, fixtures và phạm vi dữ liệu hoạt động còn C / ESP-C01 / D07–D08.
- [x] Seed MySQL v1 giữ nguyên checksum và lịch sử; API/báo cáo/tiếp nhận loại các khu đã bỏ.
- [x] React và ThingsBoard theo một khu, hiển thị đúng PIR/siêu âm và độ mới dữ liệu trong model/API; Cloud đọc lại đúng ESP-C01.
- [x] Firmware/build/ACL/script mô phỏng được dọn; kiểm thử bảo vệ phạm vi mới.
- [x] Đối chiếu toàn bộ linh kiện, điện trở, chân GPIO trong cấu hình; có bảng dây và sơ đồ.
- [x] README, hướng dẫn demo, ADR và nhật ký được cập nhật.
- [x] PowerPoint 33 slide và Word 13 trang cập nhật, render và kiểm tra bố cục.
- [x] Nghiệm thu tự động 26/10: 130 unit, build web/ESP32, hai bộ C++ qua WSL, 4 bài Python, audit dependency và 17 bước integration đạt; xem [bằng chứng](../docs/evidence/ACCEPTANCE-2026-10-26.md).

## Cần nghiệm thu tương tác riêng

- [ ] Chạy lại Wokwi hiện hành: RFID, PIR, sonar mất echo/vật cản, Panic, contact, servo, cực tính relay và reboot/TLS sai; lưu Serial/ảnh/snapshot. Kết quả 13/10 thuộc cấu hình trước.
- [ ] Xem React và ThingsBoard trên trình duyệt/điện thoại, kiểm tra responsive và thời gian tới DOM. Lượt này chưa có công cụ trình duyệt kết nối.

[Kết quả và giới hạn](../docs/evidence/SINGLE-ZONE-2026-10-24.md), hoàn thiện ngày 25/10/2026.

## Nghiệm thu tương tác còn lại sau lượt 26/10/2026

- [x] Unit 130/130, build web, PlatformIO, hai bộ C++ qua WSL, Python 4/4, `npm audit` 0 lỗ hổng; `verify:all` 17 bước đạt, nhánh C++ bị bỏ qua trên Windows đã chạy riêng qua WSL.
- [x] Fault-suite Wokwi: reboot, beam/presence/contact unknown, mất dòng RFID, stale telemetry, CA sai, hostname sai, CA đúng kết nối lại và firmware gốc phục hồi đúng SHA.
- [ ] Wokwi hiện hành: vật cản động khi cửa đang đóng để xác nhận đảo chiều; MFRC522/contact/servo/relay; chuỗi nhả nút Panic rồi reset D07/D08.
- [ ] Wokwi hiện hành: dừng broker khi Panic, nối lại và đối chiếu event MySQL; lệnh trùng/phiên cũ; timer mở cửa 30/>60 s và presence liên tục >5 phút.
- [ ] Mất nguồn vật lý chưa thử; đồ án giữ phạm vi mô phỏng, không cần board thật để hoàn thành phần trình diễn.
- [ ] React/ThingsBoard: xem trên desktop và điện thoại sau khi rút gọn; kiểm tra trang, vai trò, luồng lỗi, console và thời gian tới DOM.
- [ ] Cập nhật ảnh/log tương tác sau khi chạy các ca trên; giữ bằng chứng đã loại secret.

Kết quả chi tiết của lượt tự động 26/10 ở [docs/evidence/ACCEPTANCE-2026-10-26.md](../docs/evidence/ACCEPTANCE-2026-10-26.md). Bằng chứng Wokwi trước 24/10 là cấu hình một khu nhưng chỉ chứng minh boot/telemetry; bằng chứng 13/10 thuộc bản trước khi rút gọn.
