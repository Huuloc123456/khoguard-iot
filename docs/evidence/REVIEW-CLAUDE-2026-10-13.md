# Kiểm tra sau thay đổi của Claude — 13/10/2026

Đối chiếu mã nguồn và bằng chứng trên nhánh hiện tại, nền commit `70a8698`; giữ nguyên các sửa ingest/simulator và nghiệm thu Wokwi của Claude. Đây là kiểm tra lại trên máy Windows dự án, không phải nghiệm thu phần cứng.

## Kết quả chạy lại

| Kiểm tra | Kết quả |
| --- | --- |
| `verify:all` | **16 bước đạt**, 1 bước C++ bỏ qua do g++ không có trên PATH Windows. Đã bổ sung `writefault:check` vào runner. [JSON](REVIEW-CLAUDE-2026-10-13/verify-all.json) |
| Hai bộ C++ chạy riêng qua WSL g++ 15.2 | **Đạt** với `-Wall -Wextra -Werror`, controller C++17 và safety GNU++11: RFID/count, input health, panic, interlock, timers, command dedupe/session. Không coi bước bỏ qua trong runner là đã chạy. |
| JavaScript từ bản source sạch | **107/107**, 0 bỏ qua; gồm 2 test mới cho probe MQTT. [TAP](REVIEW-CLAUDE-2026-10-13/clean-unit.tap) |
| Cài và build từ bản source sạch | `npm.cmd ci`: 79 package, audit 0 vulnerability; `npm.cmd run build`: 104 module, JS 428,13 kB / gzip 129,05 kB. |
| Firmware trên workspace cấu hình hiện tại | PlatformIO ESP32 build đạt; RAM 46.852 / 327.680 byte (14,3%), flash 914.265 / 1.310.720 byte (69,8%). Không phải build firmware từ máy chưa cấu hình secret. |
| MySQL lỗi ghi thật | 3 nhóm đạt; giữ khóa dòng 9,5 s, SIM-A01 không fresh và readiness không 200 trong 30/30 lần đọc. Nhả khóa: khung 4–6 lưu đúng một lần sau **618 ms**, không đổi current; khung live 7 phục hồi. [JSON của lượt cuối](REVIEW-CLAUDE-2026-10-13/write-fault-check.json). |
| Bốn demo qua MQTT/DB | 4 kịch bản, 20 bước đạt với FakeEdge; không gộp với thao tác Wokwi thật. |
| Tải | 50 node ảo trên 5 identity được đăng ký, 1.500 tin đều + 500 burst, **2.000/2.000** được lưu, 0 mất; 244 mẫu publish → WebSocket, **P95 211 ms**. Burst P95 ingest **3.050 ms**; mọi thiết bị fresh lại sau 0,4 s. RSS backend 92 → 88 MB. [JSON](REVIEW-CLAUDE-2026-10-13/load-test.json) |
| API trong collection bàn giao | 9 request GET trả 200 bằng viewer. JSON parse được, password mặc định trống. Chưa import/chạy bằng giao diện Postman. [Kết quả](REVIEW-CLAUDE-2026-10-13/live-and-collection.json) |

Bản sạch ở `.local/clean-review-20261013/source`: `git archive 70a8698` cộng các sửa probe/runner/test của lượt review, không sao chép `.local`, `node_modules` hay `dist` từ workspace. Cài dependency mới bằng lockfile; test/build không cần secret. Chưa thử quy trình tạo schema/tài khoản từ đầu trên máy thứ hai.

Các lệnh C++ đã chạy, tại thư mục gốc dự án (chỉ chạy binary nếu bước compile trước đó trả exit 0):

```powershell
wsl --cd "D:\huit\iot\source\khoguard-iot" --exec g++ -Wall -Wextra -Werror -std=c++17 firmware/test/controller_test.cpp -o .local/controller-regression-test
wsl --cd "D:\huit\iot\source\khoguard-iot" --exec .local/controller-regression-test
wsl --cd "D:\huit\iot\source\khoguard-iot" --exec g++ -Wall -Wextra -Werror -std=gnu++11 firmware/test/safety_test.cpp -o .local/safety-regression-test
wsl --cd "D:\huit\iot\source\khoguard-iot" --exec .local/safety-regression-test
```

## Lỗi phát hiện và sửa trong lần review

1. **Probe MQTT nhận nhầm traffic:** lượt `verify:all` đầu lỗi `infra:mqtt:check`, các bước khác đạt. Receiver cũ chọn bản tin đầu tiên cùng topic nên retained hoặc traffic khác có thể thay mẫu cần đối chiếu. Receiver mới chỉ nhận live marker đúng lượt. Test hồi quy chạy với receiver lấy từ Git: lỗi; chạy với bản sửa: 2/2 đạt. Lượt toàn bộ sau sửa đạt. Mã helper: `scripts/mqtt-probe.mjs`; test: `tests/mqtt-probe.test.js`.
2. **Runner thiếu kiểm thử mới:** thêm `writefault:check`; bổ sung assert readiness thật sự khác 200 trong lúc lỗi ghi, tránh chỉ in kết quả rồi coi bài test đạt.

## Trạng thái dịch vụ sau kiểm tra

Đã bật lại backend 3001, Vite 5173, gateway 9011 và 4 Node simulator. Broker riêng và MySQL dùng chung vẫn chạy. API readiness 200, broker/database connected, 12 cửa trong snapshot; **4 SIM-* fresh, ESP-C01 offline/stale** tại lần chụp API. Đã yêu cầu người dùng khởi động lại tab Wokwi để kiểm tra phần cuối. Không thay ESP thật bằng FakeEdge để làm màn hình trông như đã kết nối.

Phiên review này không có công cụ điều khiển cửa sổ/trình duyệt. Giao diện responsive và công tắc Wokwi dựa vào [bằng chứng Claude](M16-PART2-2026-10-13.md), [log Wokwi](WOKWI-2026-10-13.md); không ghi là đã thao tác lại hôm nay trong lượt review này.

### Đã phục hồi Wokwi sau khi người dùng mở lại tab

Lần đầu người dùng báo đã chạy: Serial có `SENSOR_HEARTBEAT`, nhưng không có kết nối từ VS Code tới gateway 9011, ESP-C01 vẫn stale. Probe WebSocket trực tiếp tới gateway đạt. Mã extension Wokwi 4.0.0 cho thấy `WebsocketGateway` không tự kết nối lại khi socket đóng; restart mô phỏng có thể dùng lại object gateway. Người dùng đóng hẳn tab rồi F1 → Start Simulator; sau đó gateway và telemetry hoạt động trở lại.

Kiểm tra sau phục hồi lúc **21:16 ngày 13/10/2026** (UTC+7):

- `firmware:check` nhận 3 bản tin live hợp lệ, seq 9–11, boot `2320df71dcd29ea6dcff9390dc144ef4`, cùng session và uptime tăng.
- Lượt đối chiếu tiếp theo: MQTT seq **39, 40, 41** khớp `TELEMETRY_ACK` trên Serial Wokwi. Đối chiếu MySQL: mẫu được lưu đúng một lần.
- **5/5 thiết bị online/fresh**, readiness 200; khu C −18,4 °C, 55 % RH, count 0 verified, presence false; D07/D08 closed và locked.
- Lệnh đóng D07 qua API operator → HTTP 202 → firmware ACK **applied** trong khoảng 90 ms. Đây là kiểm tra lệnh khi cửa đã đóng, không đo hành trình đóng cửa.
- [Bằng chứng phục hồi](REVIEW-CLAUDE-2026-10-13/wokwi-resumed.json), [Serial](REVIEW-CLAUDE-2026-10-13/wokwi-resumed-serial.log). Snapshot offline phía trên là trạng thái trước phục hồi, không phải trạng thái mới nhất.

## Chưa thể kết luận hoàn tất toàn bộ

- Tại thời điểm review, Wokwi T06 (unknown/stale), reboot và T20 CA/hostname sai phía firmware còn thiếu. **Đã bổ sung sau review: 9/9 nhóm Wokwi đạt**, sửa lỗi từ chối lệnh và 109/109 unit đạt; xem [báo cáo bổ sung](WOKWI-REMAINING-2026-10-13.md).
- Mục tiêu publish → hiển thị DOM chưa đo; 211 ms là tới WebSocket. P95 burst ingest cao hơn 2 s, không áp con số latency bình thường cho burst.
- Chưa làm đầy đĩa để thử DB hết dung lượng. Lỗi ghi được thử bằng khóa dòng và lock timeout; bài recovery có mất kết nối DB.
- M17 đã có collection/checklist, source sạch test/build đạt; còn người nhận chạy lại cấu hình và demo. M16 không đánh dấu toàn ma trận chỉ vì các bước tự động đạt.
