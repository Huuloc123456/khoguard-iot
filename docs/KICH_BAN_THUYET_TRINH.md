# Kịch bản thuyết trình KhoGuard

> Lời nói mẫu cho bộ [BaoCaoPowerPoint.pptx](slides/BaoCaoPowerPoint.pptx), **11 trang**, đúng thứ tự slide. Nói hết khoảng 7 phút, chưa tính phần demo. Ba bạn có thể chia nhau: trang 1–4, trang 5–7, trang 8–11. Phạm vi hiện hành là **một khu C, ESP-C01 và hai cửa D07–D08**; số liệu theo báo cáo [BaoCao_DoAn_IOT_KhoGuard.docx](BaoCao_DoAn_IOT_KhoGuard.docx) và nghiệm thu 15/11/2026 (riêng thử tải là lượt 25/10).

Nguồn đối chiếu: [hướng dẫn demo](HUONG_DAN_DEMO.md), [linh kiện và sơ đồ nối dây](LINH_KIEN_VA_NOI_DAY.md), [nghiệm thu 15/11](evidence/CHUONG2-2026-11-15.md). Mọi thao tác đều làm trong Wokwi.

## Trang 1: Bìa (khoảng 20 giây)

“Em xin chào thầy và các bạn. Nhóm 17 gồm Hữu Lộc, Thanh Mẫn và Viết Long, dưới sự hướng dẫn của thầy Đinh Huy Hoàng, xin trình bày đề tài 42: hệ thống quản lý kho hàng thông minh. Sản phẩm tên KhoGuard, là mô hình một kho lạnh chạy bằng ESP32 trên Wokwi.”

## Trang 2: Bài toán (khoảng 40 giây)

“Kho lạnh có ba việc phải để ý cùng lúc. Thứ nhất là môi trường bảo quản: cửa mở lâu thì nhiệt độ trong kho thay đổi. Thứ hai là người trong kho: trước khi cho đóng cửa, hệ thống dùng RFID để đếm người và PIR để xem còn chuyển động không. Thứ ba là cửa và vật cản: contact cho biết cửa đóng hay mở, sonar cho biết lối cửa có bị chắn không, và nút Panic để người bên trong thoát ra.

Hình bên phải là trang Sơ đồ kho của KhoGuard: khu C có nhiệt độ, độ ẩm, CO₂ đo bằng MQ-2 và trạng thái hai cửa. Nguyên tắc của nhóm là ESP32 tự quyết định tại chỗ, còn máy chủ lưu lịch sử để người vận hành tra lại.”

## Trang 3: Phạm vi (khoảng 30 giây)

“Phạm vi gồm một khu lạnh C, một ESP32 tên ESP-C01 và hai cửa D07, D08. Nhóm đặt ba mục tiêu: thu tín hiệu và đánh dấu dữ liệu nào còn tin được; kiểm tra điều kiện cửa và xử lý Panic ngay tại thiết bị; lưu lịch sử, phân quyền và hỗ trợ nhận hàng.

Ranh giới cũng cần nói rõ. Toàn bộ chạy trong Wokwi, dải nhiệt độ khu C là âm 22 đến âm 16 độ C. Servo, relay và LED chỉ biểu diễn đầu ra; nhóm chưa lắp tải công suất hay cửa thật.”

## Trang 4: Kiến trúc (khoảng 40 giây)

“Dữ liệu đi từ trái sang phải. Tại kho, ESP-C01 đọc cảm biến, điều khiển cửa và xử lý Panic; cạnh nó có hai safety relay nối cứng với nút Panic. Bản tin qua Mosquitto bằng MQTT có TLS. Backend Node.js kiểm tra quyền, xử lý rồi lưu vào MySQL. Website React có sáu trang để theo dõi và gửi lệnh.

Chiều ngược lại, lệnh từ website không được làm thẳng: ESP32 kiểm tra điều kiện cửa rồi mới thực hiện hoặc trả lý do từ chối. ThingsBoard chỉ nhận bản sao dữ liệu quan trắc, còn MySQL giữ dữ liệu nghiệp vụ.”

## Trang 5: Linh kiện (khoảng 50 giây)

“Mạch Wokwi có 33 phần tử điện, kể cả công tắc và điện trở. Đầu vào gồm DHT22 đo nhiệt độ và độ ẩm; đầu đọc RFID MFRC522 đặt ở D07, có công tắc chọn chiều vào hay ra; PIR báo chuyển động; và MQ-2 nối GPIO36. Wokwi không có cảm biến CO₂ nên MQ-2 đóng vai đó. Mỗi cửa có riêng một contact, một sonar HC-SR04 và một nút Panic.

Đầu ra có hai servo biểu diễn cánh cửa, năm relay gồm hai relay khóa, một relay sưởi hoặc quạt và hai safety relay, cùng năm LED và một còi. Relay trong Wokwi là loại npn: mức HIGH nối COM với NO.”

## Trang 6: Hai cửa liên động (khoảng 40 giây)

“Firmware luôn dùng tín hiệu ở thời điểm hiện tại để quyết định. Muốn mở một cửa, contact phải rõ ràng và cửa còn lại phải đang đóng, không chuyển động. Vì vậy D07 mở thì D08 bị chặn, và ngược lại.

Lệnh đóng được xét theo năm bước, gặp bước nào trước thì trả mã đó: Panic còn chốt là PANIC_ACTIVE; tín hiệu hoặc số người chưa xác minh là INPUT_UNKNOWN; còn người trong kho là OCCUPIED; PIR còn chuyển động là PRESENCE_DETECTED; sonar bị chắn hoặc không có mẫu mới là BEAM_BLOCKED. Thứ tự cố định nên người vận hành luôn biết vì sao bị từ chối.”

## Trang 7: Panic và mốc thời gian (khoảng 1 phút)

“Nhấn Panic ở D07 hay D08 thì có ba bước. Một, nhả khóa cả hai cửa; safety relay cắt nguồn khóa bằng dây cứng trong lúc nút còn bị giữ, kể cả khi firmware treo. Hai, ESP32 bật đầu ra khẩn cấp: đèn, còi và sưởi bật, quạt tắt, tất cả là mô phỏng. Ba, nhả nút thì chốt vẫn giữ; chỉ khi nút đã nhả hợp lệ mới gửi lệnh reset được.

Bên phải là các mốc thời gian. Contact không tới đích sau 10 giây là lỗi hành trình. Cửa mở từ 30 giây thì bật đèn cảnh báo, quá 60 giây thì thêm còi. Hai cửa đóng mà PIR còn chuyển động, hoặc CO₂ tăng, kéo dài trên 5 phút thì báo nghi có người mắc kẹt. Với CO₂, phải đạt 1.500 ppm và tăng ít nhất 200 ppm so với lúc kho vừa đóng; điều kiện tăng giúp không báo nhầm khi CO₂ còn sót từ ca trước.

Một điểm hay bị nhầm: tiếp nhận cảnh báo chỉ ghi là đã xem, còn reset Panic mới đổi trạng thái chốt.”

## Trang 8: Website (khoảng 40 giây)

“Đây là ảnh thật trang Giám sát cửa, chạy với nguồn Backend và MQTT. Website có sáu trang theo công việc: Tổng quan cho cảnh báo và sức chứa; Sơ đồ kho cho khu C và hai cửa; Giám sát cửa để gửi lệnh, xem ACK và điều kiện cửa; Môi trường cho DHT22, CO₂ và dải bảo quản; Nhận hàng để chọn vị trí và giữ chỗ; Nhật ký để tra cứu, lọc và xuất CSV.

Có ba vai trò. Viewer có quyền xem giới hạn, operator được vận hành, admin được xem thêm nhật ký xác thực. Quyền được kiểm tra ở API, không chỉ ẩn nút trên giao diện.”

## Trang 9: ThingsBoard (khoảng 30 giây)

“ThingsBoard là màn hình giám sát phụ. Một chương trình bridge đăng nhập backend bằng tài khoản viewer, cứ 10 giây đọc trạng thái một lần rồi gửi lên thiết bị KhoGuard-WH01 trên Cloud. Dashboard có ba phần: bảng khu C gồm độ mới dữ liệu, môi trường, CO₂, số người và cửa; biểu đồ nhiệt độ và biểu đồ độ ẩm, vẽ theo thời điểm gốc của số đo. Cloud không có nút điều khiển cửa.”

## Trang 10: Sức chứa và nhận hàng (khoảng 40 giây)

“Kho chỉ nhận hàng đông lạnh, mỗi yêu cầu được cấp một vị trí vừa kích thước và tải trọng. Khu C có 80 vị trí, trừ 2 vị trí xả đá còn 78 vị trí dùng được; dữ liệu khởi tạo có sẵn 60 vị trí đang chứa hàng.

Vì sao giới hạn là 74? Hệ thống tính cả vị trí đã chứa và vị trí đang giữ chỗ. 74 trên 78 khoảng 94,87%, còn trong ngưỡng 95%; lên 75 là 96,15%, vượt ngưỡng nên bị từ chối. Từ 85% thì hệ thống cảnh báo. Một giữ chỗ chờ xác nhận được 15 phút; xác nhận thì thành vị trí đã chứa, hủy hoặc hết hạn thì trả lại vị trí.”

## Trang 11: Kết quả kiểm thử và kết thúc (khoảng 1 phút)

“Lượt kiểm tra tự động ngày 15/11 đạt 135 trên 135 unit test JavaScript và 19 bước kiểm tra tích hợp. Hai bộ test C++ cho bộ điều khiển và phần an toàn đều đạt, web và firmware ESP32 biên dịch được; bài thực hành Python đạt 4 trên 4 ở lượt 26/10. Bảng quy đổi MQ-2 được đo trên Wokwi, kiểm tra 20 điểm thì sai số không quá 1%. Safety relay đúng 20 trên 20 ca sau khi đổi sang loại npn; loại pnp cũ chỉ đúng 15 ca.

Bên phải là lượt thử tải ngày 25/10 với một danh tính thiết bị: 8 mẫu gửi đều và một đợt dồn 50 bản tin, lưu đủ 58 trên 58, độ trễ P95 từ lúc publish tới WebSocket là 499 mili giây.

Nhóm cũng ghi rõ phần chưa xong. Các bước trên simulator cho cảnh báo CO₂, mắc kẹt theo CO₂, chạy lại Panic với relay npn và cột CO₂ trên Cloud vẫn đang chờ; nhóm không ghi chúng là đạt. Đây là mô hình mô phỏng, chưa phải thiết bị an toàn công nghiệp.

Nhóm em xin kết thúc phần trình bày. Cảm ơn thầy và các bạn đã lắng nghe, nhóm xin nhận câu hỏi.”

## Phần demo (nếu thầy yêu cầu)

Chuẩn bị trước theo [hướng dẫn demo](HUONG_DAN_DEMO.md): bấm `run.bat` (lần đầu nó tự cài và cấu hình máy), mở một tab Wokwi, đăng nhập operator và kiểm tra ESP-C01 đang có dữ liệu mới.

1. Quét thẻ Blue chiều vào, số người lên 1; bấm đóng cửa, bị từ chối OCCUPIED. Quét chiều ra cho về 0.
2. Bật PIR hoặc kéo sonar xuống dưới 100 cm, bấm đóng cửa, bị từ chối PRESENCE_DETECTED hoặc BEAM_BLOCKED.
3. Giữ Panic: LED khóa tắt ngay, đèn và còi bật. Nhả nút rồi reset khẩn cấp trên trang Giám sát cửa.
4. Kéo MQ-2 lên 1.200 ppm để thấy cảnh báo CO₂ cao, hạ về 850 ppm để cảnh báo tự hết.
5. Khôi phục: nhả Panic, đóng hai cửa, để sonar thông thoáng, rồi chạy `close.bat`.

## Câu trả lời ngắn khi được hỏi

- **Sưởi/quạt bật theo nhiệt độ?** “Không. Nhiệt độ ngoài dải chỉ tạo cảnh báo. Đèn sưởi/quạt là đầu ra minh họa trạng thái thường hoặc khẩn cấp, không phải bộ điều nhiệt tự động.”
- **PIR có biết chắc còn người?** “Không. PIR phát hiện chuyển động; người đứng yên có thể không tạo tín hiệu. CO₂ tăng sau khi kho đóng kín là dấu hiệu thứ hai, nhưng vẫn chỉ là dấu hiệu gián tiếp.”
- **Sao dùng MQ-2 mà gọi là CO₂?** “Wokwi không có cảm biến CO₂ nên MQ-2 đóng vai đó trong mô phỏng. MQ-2 thật đo khí dễ cháy và khói. Làm thật thì nên dùng cảm biến CO₂ loại NDIR và hiệu chuẩn lại ngưỡng.”
- **Sao cần CO₂ tăng 200 ppm, không chỉ vượt 1.500 ppm?** “Để không báo nhầm khi CO₂ còn cao từ ca làm việc trước. Phải tăng so với lúc kho vừa đóng kín mới cho thấy có người đang thở bên trong.”
- **Cảnh báo CO₂ khác dấu hiệu mắc kẹt thế nào?** “Backend bật cảnh báo CO₂ cao từ 1.000 ppm và tự hết khi xuống dưới 900 ppm. Dấu hiệu mắc kẹt do firmware xét, cần hai cửa đóng và CO₂ hoặc PIR kéo dài trên 5 phút.”
- **Safety relay khác gì Panic trong firmware?** “Safety relay cắt nguồn khóa bằng dây cứng trong lúc nút đang bị giữ, kể cả khi firmware treo. Firmware lo phần chốt trạng thái sau khi nhả nút, ghi sự kiện và điều kiện reset.”
- **Relay có chạy động cơ/khóa thật không?** “Không trong mô hình này. Relay chỉ chuyển LED mô phỏng tải; safety relay cũng là relay mô phỏng, chưa phải mô-đun an toàn có chứng nhận.”
- **Website gửi lệnh đóng thì ESP32 có bắt buộc làm theo không?** “Không. Backend kiểm tra quyền, phiên và thời hạn 10 giây, nhưng ESP32 vẫn tự kiểm tra lại điều kiện hiện tại và có thể từ chối. Không có lệnh nào bỏ qua được điều kiện an toàn.”
- **Đã thử mọi trường hợp chưa?** “Chưa. Đảo chiều khi gặp vật cản đúng lúc cửa đang đóng, reset Panic sau khi nhả nút, và các bước CO₂ trên simulator vẫn cần nghiệm thu bổ sung.”
- **Có thể lắp trực tiếp ngoài đời không?** “Không. Sơ đồ hiện tại dành cho Wokwi. Mạch thật cần chuyển mức ECHO 5 V, cầu chia áp cho ngõ ra MQ-2, nguồn tải riêng, kiểm tra relay, cách ly và đánh giá an toàn.”
