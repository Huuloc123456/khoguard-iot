# Kịch bản thuyết trình KhoGuard

> Lời nói mẫu cho bộ PowerPoint **37 trang, 5 chương**, đúng thứ tự slide trong [KhoGuard-thuyet-trinh.pptx](slides/KhoGuard-thuyet-trinh.pptx). Thời lượng khoảng 9–10 phút, chưa tính lúc chờ thiết bị phản hồi. Có thể chia người nói tại các tiêu đề chương. Phạm vi hiện hành là **một khu C, ESP-C01 và hai cửa D07–D08**; nội dung cập nhật đến 15/11/2026 (MQ-2 thay CO₂, safety relay theo Panic).

Nguồn đối chiếu: [Nội dung từng slide](NOI_DUNG_SLIDE.md), [hướng dẫn demo](HUONG_DAN_DEMO.md), [linh kiện và sơ đồ nối dây](LINH_KIEN_VA_NOI_DAY.md), [nghiệm thu 15/11](evidence/CHUONG2-2026-11-15.md). Thao tác thực tế chỉ dùng trong Wokwi.

## Mở đầu — trang 1–2 (khoảng 30 giây)

**Trang 1:** “Em xin chào thầy cô và các bạn. Nhóm 17 xin trình bày đề tài KhoGuard, mô hình giám sát và hỗ trợ vận hành một kho lạnh. Phần trình bày tập trung vào cấu hình đang chạy được: khu C, một bộ điều khiển ESP32 và hai cửa D07, D08.”

**Trang 2:** “Bài trình bày có bảy mục: phạm vi, thiết bị, triển khai, demo, kiểm thử, giới hạn và kết luận.”

## Chương 1 — Bài toán và phạm vi, trang 3–8 (khoảng 1 phút 20 giây)

**Trang 3:** “Đầu tiên là lý do cần theo dõi cửa và môi trường của kho lạnh.”

**Trang 4:** “Cửa không nên đóng khi còn người bên trong, khi PIR báo chuyển động, khi sonar thấy vật cản hoặc khi tín hiệu chưa rõ. Ngoài PIR, CO₂ tăng sau khi kho đã đóng kín cũng là dấu hiệu có người. Quy tắc của nhóm là ESP32 tự từ chối đóng, cửa còn lại phải đóng, Panic xử lý tại chỗ, và safety relay cắt nguồn khóa khi giữ Panic.”

**Trang 5:** “Luồng chính rất đơn giản: đo bằng DHT22, MQ-2, RFID, PIR, sonar và contact; ESP32 quyết định theo luật an toàn; backend lưu vào MySQL; React để vận hành, ThingsBoard là màn hình phụ.”

**Trang 6:** “Phạm vi đã được rút gọn còn một khu C, một ESP32 tên ESP-C01 và hai cửa liên động. Khu C có 78 vị trí dùng được, tức 80 vị trí vật lý trừ 2 vị trí xả đá. Các khu cũ vẫn còn trong MySQL nhưng chỉ là lịch sử.”

**Trang 7:** “Dữ liệu đi qua bốn lớp: ESP-C01 đọc cảm biến và xử lý tại chỗ, MQTT và API chuyển trạng thái và lệnh, MySQL lưu telemetry và sự kiện, giao diện React là chính và Cloud là phụ.”

**Trang 8:** “Nhìn theo góc độ an toàn thì hệ thống có ba lớp. Lớp edge là nút Panic và cảm biến; MQ-2 thay cảm biến CO₂, PIR thay radar, HC-SR04 thay rèm quang. Lớp cục bộ là safety relay và ESP32: relay cắt nguồn khóa mà không cần firmware hay mạng. Lớp máy chủ chỉ giám sát, ghi log và chuyển yêu cầu. Vì vậy khi mất mạng, ESP32 và safety relay vẫn xử lý được tại chỗ.”

## Chương 2 — Linh kiện và an toàn mô phỏng, trang 9–17 (khoảng 2 phút)

**Trang 9:** “Sang phần linh kiện, đây là mô hình mô phỏng nên các tải được thay bằng đèn báo.”

**Trang 10:** “Mạch có 33 phần tử điện. Nhóm nhận tín hiệu gồm DHT22, MQ-2 đóng vai cảm biến CO₂, đầu đọc RFID, PIR và hai cảm biến siêu âm. ESP32 đọc thêm contact, công tắc chiều quét thẻ và hai nút Panic. Đầu ra gồm 2 servo, 5 relay, trong đó có 2 safety relay, 5 đèn LED và một còi.”

**Trang 11:** “Sơ đồ cho thấy các tín hiệu nối vào GPIO. Phần mới là MQ-2 ở GPIO36 và hai safety relay nối thẳng từ nút Panic, không qua chân GPIO nào. Có thể nhớ đơn giản: dây nguồn nuôi thiết bị, dây GND là đường về, dây tín hiệu mang lời báo về bộ não.”

**Trang 12:** “Relay giống công tắc được ESP32 bấm hộ. Relay khóa lấy nguồn qua chuỗi safety relay. Relay trong Wokwi là loại npn: mức HIGH nối COM với NO. Servo chỉ minh họa cánh cửa; contact vẫn do người demo gạt tay, nên servo quay không chứng minh cửa đã tới đúng vị trí.”

**Trang 13:** “Đây là phần bổ sung quan trọng. Chân thứ hai của nút Panic nối thẳng vào safety relay; hai tiếp điểm thường đóng nối tiếp nhau rồi cấp nguồn cho hai relay khóa. Giữ Panic là khóa mất nguồn ngay, kể cả khi firmware bị treo. Nhóm đã thử bằng một sketch cố ý giữ khóa và bỏ qua Panic: với relay pnp cũ chỉ đúng 15/20 ca, đổi sang npn thì đúng cả 20/20. Khi nhả nút, firmware vẫn chốt Panic cho tới khi được đặt lại hợp lệ.”

**Trang 14:** “ESP32 chỉ chấp nhận lệnh đóng khi số người đã xác minh bằng 0, PIR không báo chuyển động, sonar thông thoáng, cửa còn lại đóng, tín hiệu rõ ràng và không có Panic. D07 đang mở thì D08 không được mở đồng thời.”

**Trang 15:** “Mỗi mốc thời gian có một phản ứng riêng. Panic phản ứng ngay và giữ chốt. Cửa mở từ 30 giây thì cảnh báo nhắc, quá 60 giây thì cảnh báo nghiêm trọng có đèn và còi. Contact không xác nhận trong 10 giây là lỗi hành trình. PIR hoặc CO₂ tăng kéo dài 5 phút khi hai cửa đóng thì báo nguy cơ người mắc kẹt.”

**Trang 16:** “Wokwi không có cảm biến CO₂ nên nhóm dùng MQ-2 thay vai trò. Từ 1.000 ppm, backend bật cảnh báo CO₂ cao, xuống dưới 900 ppm thì tự hết. Dấu hiệu mắc kẹt cần CO₂ từ 1.500 ppm và tăng ít nhất 200 ppm so với lúc kho vừa đóng kín; điều kiện tăng giúp không báo nhầm khi CO₂ còn sót lại từ ca làm việc trước. Bảng quy đổi ADC sang ppm được đo 61 mức trên Wokwi, sai số không quá 1%. Nếu rút dây, giá trị là null chứ không thành 0 ppm.”

**Trang 17:** “Cuối chương là sức chứa. Khu C có 80 vị trí vật lý, 78 khả dụng, ban đầu đang chứa 60. Giữ chỗ có hiệu lực 15 phút; tổng tối đa là 74 để không vượt ngưỡng 95%, yêu cầu làm tổng lên 75 bị từ chối.”

## Chương 3 — Triển khai hệ thống, trang 18–24 (khoảng 1 phút 30 giây)

**Trang 18:** “Tiếp theo là cách triển khai chương trình trên ESP32, backend và website.”

**Trang 19:** “Firmware viết bằng C++ với PlatformIO và chạy trong Wokwi. Mosquitto MQTT có TLS chuyển telemetry, sự kiện, lệnh và ACK; Node.js cùng MySQL kiểm tra và lưu dữ liệu. React là màn hình vận hành, ThingsBoard Cloud chỉ xem bản sao.”

**Trang 20:** “Dữ liệu quan trắc đi lên: ESP gửi qua MQTT-TLS, backend ghi MySQL, React và Cloud đọc trạng thái. Lệnh cửa đi ngược lại: operator gửi yêu cầu, backend kiểm tra phiên và thời hạn 10 giây, ESP tự kiểm tra rồi trả ACK. Backend không thể ép ESP bỏ qua điều kiện an toàn.”

**Trang 21:** “MySQL lưu telemetry, trạng thái gần nhất, sự kiện, cảnh báo, lệnh, phiên, lịch ca và giữ chỗ. Dữ liệu CO₂ đi trong telemetry dạng JSON nên không cần thêm migration. Lịch sử nhiều khu cũ được giữ nguyên, truy vấn hoạt động chỉ lọc khu C.”

**Trang 22:** “Website có sáu trang, gom thành ba nhóm việc. Theo dõi gồm tổng quan, sơ đồ kho, môi trường với DHT22, CO₂ và cảnh báo. Điều khiển là giám sát hai cửa, lệnh đang chờ và ACK. Nghiệp vụ là nhận hàng, giữ chỗ và nhật ký có xuất CSV; tài khoản admin còn xem được nhật ký đăng nhập.”

**Trang 23:** “Có ba lớp giới hạn quyền. Viewer chỉ xem, operator vận hành, admin xem thêm nhật ký đăng nhập. MQTT có ACL theo topic, TLS kiểm tra chứng chỉ và hostname, còn mật khẩu và token nằm trong thư mục .local, không đưa vào Git.”

**Trang 24:** “ThingsBoard Cloud là màn hình quan trắc phụ với ba widget: bảng khu C có cột CO₂, biểu đồ nhiệt độ và độ ẩm. Bridge gửi bản sao mỗi 10 giây qua TLS. Cloud không có nút điều khiển cửa.”

## Chương 4 — Demo và kết quả, trang 25–32 (khoảng 2 phút 30 giây, gồm thao tác)

**Trang 25:** “Bây giờ em xin trình diễn và trình bày kết quả. Các tín hiệu được tạo trong Wokwi, không phải cảm biến và khóa kho thật.”

**Trang 26:** “Đầu tiên là thẻ RFID. Thẻ Blue quét vào thì số người tăng; khi còn một người, firmware chặn lệnh đóng. Quét ra thì số người về 0. Thẻ Red bị từ chối, và nếu PIR báo chuyển động thì lệnh đóng vẫn bị chặn.”

**Trang 27:** “Panic ưu tiên lối thoát. Panic ở cả hai cửa đã chạy; khi mất broker, đầu ra tại ESP vẫn hoạt động và sự kiện tới MySQL sau khi kết nối lại. Giữ nút mà reset thì bị chặn đúng mã PANIC_ACTIVE. Chuỗi nhả nút rồi reset chưa được xác nhận trọn vẹn.”

**Trang 28:** “Tín hiệu mơ hồ hoặc quá cũ được xử lý theo hướng an toàn. Sonar gần hoặc echo cũ coi như có vật cản. Input chưa rõ thì không đóng. Dữ liệu ESP cũ quá 10 giây thì backend từ chối lệnh. Khi khởi động lại, phiên mới làm lệnh cũ hết hiệu lực.”

**Trang 29:** “Đây là kết quả Wokwi ngày 25 và 26 tháng 10. Đã đạt: RFID, PIR và sonar chặn đóng, liên động, DHT22, timer cửa, Panic hai cửa và phục hồi sau mất broker; fault-suite ngày 26/10 còn xác nhận reboot, mất echo và chứng chỉ TLS sai đều được xử lý đúng. Chưa xác nhận: đảo chiều khi có vật cản đúng lúc cửa đang đóng, reset Panic sau khi nhả nút, mất nguồn vật lý và phần cứng thật.”

**Trang 30:** “Kiểm thử tự động ngày 15/11 đạt 135 trên 135 unit test và 19 bước verify, không bỏ bước nào. Con số 625 mili giây là độ trễ P95 từ lúc publish tới WebSocket, đo ở lượt tải ngày 24/10. Các kết quả này chứng minh phần mềm, không chứng minh linh kiện hay cam kết độ trễ thiết bị.”

**Trang 31:** “Đợt bổ sung ngày 15/11 đã đạt: hiệu chuẩn MQ-2 với sai số không quá 1%, safety relay đúng 20/20 ca, test C++ cho CO₂ và build firmware. Còn chờ chạy trên Wokwi: cảnh báo CO₂ ở 1.200 ppm và tự hết ở 850 ppm, báo mắc kẹt theo CO₂ sau 5 phút, chạy lại Panic với relay npn và kiểm tra cột CO₂ trên Cloud. Nhóm không ghi các bước còn chờ là đạt.”

**Trang 32:** “So với bản trước có bốn khu và mười hai cửa, bản hiện hành còn một khu C, một firmware và hai cửa liên động, Cloud một bảng và hai biểu đồ, và 33 linh kiện khớp đúng mạch, có thêm MQ-2 và safety relay. Lịch sử MySQL vẫn được giữ nguyên.”

## Chương 5 — Kết luận và giới hạn, trang 33–37 (khoảng 1 phút 20 giây)

**Trang 33:** “Cuối cùng là kết quả, giới hạn và phần cần làm tiếp.”

**Trang 34:** “KhoGuard nối được tín hiệu, quy tắc và lịch sử trong một demo. Đo được nhiệt độ, độ ẩm, CO₂, thẻ, chuyển động, vật cản và contact. Bảo vệ bằng liên động, Panic, timeout, từ chối lệnh không an toàn và safety relay cắt khóa bằng phần cứng. Quan sát qua website và MySQL, ThingsBoard là bản sao Cloud.”

**Trang 35:** “Đây chưa phải thiết bị an toàn công nghiệp. Người đứng yên có thể không được PIR nhận ra; CO₂ giúp bổ sung, nhưng MQ-2 thật không đo CO₂. HC-SR04 không phải rèm quang an toàn. Mạch thật cần chuyển mức ECHO 5 V, nguồn riêng và cách ly. Servo, LED, relay và safety relay chỉ minh họa, và nhiệt độ không tự điều khiển sưởi hay quạt.”

**Trang 36:** “Demo được chạy theo một vòng dễ lặp lại: khởi động bằng run.bat, mở một tab Wokwi, kiểm tra trang web và ESP-C01 còn dữ liệu mới, trình diễn RFID, PIR và sonar, Panic, CO₂ và cảnh báo, rồi khôi phục: nhả Panic, đóng cửa, để sonar thông thoáng và chạy close.bat.”

**Trang 37:** “Nhóm em xin kết thúc phần trình bày. Cảm ơn thầy cô và các bạn đã lắng nghe. Nhóm xin nhận câu hỏi.”

## Câu trả lời ngắn khi được hỏi

- **Sưởi/quạt bật theo nhiệt độ?** “Không. Nhiệt độ ngoài dải chỉ tạo cảnh báo. Đèn sưởi/quạt là đầu ra minh họa trạng thái thường hoặc khẩn cấp, không phải bộ điều nhiệt tự động.”
- **PIR có biết chắc còn người?** “Không. PIR phát hiện chuyển động; người đứng yên có thể không tạo tín hiệu. CO₂ tăng sau khi kho đóng kín là dấu hiệu thứ hai, nhưng vẫn chỉ là dấu hiệu gián tiếp.”
- **Sao dùng MQ-2 mà gọi là CO₂?** “Wokwi không có cảm biến CO₂ nên MQ-2 đóng vai đó trong mô phỏng. MQ-2 thật đo khí dễ cháy và khói. Làm thật thì nên dùng cảm biến CO₂ loại NDIR và hiệu chuẩn lại ngưỡng.”
- **Sao cần CO₂ tăng 200 ppm, không chỉ vượt 1.500 ppm?** “Để không báo nhầm khi CO₂ còn cao từ ca làm việc trước. Phải tăng so với lúc kho vừa đóng kín mới cho thấy có người đang thở bên trong.”
- **Safety relay khác gì Panic trong firmware?** “Safety relay cắt nguồn khóa bằng dây cứng trong lúc nút đang bị giữ, kể cả khi firmware treo. Firmware lo phần chốt trạng thái sau khi nhả nút, ghi sự kiện và điều kiện reset.”
- **Relay có chạy động cơ/khóa thật không?** “Không trong mô hình này. Relay chỉ chuyển LED mô phỏng tải; safety relay cũng là relay mô phỏng, chưa phải mô-đun an toàn có chứng nhận.”
- **Đã thử mọi trường hợp chưa?** “Chưa. Đảo chiều khi gặp vật cản động, reset Panic sau nhả nút, và các bước CO₂ trên simulator vẫn cần nghiệm thu bổ sung.”
- **Có thể lắp trực tiếp ngoài đời không?** “Không. Sơ đồ hiện tại dành cho Wokwi. Mạch thật cần chuyển mức ECHO 5 V, cầu chia áp cho ngõ ra MQ-2, nguồn tải riêng, kiểm tra relay, cách ly và đánh giá an toàn.”
