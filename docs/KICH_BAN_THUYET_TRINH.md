# Kịch bản thuyết trình KhoGuard

> Lời nói mẫu cho bộ PowerPoint **33 trang, 5 chương**. Thời lượng khoảng 7–9 phút, chưa tính lúc chờ thiết bị phản hồi. Có thể chia người nói tại các tiêu đề chương. Phạm vi hiện hành là **một khu C, ESP-C01 và hai cửa D07–D08**.

Nguồn đối chiếu: [Nội dung từng slide](NOI_DUNG_SLIDE.md), [hướng dẫn demo](HUONG_DAN_DEMO.md), [linh kiện và sơ đồ nối dây](LINH_KIEN_VA_NOI_DAY.md). Thao tác thực tế chỉ dùng trong Wokwi.

## Mở đầu — trang 1–2 (khoảng 30 giây)

**Trang 1:** “Em xin chào thầy cô và các bạn. Nhóm 17 xin trình bày đề tài KhoGuard, mô hình giám sát và hỗ trợ vận hành một kho lạnh. Phần trình bày tập trung vào cấu hình đang chạy được: khu C, một bộ điều khiển ESP32 và hai cửa D07, D08.”

**Trang 2:** “Bài trình bày có năm phần: bài toán và phạm vi; linh kiện và quy tắc an toàn; cách triển khai; demo và kết quả; cuối cùng là giới hạn và hướng hoàn thiện.”

## Chương 1 — Bài toán và phạm vi, trang 3–7 (khoảng 1 phút)

**Trang 3:** “Đầu tiên là lý do cần theo dõi cửa và môi trường của kho lạnh.”

**Trang 4:** “Nếu cửa mở lâu, có người bên trong hoặc có vật cản, hệ thống cần báo cho người vận hành và hạn chế lệnh đóng nguy hiểm. Người xem cũng cần biết dữ liệu mới hay đã cũ.”

**Trang 5:** “Mục tiêu của mô hình là đọc cảm biến, xử lý quy tắc tại ESP32, hiển thị trên website và lưu lịch sử ở MySQL. ThingsBoard Cloud chỉ bổ sung một màn hình quan trắc.”

**Trang 6:** “Trong bản ban đầu, hệ thống rộng hơn. Sau khi rút gọn, phần đang hoạt động chỉ còn một khu C và hai cửa D07, D08. Dữ liệu lịch sử cũ vẫn được giữ trong MySQL nhưng không được xem như thiết bị đang hoạt động.”

**Trang 7:** “Luồng chính là cảm biến gửi tín hiệu cho ESP32; ESP32 áp dụng điều kiện an toàn rồi gửi trạng thái qua MQTT; backend lưu sự kiện và website hiển thị cho người vận hành.”

## Chương 2 — Linh kiện, đi dây và quy tắc cửa, trang 8–14 (khoảng 1 phút 20 giây)

**Trang 8:** “Sang phần linh kiện, đây là mô hình mô phỏng nên các đầu ra tải được thay bằng đèn báo.”

**Trang 9:** “ESP32 là bộ não. DHT22 đo nhiệt độ và độ ẩm; RFID đọc thẻ; PIR báo chuyển động; hai cảm biến siêu âm đo khoảng cách. Công tắc contact cho biết cửa đang mở hay đóng.”

**Trang 10:** “Sơ đồ cho thấy các cảm biến và nút nối vào chân GPIO. Khi giải thích dây, có thể nhớ đơn giản: dây nguồn nuôi thiết bị, dây GND là đường về, còn dây tín hiệu mang lời báo về bộ não.”

**Trang 11:** “Relay giống như công tắc điện được ESP32 bấm hộ. Servo quay để minh họa cánh cửa; trong demo, contact vẫn do người trình diễn gạt tay. Vì vậy servo không chứng minh cửa thật đã di chuyển đến đúng vị trí.”

**Trang 12:** “Điều kiện đóng cửa xét người được ghi nhận, chuyển động PIR, vật cản và trạng thái cửa còn lại. Nếu thiếu dữ liệu chắc chắn hoặc có điều kiện nguy hiểm thì lệnh đóng bị từ chối.”

**Trang 13:** “Hai cửa cùng một khu có liên động. Ví dụ D07 đang mở thì không cho mở D08. Khi có Panic, mô hình ưu tiên mở lối thoát và bật chỉ thị cảnh báo.”

**Trang 14:** “Một số quy tắc ở đây chỉ là quy tắc của mô hình. PIR không bảo đảm phát hiện người đứng yên; HC-SR04 không thay được thiết bị an toàn công nghiệp.”

## Chương 3 — Triển khai và tích hợp, trang 15–21 (khoảng 1 phút 20 giây)

**Trang 15:** “Tiếp theo là cách triển khai chương trình trên ESP32, backend và website.”

**Trang 16:** “Firmware được xây dựng bằng PlatformIO trong VS Code và mô phỏng bằng Wokwi. Khi chạy, ESP32 đọc đầu vào, kiểm tra điều kiện và phát bản tin trạng thái.”

**Trang 17:** “MQTT làm đường chuyển tin giữa ESP32 và backend. Khi mất broker, những phản ứng cục bộ như đầu ra Panic vẫn do firmware điều khiển.”

**Trang 18:** “Backend xác thực lệnh, kiểm tra trạng thái và ghi sự kiện vào MySQL. Website gửi yêu cầu và nhận lại trạng thái qua API/WebSocket.”

**Trang 19:** “Website React là màn hình thao tác chính. Người vận hành xem cửa, nhiệt độ, cảnh báo và lịch sử; lệnh vẫn phải được bộ điều khiển kiểm tra.”

**Trang 20:** “ThingsBoard Cloud nhận dữ liệu qua bridge và giúp xem biểu đồ từ xa. Đây là phần bổ sung, không thay MySQL hay website KhoGuard.”

**Trang 21:** “Dữ liệu cũ được phân biệt với dữ liệu mới. Nếu thiết bị không gửi bản tin kịp thời, giao diện không nên làm người dùng tưởng rằng số liệu cũ vẫn là hiện tại.”

## Chương 4 — Demo và kết quả, trang 22–28 (khoảng 2 phút, gồm thao tác)

**Trang 22:** “Bây giờ em xin trình diễn một số luồng chính. Các tín hiệu được tạo trong Wokwi, không phải cảm biến và khóa kho thật.”

**Trang 23:** “Đầu tiên là thẻ RFID. Thẻ Blue được chấp nhận, một lượt vào làm số người tăng. Quẹt chiều ra thì số người giảm; thẻ Red bị từ chối và được lưu sự kiện.”

**Trang 24:** “Tiếp theo, khi PIR báo chuyển động, lệnh đóng bị chặn. PIR chỉ phát hiện chuyển động nên không thể kết luận chắc chắn rằng một khu vực không còn người.”

**Trang 25:** “Khi sonar báo vật cản ở khoảng cách gần, yêu cầu đóng bị từ chối. Trong lần nghiệm thu này, thao tác chặn đóng do vật cản tĩnh đã đạt ở cả hai cửa.”

**Trang 26:** “Bảng ở slide này ghi checkpoint kiểm tra tự động trước đó. Em xin cập nhật kết quả Wokwi trực tiếp ngày 25 tháng 10: đã thử RFID, PIR, vật cản tĩnh, liên động, cảnh báo giữ cửa lâu, Panic hai cửa, DHT22 và mất broker rồi phục hồi. Panic cục bộ vẫn hoạt động khi broker ngắt và sự kiện đã được MySQL nhận sau khi kết nối lại.”

**Trang 27:** “Có hai giới hạn cần nói rõ. Thứ nhất, chưa kích hoạt được vật cản đúng trong lúc cửa đang đóng để chứng minh đảo chiều động; chỉ ca chặn lệnh đóng khi vật cản đã có sẵn được xác nhận. Thứ hai, reset khi nút Panic vẫn giữ bị firmware từ chối đúng mã PANIC_ACTIVE, nhưng chuỗi nhả nút rồi reset chưa được xác nhận trọn vẹn trong cùng phiên.”

**Trang 28:** “Bản hiện hành đã được thu gọn còn một khu và đồng bộ lại linh kiện, firmware, website, tài liệu, sơ đồ nối dây và dashboard Cloud. Các kết quả của cấu hình nhiều khu trước đây không được tính vào demo hiện tại.”

## Chương 5 — Kết luận và giới hạn, trang 29–33 (khoảng 1 phút)

**Trang 29:** “Cuối cùng là kết quả, giới hạn và phần cần làm tiếp.”

**Trang 30:** “Mô hình minh họa được đường đi từ ESP32 qua MQTT và backend tới MySQL, website và dashboard Cloud. Hai cửa cho phép trình bày liên động, vật cản, Panic và cảnh báo cửa mở lâu.”

**Trang 31:** “Đây chưa phải thiết bị an toàn công nghiệp. Cảm biến, ngưỡng, contact thủ công, servo và đèn chỉ phục vụ mô phỏng. Mạch thật còn cần thiết kế nguồn, cách ly điện áp, cơ cấu khóa và kiểm định an toàn.”

**Trang 32:** “Có thể chạy lại demo theo hướng dẫn trong README. Trước khi kết thúc cần nhả Panic, đóng hai contact, để sonar thông thoáng, đưa nhiệt độ về bình thường và xác nhận không còn cảnh báo.”

**Trang 33:** “Nhóm em xin kết thúc phần trình bày. Cảm ơn thầy cô và các bạn đã lắng nghe. Nhóm xin nhận câu hỏi.”

## Câu trả lời ngắn khi được hỏi

- **Sưởi/quạt bật theo nhiệt độ?** “Không. Trong logic hiện tại, nhiệt độ ngoài dải tạo cảnh báo. Đèn sưởi/quạt là đầu ra minh họa trạng thái mặc định hoặc phản ứng Panic, không phải bộ điều khiển nhiệt tự động.”
- **PIR có biết chắc còn người?** “Không. PIR phát hiện chuyển động; người đứng yên có thể không tạo tín hiệu.”
- **Relay có chạy động cơ/khóa thật không?** “Không trong mô hình này. Relay chỉ chuyển LED mô phỏng tải.”
- **Đã thử mọi trường hợp chưa?** “Chưa. Các ca đã quan sát được liệt kê trong hướng dẫn demo; đảo chiều khi gặp vật cản động và reset Panic sau nhả nút vẫn cần nghiệm thu bổ sung.”
- **Có thể lắp trực tiếp ngoài đời không?** “Không. Sơ đồ hiện tại dành cho Wokwi. Mạch thật cần chuyển mức ECHO 5 V, nguồn tải riêng, kiểm tra relay, cách ly và đánh giá an toàn.”
