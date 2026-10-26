> **Bản hiện hành một khu:** dùng [kiến trúc SVG](../diagrams/kien-truc-mot-khu.svg) và [sơ đồ nối dây](../diagrams/so-do-noi-day.svg). Các bản HTML dưới đây lưu kiến trúc nhiều khu trước rút gọn.

# Sơ đồ kiến trúc KhoGuard

Mở file `.html` bằng trình duyệt (không cần mạng). Ảnh `.png` cùng tên để chèn vào báo cáo.

| Sơ đồ | Nội dung |
| --- | --- |
| [kien-truc-tong-the.html](kien-truc-tong-the.html) | 9 thành phần trong 3 vùng (biên Wokwi/mô phỏng, máy chủ cục bộ 127.0.0.1, người dùng), cổng và giao thức |
| [luong-lenh-cua.html](luong-lenh-cua.html) | Tuần tự một lệnh mở cửa D07: dashboard → backend → MySQL/Mosquitto → ESP-C01 → ack → dashboard |

Vẽ theo skill [diagram-design](https://github.com/cathrynlavery/diagram-design) với màu và chữ của dashboard (DEC-032). Cài skill cho Claude Code trên máy:

```text
/plugin marketplace add cathrynlavery/diagram-design
/plugin install diagram-design@diagram-design
```

Sửa sơ đồ: chỉnh SVG trong file HTML; giữ tối đa 9 node, 12 đường nối, đường vuông góc và nhãn không đè lên đường.
