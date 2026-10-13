# Nội dung slide thuyết trình — KhoGuard

**Đề tài:** Hệ thống IoT mô phỏng giám sát kho hàng và an toàn kho lạnh.  
**Nhóm thực hiện:** Nhóm 17 · Đề tài 42.  
**Ngày cập nhật:** 13/10/2026.  
**Quy mô bài trình bày:** 28 slide chính, chia 5 chương; gợi ý trình bày trong 20–25 phút, gồm demo ngắn.

## Cách sử dụng

- Mỗi mục “Slide” tương ứng một trang PowerPoint. Sao chép phần **Nội dung trên slide**; phần **Gợi ý trình bày** dùng làm lời nói hoặc ghi chú.
- Chèn hình ngay dưới mỗi slide. Sơ đồ mới nằm trong `D:/huit/iot/source/khoguard-iot/docs/slides/assets/`, định dạng SVG có thể phóng to mà không vỡ chữ. Ảnh giao diện nằm trong `docs/evidence/`.
- Dùng nền trắng, chữ xám đậm và điểm nhấn xanh theo giao diện KhoGuard; tỷ lệ 16:9. Mỗi slide nên giữ 3–5 ý, ưu tiên hình chiếm khoảng một nửa trang.
- Chương 1 và 2 bám hai tài liệu Word gốc. Chương 3–5 bổ sung triển khai, kiểm thử và kết luận theo mã nguồn/bằng chứng hiện tại.
- Tất cả cảm biến và cơ cấu chấp hành trong bản demo đều được mô phỏng. RFID hiện dùng cho **người ra/vào**; chưa triển khai truy vết pallet bằng RFID hay kết nối WMS thật.
- Ảnh giao diện là ảnh lưu từ các lượt kiểm thử trước; số người, cảnh báo và trạng thái kết nối trên ảnh thuộc thời điểm chụp, không phải trạng thái hiện tại. Số liệu kết quả có nguồn ở cuối tài liệu.
- Điền tên thành viên, giảng viên và lớp theo thông tin của nhóm trước khi nộp.

---

## Mở đầu

### Slide 01 — KhoGuard: Giám sát kho hàng và an toàn kho lạnh bằng IoT

**Nội dung trên slide**

- Đồ án môn Internet of Things — Nhóm 17, Đề tài 42.
- Mô hình quản lý 4 khu vực, 12 cửa và giám sát điều kiện môi trường.
- Trọng tâm: bảo vệ người trong kho lạnh bằng quy tắc an toàn tại thiết bị.
- Thực hiện bằng ESP32/Wokwi, PlatformIO, React, MQTT và MySQL.

**Hình chèn:** sơ đồ 4 khu. Đặt tên đề tài bên trái, hình bên phải; thêm thông tin thành viên và giảng viên ở chân trang.

![Mô hình bốn khu vực của KhoGuard](D:/huit/iot/source/khoguard-iot/docs/slides/assets/02-so-do-bon-khu.svg)

**Gợi ý trình bày:** Giới thiệu đây là đồ án mô phỏng toàn bộ luồng thiết bị → máy chủ → giao diện, tập trung kiểm chứng nguyên lý vận hành.

### Slide 02 — Nội dung trình bày

**Nội dung trên slide**

1. Khảo sát và thiết kế hệ thống kho hàng thông minh.
2. Thiết kế an toàn và vận hành kho lạnh.
3. Triển khai mô hình KhoGuard.
4. Demo và kết quả kiểm thử.
5. Kết luận, giới hạn và hướng phát triển.

**Hình chèn:** sơ đồ kiến trúc 4 tầng, thu nhỏ bên phải danh sách chương.

![Kiến trúc IoT bốn tầng](D:/huit/iot/source/khoguard-iot/docs/slides/assets/01-kien-truc-bon-tang.svg)

**Gợi ý trình bày:** Đi từ bài toán và quy tắc an toàn tới cách triển khai, sau đó dùng demo và bằng chứng để đánh giá kết quả.

---

## Chương 1 — Khảo sát, phân tích và thiết kế hệ thống kho hàng thông minh

### Slide 03 — Vì sao cần giám sát kho hàng bằng IoT?

**Nội dung trên slide**

- Kho nhiều cửa và nhiều khu vực khó theo dõi bằng thao tác thủ công.
- Cửa mở lâu gây thất thoát nhiệt và ảnh hưởng điều kiện bảo quản.
- Thông tin ra/vào, môi trường và sức chứa thường nằm rời rạc.
- Kho lạnh cần phát hiện người còn bên trong và hỗ trợ xử lý khẩn cấp.

**Hình chèn:** sơ đồ kho, khoanh khu C và các cửa D07/D08 khi đưa vào PowerPoint.

![Các khu cần giám sát trong mô hình](D:/huit/iot/source/khoguard-iot/docs/slides/assets/02-so-do-bon-khu.svg)

**Gợi ý trình bày:** Nhấn mạnh nhu cầu gom thông tin về một màn hình và xử lý rủi ro tại cửa. Đây là bài toán khảo sát, chưa có số liệu tiết kiệm chi phí hoặc năng lượng thực tế.

### Slide 04 — Mục tiêu và các nhóm chức năng

**Nội dung trên slide**

- Giám sát trạng thái cửa, nhiệt độ, độ ẩm và số người theo khu vực.
- Kiểm soát ra/vào bằng RFID, đối chiếu với lịch ca.
- Chặn đóng cửa khi còn người, có vật cản hoặc tín hiệu chưa rõ.
- Cảnh báo sự cố; lưu lịch sử và xuất báo cáo.
- Kiểm tra sức chứa và giữ vị trí trước khi nhận hàng.

**Hình chèn:** ảnh trang giám sát cửa; chọn phần thông tin tổng hợp và điều khiển D07/D08.

![Giao diện giám sát cửa và chỉ số toàn kho](D:/huit/iot/source/khoguard-iot/docs/evidence/CHECK-WINDOWS-2026-10-13/doors-live.png)

**Gợi ý trình bày:** Giao diện tập trung thông tin; quyết định an toàn của cửa D07/D08 vẫn do firmware thực hiện.

### Slide 05 — Phạm vi mô hình: 4 khu, 12 cửa

**Nội dung trên slide**

| Khu vực | Điều kiện nhiệt độ demo | Cửa | Nguồn dữ liệu |
| --- | --- | --- | --- |
| A — Kho thường | 18 đến 30 °C | D01–D03 | SIM-A01 |
| B — Kho mát | 2 đến 8 °C | D04–D06 | SIM-B01 |
| C — Kho lạnh | −22 đến −16 °C | D07–D09 | ESP-C01 và SIM-C02 |
| D — Khu đệm | 18 đến 28 °C | D10–D12 | SIM-D01 |

**Hình chèn:** sơ đồ 4 khu. Đánh dấu ESP-C01 điều khiển D07/D08; D09 thuộc script mô phỏng.

![Phạm vi thiết bị và cửa theo từng khu](D:/huit/iot/source/khoguard-iot/docs/slides/assets/02-so-do-bon-khu.svg)

**Gợi ý trình bày:** Có 5 danh tính thiết bị: một ESP32 chạy Wokwi và bốn thiết bị script Node. Các dải nhiệt độ là cấu hình của mô hình, không phải yêu cầu chung cho mọi loại hàng.

### Slide 06 — Thiết kế theo kiến trúc IoT 4 tầng

**Nội dung trên slide**

- **Thu thập và chấp hành:** cảm biến, RFID, trạng thái cửa và đầu ra cảnh báo.
- **Mạng:** gateway và truyền bản tin MQTT/TLS.
- **Máy chủ:** broker, backend xử lý nghiệp vụ và MySQL.
- **Ứng dụng:** dashboard giám sát, điều khiển, lịch sử và báo cáo.

**Hình chèn:** sơ đồ bốn tầng, đặt lớn ở giữa slide.

![Bốn tầng chức năng của hệ thống](D:/huit/iot/source/khoguard-iot/docs/slides/assets/01-kien-truc-bon-tang.svg)

**Gợi ý trình bày:** Tài liệu đề xuất thêm mạng công nghiệp, VLAN và phần cứng chuyên dụng. Bản demo dùng gateway Wokwi và dịch vụ cục bộ để kiểm chứng luồng xử lý.

---

## Chương 2 — Thiết kế an toàn và vận hành phân hệ kho lạnh

### Slide 07 — Các tín hiệu cần theo dõi tại kho lạnh

**Nội dung trên slide**

| Tín hiệu | Vai trò | Cách mô phỏng |
| --- | --- | --- |
| RFID IN/OUT | Theo dõi người ra/vào | Dòng lệnh Serial |
| Presence/mmWave | Đối chiếu người còn trong kho | Công tắc |
| Contact | Xác định trạng thái cửa | Công tắc |
| Rèm quang | Phát hiện vật cản tại cửa | Công tắc |
| Panic | Yêu cầu xử lý khẩn cấp | Nút nhấn |
| Nhiệt độ/độ ẩm | Theo dõi môi trường | DHT22 trên Wokwi |

**Hình chèn:** sơ đồ đầu vào/ra của ESP32. Đây là sơ đồ chức năng, không phải ảnh chụp Simulator.

![Đầu vào và đầu ra của mô hình ESP32](D:/huit/iot/source/khoguard-iot/docs/slides/assets/05-dau-vao-dau-ra.svg)

**Gợi ý trình bày:** Mô hình kiểm tra phản ứng với tín hiệu hiện diện, không đánh giá khả năng phát hiện người của radar thực tế. Camera nhiệt và CO₂ mới thuộc đề xuất mở rộng.

### Slide 08 — Chỉ đóng cửa khi mọi điều kiện đều an toàn

**Nội dung trên slide**

- Số người đã xác minh và bằng 0.
- Không phát hiện hiện diện; rèm quang không bị che chắn.
- Đầu vào đã xác nhận, không có panic và thỏa điều kiện liên động.
- Firmware tự kiểm tra lệnh; tín hiệu chưa rõ phải chặn đóng.

**Hình chèn:** sơ đồ điều kiện đóng cửa.

![Các điều kiện đồng thời để cho phép đóng cửa](D:/huit/iot/source/khoguard-iot/docs/slides/assets/03-dieu-kien-dong-cua.svg)

**Gợi ý trình bày:** Công thức nền tảng là `Cho phép đóng = Count xác minh bằng 0 AND Presence clear AND Beam clear`. Firmware bổ sung kiểm tra sức khỏe đầu vào, panic, liên động và tính hợp lệ của lệnh.

### Slide 09 — RFID và hiện diện kiểm tra chéo số người

**Nội dung trên slide**

- Thẻ hợp lệ quét vào/ra làm thay đổi số người trong kho.
- Đọc lặp không tăng số người; thẻ bị thu hồi hoặc không hợp lệ bị từ chối.
- Count bằng 0 nhưng presence vẫn có người: tiếp tục chặn đóng.
- Sau reboot, count chưa xác minh được hiển thị là chưa rõ.

**Hình chèn:** ảnh nhật ký RFID và số người ở khu C.

![Nhật ký RFID và kiểm tra người trong khu lạnh](D:/huit/iot/source/khoguard-iot/docs/evidence/M08-2026-10-13/m08-2-zone-c.png)

**Gợi ý trình bày:** Phân biệt “không có người” và “chưa biết số người”. Không dùng giá trị 0 để thay thế dữ liệu chưa xác minh.

### Slide 10 — Liên động hai cửa và cảnh báo mở lâu

**Nội dung trên slide**

- D07/D08 mô phỏng hai cửa của khu lạnh; chế độ bình thường có kiểm tra liên động.
- Rèm quang bị chắn trong lúc đóng: firmware yêu cầu đảo chiều mở.
- Cửa mở từ 30 giây: cảnh báo tại chỗ.
- Cửa mở quá 60 giây: nâng mức cảnh báo.
- Panic ưu tiên thoát hiểm, có thể vượt điều kiện liên động bình thường.

**Hình chèn:** ảnh D07/D08 trên màn hình điều khiển; thêm chú thích “liên động bình thường” và “panic ưu tiên”.

![Hai cửa D07 và D08 trên giao diện điều khiển](D:/huit/iot/source/khoguard-iot/docs/evidence/CHECK-WINDOWS-2026-10-13/doors-live.png)

**Gợi ý trình bày:** Mục tiêu liên động là hạn chế mở đồng thời khi vận hành bình thường. Khẩn cấp phải ưu tiên cứu người; không trình bày liên động như một điều kiện cản thoát hiểm.

### Slide 11 — Xử lý khẩn cấp tại thiết bị

**Nội dung trên slide**

- Panic: nhả khóa, yêu cầu mở cửa, bật đầu ra cảnh báo.
- Trạng thái khẩn cấp được chốt; nhả nút không tự xóa panic.
- Presence kéo dài khi hai cửa đóng quá 5 phút: cảnh báo nguy cơ mắc kẹt.
- Phản ứng cục bộ vẫn chạy khi broker mất kết nối.

**Hình chèn:** sơ đồ phản ứng panic.

![Chuỗi phản ứng khi nhấn nút khẩn cấp](D:/huit/iot/source/khoguard-iot/docs/slides/assets/04-phan-ung-panic.svg)

**Gợi ý trình bày:** Đèn, còi, sưởi và quạt được biểu diễn bằng LED. Chốt xả cơ học và relay an toàn độc lập là yêu cầu khi triển khai thực tế, chưa được lắp trong mô hình.

### Slide 12 — Kiểm soát sức chứa trước khi nhận hàng

**Nội dung trên slide**

- Chọn vị trí phù hợp nhiệt độ, kích thước và tải trọng.
- Tính sức chứa bằng vị trí đang chứa cộng vị trí đang giữ.
- Từ 85%: cảnh báo; giữ thêm làm vượt 95%: từ chối.
- Khu đệm đạt từ 95%: dừng nhận hàng dù kho còn chỗ.
- Giữ vị trí trong 15 phút, ngăn hai yêu cầu giữ cùng một ô.

**Hình chèn:** ảnh “Nhận hàng và giữ chỗ”, tập trung biểu đồ sức chứa và kết quả giữ vị trí.

![Chức năng nhận hàng và giữ vị trí](D:/huit/iot/source/khoguard-iot/docs/evidence/M13-2026-10-13/m14-1-reserved.png)

**Gợi ý trình bày:** Ngưỡng xét trên tỷ lệ thực bằng số nguyên, không lấy số phần trăm đã làm tròn trên UI. Dữ liệu vị trí/hàng đang chứa là seed demo, chưa đồng bộ WMS.

---

## Chương 3 — Triển khai mô hình KhoGuard

### Slide 13 — Công cụ và công nghệ sử dụng

**Nội dung trên slide**

| Thành phần | Công cụ/công nghệ | Vai trò |
| --- | --- | --- |
| Firmware | ESP32, C++, PlatformIO | Đọc tín hiệu và xử lý quy tắc cục bộ |
| Mô phỏng | Wokwi, script Node | Thực thi ESP32 và tạo dữ liệu các khu |
| Truyền thông | Mosquitto, MQTT/TLS | Trao đổi telemetry, sự kiện và lệnh |
| Máy chủ | Node.js | API, lưu dữ liệu và WebSocket |
| Cơ sở dữ liệu | MySQL | Dữ liệu vận hành và nghiệp vụ |
| Giao diện | React, Vite | Dashboard tiếng Việt, nền trắng |

**Hình chèn:** sơ đồ kiến trúc tổng thể; cắt phần sơ đồ phía trên, bỏ đoạn giải thích dài khi đưa lên slide.

![Các thành phần được triển khai trong KhoGuard](D:/huit/iot/source/khoguard-iot/docs/architecture/kien-truc-tong-the.png)

**Gợi ý trình bày:** PlatformIO dùng để build; Wokwi dùng để chạy mô phỏng. MySQL được giữ làm cơ sở dữ liệu thống nhất cho các quan hệ kho, cửa, người dùng và giữ chỗ.

### Slide 14 — Luồng dữ liệu và điều khiển

**Nội dung trên slide**

- ESP32/script → MQTT/TLS → Mosquitto.
- Backend kiểm tra hợp đồng dữ liệu và lưu vào MySQL.
- REST lấy dữ liệu ban đầu; WebSocket cập nhật giao diện.
- Lệnh cửa đi từ dashboard tới ESP32; thiết bị trả ACK áp dụng hoặc từ chối.
- Giao diện cập nhật trạng thái cửa theo dữ liệu thiết bị.

**Hình chèn:** sơ đồ tuần tự lệnh cửa D07.

![Luồng một yêu cầu điều khiển cửa và ACK](D:/huit/iot/source/khoguard-iot/docs/architecture/luong-lenh-cua.png)

**Gợi ý trình bày:** API nhận yêu cầu không có nghĩa cửa đã chuyển trạng thái. ACK của ESP32 và telemetry là bằng chứng kết quả thực thi trong mô phỏng.

### Slide 15 — MySQL lưu lịch sử và bảo vệ nghiệp vụ

**Nội dung trên slide**

- Lưu cấu trúc kho, thiết bị, trạng thái hiện tại và lịch sử telemetry.
- Ghi sự kiện RFID, cảnh báo và kết quả từng lệnh cửa.
- Lưu tài khoản, phiên đăng nhập, ca ra/vào và giữ chỗ.
- Transaction và ràng buộc duy nhất ngăn lưu trùng, giữ trùng vị trí.
- Dữ liệu còn sau khi tải lại trang hoặc khởi động lại backend.

**Hình chèn:** sơ đồ nhóm bảng MySQL; đây là nhóm chức năng, không phải ERD đầy đủ.

![Các nhóm bảng dữ liệu chính của KhoGuard](D:/huit/iot/source/khoguard-iot/docs/slides/assets/06-du-lieu-mysql.svg)

**Gợi ý trình bày:** MySQL phù hợp vì dữ liệu có quan hệ rõ và thao tác nhận hàng cần tính nhất quán. Không cần thêm một cơ sở dữ liệu thứ hai cho phạm vi demo này.

### Slide 16 — Dashboard giám sát toàn kho

**Nội dung trên slide**

- Các trang: Tổng quan, Sơ đồ kho, Giám sát cửa, Môi trường, Nhận hàng, Nhật ký.
- Hiển thị vị trí, trạng thái cửa và các chỉ số theo khu vực.
- Ghi rõ nguồn Wokwi/script và dữ liệu mới, cũ hoặc chưa rõ.
- Điều khiển D07/D08 hiển thị trạng thái chờ, áp dụng, từ chối hoặc hết hạn.
- Giao diện tiếng Việt, nền trắng, hỗ trợ màn hình nhỏ.

**Hình chèn:** ảnh giao diện giám sát cửa; đặt lớn, hạn chế thêm chữ đè lên ảnh.

![Dashboard KhoGuard nền trắng](D:/huit/iot/source/khoguard-iot/docs/evidence/CHECK-WINDOWS-2026-10-13/doors-live.png)

**Gợi ý trình bày:** Giải thích vì sao dữ liệu cũ vẫn có thể được xem để tra cứu nhưng không được coi là căn cứ an toàn để gửi lệnh đóng.

### Slide 17 — Phân quyền, lịch ca và bảo mật kết nối

**Nội dung trên slide**

- Viewer chỉ xem; operator vận hành; admin thêm quyền xem nhật ký đăng nhập.
- RFID được đối chiếu lịch ca và lưu nhật ký ra/vào; lối ra không bị chặn theo ca.
- Mỗi thiết bị có tài khoản MQTT và ACL giới hạn topic.
- MQTT/TLS xác minh CA và hostname; bí mật nằm ngoài mã nguồn.
- Bản demo chạy cục bộ; chưa cấu hình triển khai web ra Internet.

**Hình chèn:** ảnh nhật ký ra/vào và đối chiếu ca làm việc.

![Đối chiếu RFID với lịch ca và nhật ký ra vào](D:/huit/iot/source/khoguard-iot/docs/evidence/M13-2026-10-13/m13-3-access-audit.png)

**Gợi ý trình bày:** Lịch ca trong mô hình là dữ liệu demo tại MySQL. Chưa kéo lịch từ WMS; trạng thái ngoài ca được ghi nhận, không biến phần mềm thành cơ chế ngăn thoát hiểm.

### Slide 18 — Nhật ký và báo cáo phục vụ truy vết

**Nội dung trên slide**

- Tra cứu sự kiện thiết bị, cảnh báo, lệnh cửa và giữ chỗ.
- Lọc theo thời gian, khu vực và loại dữ liệu.
- Phân biệt cảnh báo đã tiếp nhận với cảnh báo đã hết điều kiện.
- Xuất CSV UTF-8, bảo vệ ô dữ liệu trước nội dung công thức.

**Hình chèn:** ảnh trang nhật ký có bộ lọc và bảng lịch sử MySQL.

![Bộ lọc lịch sử và chức năng xuất CSV](D:/huit/iot/source/khoguard-iot/docs/evidence/M15-2026-10-13/m15-1-history-filter.png)

**Gợi ý trình bày:** Tiếp nhận cảnh báo chỉ ghi nhận người vận hành đã biết sự cố; nó không làm điều kiện nguy hiểm tự biến mất.

---

## Chương 4 — Demo và kết quả kiểm thử

### Slide 19 — Demo 1–2: Ra/vào hợp lệ và kiểm tra chéo hiện diện

**Nội dung trên slide**

| Tình huống | Thao tác demo | Kết quả cần thấy |
| --- | --- | --- |
| Người vào | Quét `DEMO-017 IN` | Count tăng 1; đóng bị từ chối |
| Người ra | Quét OUT, presence/beam clear | Count 0 xác minh; được phép đóng |
| Count 0 nhưng còn presence | Bật công tắc presence | Đóng bị từ chối; ghi nhận sai lệch |

**Hình chèn:** ảnh lệnh cửa bị từ chối; khi demo trực tiếp mở thêm tab Wokwi và trang Giám sát cửa.

![Giao diện hiển thị kết quả từ chối lệnh](D:/huit/iot/source/khoguard-iot/docs/evidence/M10-2026-10-13/m10-3-command-rejected.png)

**Gợi ý trình bày:** Kiểm tra trường hợp có người theo RFID và trường hợp RFID/presence không khớp. Không dùng thao tác tiếp nhận cảnh báo để bỏ qua kiểm tra an toàn.

### Slide 20 — Demo 3–4: Panic và từ chối nhận hàng

**Nội dung trên slide**

- **Panic:** nhấn nút → nhả khóa, yêu cầu mở cửa, bật cảnh báo.
- **Mất broker:** panic vẫn phản ứng tại ESP32; sự kiện gửi lại khi nối mạng.
- **Nhận hàng:** yêu cầu giữ chỗ làm vượt ngưỡng sức chứa bị từ chối.
- Không còn vị trí phù hợp nhiệt độ/kích thước/tải trọng cũng phải từ chối.

**Hình chèn:** sơ đồ panic và ảnh từ chối vị trí, bố trí cạnh nhau.

![Phản ứng panic khi mất kết nối trung tâm](D:/huit/iot/source/khoguard-iot/docs/slides/assets/04-phan-ung-panic.svg)

![Ví dụ từ chối vì không có vị trí phù hợp](D:/huit/iot/source/khoguard-iot/docs/evidence/M13-2026-10-13/m14-2-no-slot.png)

**Gợi ý trình bày:** Ảnh từ chối vị trí minh họa lỗi không có ô phù hợp, không phải ảnh kho đầy 95%. Bốn kịch bản tự động dùng FakeEdge; các ca panic/mất broker có bằng chứng Wokwi riêng.

### Slide 21 — Tín hiệu chưa rõ và dữ liệu cũ phải chặn đóng

**Nội dung trên slide**

- Beam, presence hoặc contact chưa xác nhận: firmware từ chối đóng.
- Mất dòng RFID làm count chưa xác minh: tiếp tục từ chối đóng.
- Telemetry quá cửa sổ 10 giây: backend trả `409 DEVICE_NOT_LIVE`.
- Ca stale không phát lệnh MQTT; thiết bị khác vẫn nhận dữ liệu bình thường.

**Hình chèn:** sơ đồ điều kiện đóng cửa; tô nổi nhánh “chưa rõ → từ chối” khi trình bày.

![Tín hiệu chưa rõ không được coi là điều kiện an toàn](D:/huit/iot/source/khoguard-iot/docs/slides/assets/03-dieu-kien-dong-cua.svg)

**Gợi ý trình bày:** Các lỗi đầu vào được tạo bằng bản firmware kiểm thử riêng trên Wokwi; `controller.h` giữ nguyên. Ca tín hiệu trả ACK `INPUT_UNKNOWN`; ca stale bị chặn từ API.

### Slide 22 — Nghiệm thu reboot và chứng chỉ sai

**Nội dung trên slide**

- Reboot thật bằng `ESP.restart()`: boot ID đổi, count trở về chưa xác minh.
- Presence còn người sau reboot: lệnh đóng nhận `INPUT_UNKNOWN`.
- CA sai và hostname sai: chính ESP32 từ chối xác minh TLS.
- Boot bị từ chối không phát telemetry; nạp cấu hình đúng kết nối lại được.

**Hình chèn:** sơ đồ reboot và TLS; có thể thêm dòng Serial “Certificate verification failed” từ log nghiệm thu.

![Kết quả nghiệm thu reboot và xác minh TLS trên ESP32](D:/huit/iot/source/khoguard-iot/docs/slides/assets/08-reboot-va-tls.svg)

**Gợi ý trình bày:** Chứng minh bằng ESP32 chạy Wokwi, không chỉ bằng client Node. Sau kiểm thử đã phục hồi firmware bình thường và xác nhận 5/5 thiết bị online/fresh.

### Slide 23 — Kết quả kiểm thử chức năng và tải

**Nội dung trên slide**

| Nội dung kiểm tra | Kết quả ghi nhận |
| --- | --- |
| Unit JavaScript sau sửa lỗi | 109/109 đạt, 0 bỏ qua |
| Wokwi bổ sung unknown/stale, reboot, TLS và phục hồi | 9/9 nhóm đạt |
| Hai bộ test C++ chạy riêng qua WSL | Đạt |
| Tải 50 nguồn ảo, 5 danh tính thiết bị | Lưu 2.000/2.000 bản tin |
| Publish → WebSocket | P95 211 ms; chưa đo DOM |

**Hình chèn:** bảng kết quả dạng 4 ô chỉ số; dùng hình làm nội dung chính nếu bảng chữ chiếm quá nhiều diện tích.

![Các chỉ số kiểm thử có bằng chứng](D:/huit/iot/source/khoguard-iot/docs/slides/assets/07-ket-qua-kiem-thu.svg)

**Gợi ý trình bày:** Các con số thuộc những lượt kiểm thử có báo cáo riêng. 50 nguồn ảo không phải 50 tài khoản thiết bị độc lập; 211 ms là tới WebSocket, chưa chứng minh độ trễ hiển thị trên màn hình.

### Slide 24 — Lỗi phát hiện trong kiểm thử và cách khắc phục

**Nội dung trên slide**

- Từ chối lệnh tới thiết bị stale từng làm backend xóa xác nhận phiên của mọi thiết bị.
- Đã tách lỗi nghiệp vụ khỏi xử lý lỗi transaction MySQL.
- Test hồi quy chứng minh: từ chối lệnh không làm thiết bị khác mất freshness.
- Khóa dòng MySQL 9,5 giây: readiness báo lỗi, không ghi nhận dữ liệu chưa lưu là mới.
- Nhả khóa: 3 frame tồn đọng lưu đúng một lần sau 418 ms, rồi phục hồi dữ liệu mới.

**Hình chèn:** sơ đồ nhóm bảng MySQL; thêm mũi tên “lỗi ghi → backlog → lưu lịch sử → live mới” bên dưới.

![Cơ sở dữ liệu và các nhóm dữ liệu cần bảo toàn](D:/huit/iot/source/khoguard-iot/docs/slides/assets/06-du-lieu-mysql.svg)

**Gợi ý trình bày:** Số đo 418 ms thuộc lượt kiểm tra sau sửa lỗi gần nhất; không phải cam kết phục hồi cho mọi sự cố DB. Lỗi DB thật vẫn làm mất xác nhận phiên để tránh coi dữ liệu cũ là an toàn.

---

## Chương 5 — Kết luận và hướng phát triển

### Slide 25 — Những kết quả đã đạt

**Nội dung trên slide**

- Dựng được luồng IoT từ ESP32/Wokwi qua MQTT, backend và MySQL tới React.
- Giám sát 4 khu, 12 cửa và phân biệt nguồn dữ liệu.
- Kiểm chứng chặn đóng, liên động, panic, timer và phản ứng khi mất mạng.
- Có phân quyền, nhận hàng/giữ chỗ, nhật ký và xuất CSV.
- Lưu bằng chứng kiểm thử và phục hồi firmware bình thường sau nghiệm thu.

**Hình chèn:** kiến trúc tổng thể; đánh dấu các thành phần đã kết nối.

![Hệ thống KhoGuard đã tích hợp](D:/huit/iot/source/khoguard-iot/docs/architecture/kien-truc-tong-the.png)

**Gợi ý trình bày:** Giá trị của đồ án là mô hình tích hợp và các tình huống kiểm chứng rõ ràng. Chưa có phép đo thực địa để kết luận mức tiết kiệm nhiệt, chi phí hoặc hiệu quả vận hành thực tế.

### Slide 26 — Giới hạn của mô hình hiện tại

**Nội dung trên slide**

- Cảm biến, cửa và đầu ra được mô phỏng; chưa nghiệm thu phần cứng.
- Chưa có camera nhiệt, AI, CO₂, relay an toàn hay chốt thoát hiểm thật.
- Chưa kết nối WMS, truy vết pallet bằng RFID hoặc quy trình xuất kho.
- M16 còn phép đo publish → hiển thị DOM.
- M17 còn người nhận chạy lại cấu hình và demo trên máy khác.

**Hình chèn:** sơ đồ Wokwi, thêm nhãn “phạm vi mô phỏng”.

![Phạm vi mô phỏng và đầu vào đầu ra](D:/huit/iot/source/khoguard-iot/docs/slides/assets/05-dau-vao-dau-ra.svg)

**Gợi ý trình bày:** Không khẳng định mô hình đạt chứng nhận an toàn hoặc đã thử được khả năng phát hiện người bất tỉnh. Mạng công nghiệp/VLAN trong tài liệu là phương án thiết kế, chưa triển khai ở demo localhost.

### Slide 27 — Hướng phát triển tiếp theo

**Nội dung trên slide**

1. Đo độ trễ tới DOM và hoàn tất quy trình bàn giao có người chạy lại.
2. Thử phần cứng thật: cảm biến, motor, khóa và cơ cấu thoát hiểm.
3. Tích hợp WMS, lịch ca, xuất kho và RFID cho hàng hóa.
4. Triển khai mạng/HTTPS và bảo vệ truy cập khi mở rộng ngoài localhost.
5. Đánh giá cảm biến bổ sung và hiệu quả vận hành bằng dữ liệu thực tế.

**Hình chèn:** sơ đồ kiến trúc bốn tầng; gắn nhãn mở rộng tương ứng từng tầng.

![Các tầng có thể phát triển tiếp từ mô hình](D:/huit/iot/source/khoguard-iot/docs/slides/assets/01-kien-truc-bon-tang.svg)

**Gợi ý trình bày:** Ưu tiên đóng các phép đo/bàn giao còn thiếu, sau đó mới mở rộng phần cứng và tích hợp. Thêm cảm biến cần kiểm chứng khả năng phát hiện trong môi trường kho lạnh thực tế.

### Slide 28 — Cảm ơn và trao đổi

**Nội dung trên slide**

- Cảm ơn thầy/cô và các bạn đã theo dõi.
- Nhóm 17 — KhoGuard, Đề tài 42.
- Sẵn sàng demo: ra/vào RFID, chặn đóng, panic và giữ chỗ nhận hàng.
- Trao đổi về kiến trúc, quy tắc an toàn và kết quả kiểm thử.

**Hình chèn:** sơ đồ 4 khu thu nhỏ; để khoảng trống lớn cho lời cảm ơn.

![Mô hình KhoGuard dùng cho phần trao đổi](D:/huit/iot/source/khoguard-iot/docs/slides/assets/02-so-do-bon-khu.svg)

**Gợi ý trình bày:** Giữ dashboard và tab Simulator sẵn sàng nếu cần minh họa thêm. Không chạy lại các ca thay firmware/TLS ngay trong buổi trình bày nếu chưa chuẩn bị thời gian phục hồi.

---

## Nguồn nội dung và số liệu — dùng cho ghi chú hoặc slide phụ lục

| Nguồn | Nội dung sử dụng |
| --- | --- |
| [Tài liệu Phần 1](D:/huit/iot/doc/Nhóm_17_42_Phần_1_updated.docx) | Khảo sát kho, kiến trúc 4 tầng, các phân hệ và luồng dữ liệu |
| [Tài liệu Phần 2](D:/huit/iot/doc/Nhóm_17_42_Phần_2.docx) | An toàn kho lạnh, cảm biến, liên động, panic, sức chứa, lịch ca và bốn demo |
| [README hiện tại](D:/huit/iot/source/khoguard-iot/README.md) | Công cụ, chức năng và trạng thái triển khai |
| [Registry thiết bị](D:/huit/iot/source/khoguard-iot/contracts/devices.json) | 4 khu, 12 cửa, 5 danh tính; D07/D08 thuộc ESP-C01 |
| [Kiến trúc](D:/huit/iot/source/khoguard-iot/ARCHITECTURE.md) | Thành phần, nhóm bảng, quy tắc và ngưỡng cấu hình; các mục trạng thái cũ phải đối chiếu báo cáo mới nhất |
| [Wokwi lượt đầu](D:/huit/iot/source/khoguard-iot/docs/evidence/WOKWI-2026-10-13.md) | RFID, presence, rèm quang, liên động, panic, mất broker và timer |
| [Wokwi bổ sung](D:/huit/iot/source/khoguard-iot/docs/evidence/WOKWI-REMAINING-2026-10-13.md) | 9/9 nhóm, 109/109 unit, reboot/TLS, lỗi backend, MySQL 418 ms, phục hồi 5/5 fresh |
| [Review sau Claude](D:/huit/iot/source/khoguard-iot/docs/evidence/REVIEW-CLAUDE-2026-10-13.md) | C++ qua WSL, build, tải 2.000 bản tin, 50 nguồn ảo và P95 WebSocket 211 ms |
| [M14 nhận hàng](D:/huit/iot/source/khoguard-iot/docs/evidence/M14-2026-10-13.md) | Ngưỡng 85/95%, giữ 15 phút, kiểm tra hai yêu cầu đồng thời |
| [Kế hoạch và ma trận kiểm thử](D:/huit/iot/source/khoguard-iot/Agent.md) | M01–M17, các ca kiểm thử và phần còn thiếu |

## Gợi ý rút gọn còn 15 slide

Giữ các slide **01, 02, 03, 05, 06, 08, 11, 12, 14, 16, 20, 22, 23, 26, 28**. Dồn ra/vào RFID vào lời demo của slide 08; kết luận bằng kết quả ở slide 23 và giới hạn ở slide 26. Đánh số lại sau khi chọn.
