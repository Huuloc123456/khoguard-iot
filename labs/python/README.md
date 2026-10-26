# Thực hành Python trong KhoGuard

Project có hai bài Python lấy từ các nguồn môn học. Bài GPIO/Flask mô phỏng phần Raspberry Pi trong slide **3. Lập trình IoT (1)**; bài nhận hàng làm theo ví dụ `validate_inbound_request` trong tài liệu **Nhóm 17–42, Phần 2, mục 2.7**.

## Bài 1 — GPIO, PWM, nút nhấn và Flask

Mô phỏng API quen thuộc của `RPi.GPIO` trên Windows bằng `gpio_sim.py`, nên không cần Raspberry Pi hay linh kiện thật. Trang Flask điều khiển 3 LED ảo, đọc nút nhấn, phát hiện cạnh lên có debounce 600 ms và đổi duty cycle PWM.

Tạo môi trường riêng, cài Flask và chạy từ thư mục gốc:

```powershell
py --version  # Python 3.10 trở lên
py -m venv .local\labs-python
.local\labs-python\Scripts\python.exe -m pip install -r labs\python\requirements.txt
.local\labs-python\Scripts\python.exe -X utf8 labs\python\app.py
```

Mở `http://127.0.0.1:5002`. Thử bật/tắt từng LED, nhấn **Nút nhấn ảo** để kích callback, đổi PWM 0–100%, xem số lần ngắt tăng. Bấm Ctrl+C trong terminal để dừng.

Đây là Flask development server chỉ bind `127.0.0.1`, dành cho bài thực hành cục bộ, không triển khai công khai. GPIO là giả lập trong RAM; không điều khiển ESP-C01, relay hay thiết bị thật. [Tài liệu Flask](https://flask.palletsprojects.com/en/stable/quickstart/) mô tả route/template và mặc định local; [development server](https://flask.palletsprojects.com/en/stable/server/) chỉ dành cho phát triển.

## Bài 2 — Tiếp nhận hàng và giữ chỗ

Hiện thực ví dụ trong tài liệu Phần 2:

1. Lọc ô trống theo vùng nhiệt độ, tải trọng và thể tích.
2. Từ chối khi sức chứa hiện tại đạt 95% hoặc không có ô phù hợp.
3. Giữ ô được chọn 15 phút; lượt giữ hết hạn được giải phóng ở yêu cầu sau.

```powershell
.local\labs-python\Scripts\python.exe -X utf8 labs\python\inbound_reservation.py
```

Bài này dùng thư viện chuẩn, không cần Flask. Cả hai bài đều tách khỏi runtime chính: website/backend KhoGuard dùng JavaScript/MySQL; MySQL transaction vẫn là nơi chống trùng và giữ chỗ thực tế.

## Tự kiểm tra

```powershell
.local\labs-python\Scripts\python.exe -m unittest discover -s labs\python -p "test_*.py"
```
