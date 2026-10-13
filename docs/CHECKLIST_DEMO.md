# Checklist chạy và bàn giao KhoGuard

Ngày 13/10/2026. Phạm vi: Wokwi ESP-C01 và Node SIM-*, MySQL, React; mọi output cửa là mô phỏng.

## Chuẩn bị

- [ ] Theo [hướng dẫn cấu hình](HUONG_DAN_CAU_HINH.md) trên máy đủ công cụ; dùng `npm.cmd` nếu PowerShell chặn `npm.ps1`.
- [ ] MySQL 3306 và broker dự án 18884/18885 chạy; migration và tài khoản dashboard đã tạo.
- [ ] Bật backend 3001, Vite 5173, gateway 9011, `demo:warehouse` và Wokwi; giữ tab Simulator hiển thị.
- [ ] Đăng nhập operator; snapshot cho cả 5 thiết bị `fresh`. Kiểm tra nhãn Wokwi/Node và 12 cửa.
- [ ] Hai nút panic nhả, contact hai cửa phản ánh đúng vị trí, beam clear, mmWave LOW, không có thẻ bên trong. Trạng thái không rõ phải được giữ nguyên là không rõ.

Nếu gateway đã dừng/bật lại và ESP vẫn stale dù Serial có heartbeat: đóng hẳn tab Wokwi, rồi F1 → **Wokwi: Start Simulator**. Với extension 4.0.0, chỉ restart mô phỏng có thể giữ kết nối gateway đã đóng. Bật gateway trước khi mở phiên Simulator mới.

## Bốn demo

| Demo | Thực hiện và kết quả cần thấy |
| --- | --- |
| Ra/vào hợp lệ | Serial `RFID D07 DEMO-017 IN`, lặp lại → tăng đúng một; lệnh đóng bị chặn `OCCUPIED`; `RFID D07 DEMO-017 OUT` → về 0. Đối chiếu nhật ký MySQL và ca làm việc hiện tại. |
| RFID 0 nhưng còn người | mmWave HIGH khi count 0 → lệnh đóng bị chặn `PRESENCE_DETECTED`, có cảnh báo lệch hiện diện. Trả mmWave LOW rồi kiểm tra lại. |
| Khẩn cấp | Từ cửa đóng, kích hoạt từng panic → mở/nhả khóa và bật output. Tiếp nhận cảnh báo không bỏ latch; nhả nút rồi reset. Thử mất broker chỉ bằng harness `wokwi:acceptance`; không dừng dịch vụ dùng chung. |
| Kho đầy | `demo:scenarios -- --scenario=4` dùng nguồn giả ESP, nên dừng Wokwi/Node warehouse trước. Script tạo yêu cầu nhận hàng tại ngưỡng và xác nhận bị từ chối; tự dọn dữ liệu test. Khi demo thủ công, dùng thông số từ snapshot, không dùng phần trăm UI đã làm tròn. |

Toàn bộ demo tự động: backend và broker/DB bật, Wokwi và Node warehouse dừng, chạy `npm.cmd run demo:scenarios`. Đây là kiểm thử qua MQTT/DB với FakeEdge; nghiệm thu firmware thật dùng `npm.cmd run wokwi:acceptance` và người gạt công tắc.

## Postman

Import [collection API](postman/khoguard.postman_collection.json). `password` để trống trong file; điền giá trị cục bộ từ `.local/dashboard-users.json`, không lưu mật khẩu trong bản chia sẻ. Postman tự dùng cookie từ response đăng nhập.

1. Chạy folder 01, rồi 02 bằng viewer; readiness và các request đọc phải trả 200.
2. Khi cần vận hành, đổi username thành operator và đăng nhập lại. Chạy từng request folder 03, điền ID lấy từ response. Lệnh HTTP 202 mới là nhận yêu cầu; đọc trạng thái lệnh và telemetry để biết kết quả.
3. Không chạy toàn collection bằng Runner vì folder 03 có thao tác cửa và hàng hóa. Folder 04 đăng xuất khi xong.

## Kiểm tra và bàn giao

- [ ] `npm.cmd ci`, `npm.cmd test`, `npm.cmd run build` đạt từ bản mã nguồn sạch. Firmware build sau khi cấu hình secret riêng trên máy nhận.
- [ ] Dừng backend/Vite/Wokwi/Node warehouse trước `verify:all`, giữ broker và MySQL. Có `writefault:check` trong runner. Nếu thiếu g++ native, chạy hai bộ C++ bằng WSL như báo cáo kiểm tra.
- [ ] Đọc [nghiệm thu Wokwi ban đầu](evidence/WOKWI-2026-10-13.md), [Wokwi bổ sung T06/reboot/T20](evidence/WOKWI-REMAINING-2026-10-13.md), [lỗi ghi MySQL](evidence/M16-PART2-2026-10-13.md) và [hồi quy sau Claude](evidence/REVIEW-CLAUDE-2026-10-13.md), gồm các mục chưa kiểm chứng.
- [ ] Chỉ chia sẻ mã nguồn/tài liệu/lockfile, không đóng gói `.local`, `node_modules` hay firmware bin/elf có nhúng secret. Không coi ZIP đầu vào M06–M16 là bản bàn giao mới nhất.
- [ ] Người nhận chạy lại bốn demo, ghi ngày/máy/kết quả của họ. Checklist này là mẫu; dấu trống không có nghĩa đã nghiệm thu.

## Sau demo

Nhả nút panic, trả beam/mmWave về trạng thái nền, reset panic có quyền, hủy giữ chỗ còn pending do demo tạo. Kiểm tra cảnh báo đã resolved khi điều kiện hết. Bật lại Wokwi và Node warehouse; cả 5 thiết bị phải `fresh`. Không reset DB để dọn lịch sử.
