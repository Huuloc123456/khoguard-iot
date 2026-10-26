# Công việc rút gọn một khu

- [x] Registry, fixtures và phạm vi dữ liệu hoạt động còn C / ESP-C01 / D07–D08.
- [x] Seed MySQL v1 giữ nguyên checksum và lịch sử; API/báo cáo/tiếp nhận loại các khu đã bỏ.
- [x] React và ThingsBoard theo một khu, hiển thị đúng PIR/siêu âm và độ mới dữ liệu trong model/API; Cloud đọc lại đúng ESP-C01.
- [x] Firmware/build/ACL/script mô phỏng được dọn; kiểm thử bảo vệ phạm vi mới.
- [x] Đối chiếu toàn bộ linh kiện, điện trở, chân GPIO trong cấu hình; có bảng dây và sơ đồ.
- [x] README, hướng dẫn demo, ADR và nhật ký được cập nhật.
- [x] PowerPoint 33 slide và Word 13 trang cập nhật, render và kiểm tra bố cục.
- [x] 128 unit, build web/ESP32, hai bộ C++ và 17 bước integration đạt; lưu bằng chứng và trạng thái còn thiếu.

## Cần nghiệm thu tương tác riêng

- [ ] Chạy lại Wokwi hiện hành: RFID, PIR, sonar mất echo/vật cản, Panic, contact, servo, cực tính relay và reboot/TLS sai; lưu Serial/ảnh/snapshot. Kết quả 13/10 thuộc cấu hình trước.
- [ ] Xem React và ThingsBoard trên trình duyệt/điện thoại, kiểm tra responsive và thời gian tới DOM. Lượt này chưa có công cụ trình duyệt kết nối.

[Kết quả và giới hạn](../docs/evidence/SINGLE-ZONE-2026-10-24.md), hoàn thiện ngày 25/10/2026.

## Nghiệm thu toàn bộ 25/10/2026

- [x] Wokwi trực tiếp: MFRC522 Blue IN/OUT; Red bị từ chối; PIR chặn đóng; sonar tĩnh chặn D07/D08; liên động; DHT22 cảnh báo/phục hồi; timer 30/>60 giây; Panic D07/D08; broker offline với Panic cục bộ và sự kiện MySQL sau reconnect.
- [ ] Wokwi: vật cản động trong lúc đang đóng để xác nhận đảo chiều (chưa bắt được thời điểm); reset Panic sau khi nhả nút trong cùng phiên (chưa hoàn tất).
- [ ] Fault cases chưa chạy/đủ bằng chứng: reboot, unknown, mất nguồn, stale, chứng chỉ sai và replay lệnh.
- [ ] Unit/C++/build và toàn bộ integration/API/security/storage/load chạy trên bản cuối.
- [ ] React desktop/mobile, vai trò, sáu trang, luồng thao tác/lỗi và console; ThingsBoard UI/API và phục hồi.
- [x] Hướng dẫn demo, lời nói theo 33 trang, sơ đồ nối dây có giải thích đơn giản, README và nhật ký được cập nhật.
- [ ] Báo cáo nghiệm thu còn lại: chạy các ca chưa có bằng chứng, lưu ảnh/log tải được trên điện thoại và kiểm tra dịch vụ sau lượt demo.
