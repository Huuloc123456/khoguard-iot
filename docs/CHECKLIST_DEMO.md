# Checklist nghiệm thu một khu

Kết quả tương tác trực tiếp ngày 25/10/2026. Xem [kịch bản demo đầy đủ](HUONG_DAN_DEMO.md); các dấu `[ ]` là việc còn thiếu, không được suy ra đạt từ kiểm thử tự động.

- [x] Wokwi tương tác: một ESP32 ESP-C01, hai cửa D07/D08; website/API/MQTT hoạt động trong phiên demo.
- [x] MFRC522: Blue `DEMO-017` IN/OUT; Red `DEMO-999` bị từ chối và sự kiện ghi MySQL.
- [x] PIR có chuyển động chặn đóng; hết tín hiệu thì điều kiện được gỡ.
- [x] Sonar tĩnh ở dưới 100 cm chặn lệnh đóng riêng cho D07 và D08.
- [x] Liên động: D07 mở rồi yêu cầu mở D08 bị từ chối.
- [x] DHT22: nhiệt độ ngoài dải tạo cảnh báo, trở về −19 °C thì gỡ; độ ẩm cập nhật.
- [x] Cửa mở: cảnh báo sau 30 giây, mức nghiêm trọng sau hơn 60 giây; đóng lại thì gỡ.
- [x] Panic D07 và D08; khi broker dự án mất, đầu ra Panic cục bộ vẫn hoạt động và event tới MySQL sau reconnect.
- [ ] Chưa xác nhận đảo chiều khi vật cản xuất hiện trong lúc cửa đang đóng; mới xác nhận chặn lệnh đóng với vật cản có sẵn.
- [ ] Chưa xác nhận trọn chuỗi nhả nút Panic rồi reset trong cùng phiên; reset khi nút còn giữ đã bị từ chối đúng `PANIC_ACTIVE`.
- [ ] Chưa kiểm tra mất echo, reboot, nguồn lỗi, dữ liệu stale, chứng chỉ sai và replay lệnh ở lượt nghiệm thu mới.
- [ ] Chưa kiểm tra trang React/ThingsBoard trên điện thoại trong lượt này.
- [ ] Chưa nghiệm thu mạch hoặc tải phần cứng thật. Không coi FakeEdge là bằng chứng thiết bị Wokwi.

Tiếp tục theo [hướng dẫn chi tiết](HUONG_DAN_DEMO.md), [sơ đồ và giới hạn linh kiện](LINH_KIEN_VA_NOI_DAY.md). Khi làm demo, kết thúc bằng hai cửa đóng, Panic nhả, sonar thông thoáng và nhiệt độ bình thường.
