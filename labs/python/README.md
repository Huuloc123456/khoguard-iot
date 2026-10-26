# Lab Python: tiếp nhận hàng và giữ chỗ

Bài lab này hiện thực ví dụ `validate_inbound_request` trong tài liệu **Nhóm 17–42, Phần 2, mục 2.7**:

1. Tìm ô trống có cùng vùng nhiệt độ và đủ tải trọng/thể tích.
2. Từ chối khi kho đã đạt 95% hoặc không còn ô phù hợp.
3. Giữ ô được chọn trong 15 phút để minh họa Soft Reserve; lần nhận hàng sau sẽ giải phóng lượt giữ đã hết hạn.

Chạy trên Windows từ thư mục gốc:

```powershell
py --version  # Python 3.10 trở lên
py labs\python\inbound_reservation.py
```

Chỉ dùng thư viện có sẵn của Python, không cần `pip install` hay `requirements.txt`.

Đây là bài lab Python độc lập, không kết nối MySQL và không được website gọi. Backend đang chạy của KhoGuard thực hiện luồng tiếp nhận tương ứng bằng JavaScript/MySQL với transaction để ngăn hai yêu cầu lấy cùng một ô. Bản Python giữ vai trò minh họa nội dung môn học, tránh chạy hai bộ quy tắc trong hệ thống thật.
