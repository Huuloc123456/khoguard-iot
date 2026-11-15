# Đồng bộ code với Chương 2 (MQ-2 + Safety Relay) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa vào code hai thiết bị Chương 2 mô tả mà bản hiện tại chưa có: cảm biến khí MQ-2 (thay CO2) và Safety Relay phần cứng cắt nguồn khóa khi bấm Panic. Giữ nguyên mọi tính năng hiện có: 2 cửa, DHT22, sưởi/quạt, RFID, MySQL, React, ThingsBoard, giữ chỗ.

**Architecture:**
- MQ-2 đọc analog ở GPIO36 (VP, ADC1, chạy được cùng WiFi) và đổi sang `co2_ppm` bằng hàm thuần, có test trên máy tính.
- `co2_ppm` đi theo luồng telemetry sẵn có. Schema đã có trường này và MySQL lưu JSON, nên không cần migration.
- Bộ điều khiển coi "CO2 cao" ngang với PIR: là dấu hiệu có người khi tính báo mắc kẹt >5 phút lúc hai cửa đóng.
- Safety Relay là 2 relay mới nối thuần dây: nút Panic → IN. Tiếp điểm NC của hai relay nối nối tiếp, cấp nguồn COM cho 2 relay khóa hiện có.
- Không cần GPIO mới. ESP32 chỉ còn VP/VN, và cả hai chỉ đọc vào được.

**Tech Stack:** ESP32 Arduino (PlatformIO `espressif32@7.0.1`), Wokwi `diagram.json`, C++ test chạy bằng g++, Node.js `node --test`, React/Vite, ThingsBoard bridge.

**Spec:** Chương 2 của `Nhóm_17_42_Đồ_án_Chương_2.docx` (bảng 2.1, mục 2.2), cùng các quyết định đã chốt với người dùng ngày 15/11/2026:
- Safety relay = "Relay chuỗi theo Panic".
- MQ-2 = "Telemetry + báo mắc kẹt".
- Giữ Mosquitto riêng.
- Không thêm RGB LED.

## Global Constraints

- Nhánh hiện tại có sẵn thay đổi chưa commit của người dùng. Mỗi commit chỉ `git add` đúng các file của task; không `git add -A`, không stash, không revert file khác.
- Migration SQL 001–007 và `db/seeds/registry-v1.json` là bất biến: không sửa.
- Giá trị không biết gửi `null`, không bao giờ thay bằng 0 (quy ước đang dùng cho DHT22).
- `firmware/include/controller.h` phải biên dịch được không cần Arduino (test chạy bằng `g++ -std=gnu++11` cho `safety_test.cpp` và `-std=c++17` cho `controller_test.cpp`).
- Ngưỡng cố định:
  - `CO2_TRAPPED_PPM = 1500` (firmware, dấu hiệu mắc kẹt).
  - `CO2_WARNING_PPM = 1000` và `CO2_HYSTERESIS_PPM = 100` (backend cảnh báo).
- Giữ Mosquitto riêng (TLS 18885, ACL 3 tài khoản). Không thêm RGB LED. Không thêm `door_close_enable` vào telemetry.
- Tài liệu và giao diện viết tiếng Việt. Comment trong firmware viết tiếng Anh hoặc tiếng Việt không dấu, theo file đang sửa.

## Review Focus

1. **MQ-2 rút dây hoặc mất nguồn** (ADC đọc 0): `co2_ppm` phải là `null`, không ra 0 ppm và không kích báo mắc kẹt. Test nằm trong Task 1 (`co2Ppm(0,…)` là NaN) và Task 2 (`kg_messages` gửi null khi NaN).
2. **Giá trị CO2 dao động quanh 1500 ppm**: bộ đếm 5 phút bị đặt lại. Hệ quả là báo muộn hơn, không báo sai. Ghi `ponytail:` trong code; test ở Task 1 khẳng định 1499 không bao giờ kích hoạt.
3. **CO2 cao nhưng có cửa đang mở**: không báo mắc kẹt (Task 1).
4. **Bấm Panic khi firmware treo hoặc mất mạng**: LED khóa phải tắt bằng phần cứng. Kiểm tra thủ công trên Wokwi ở Task 3; test dây ở `diagram.test.js`.
5. **Snapshot cũ chưa có `co2_ppm`** (dữ liệu lịch sử trong MySQL): UI và ThingsBoard hiển thị "Chưa rõ", không crash và không ra 0. Test ở Task 4.

---

### Task 1: Logic CO2 trong bộ điều khiển (C++ thuần)

**Files:**
- Modify: `firmware/include/controller.h` (khối hằng số timer, khoảng dòng 74; `struct Controller`; `tick()`)
- Test: `firmware/test/safety_test.cpp` (thêm block sau block "M11 PASS"), `firmware/test/controller_test.cpp` (thêm test `co2Ppm`)

**Interfaces:**
- Produces:
  - `constexpr float kg::CO2_TRAPPED_PPM = 1500;`
  - `inline float kg::co2Ppm(int raw, int raw0, float ppm0, int raw1, float ppm1)`: nội suy tuyến tính, trả `NAN` khi `raw <= 0`, kẹp kết quả về ≥ 0.
  - `void kg::Controller::setCo2(float ppm)`: `NAN` nghĩa là chưa biết, không tính là dấu hiệu. Không tăng `revision`.

- [ ] **Step 1: Viết test thất bại trong `controller_test.cpp`**

```cpp
assert(std::isnan(kg::co2Ppm(0,1000,400,3000,5000)));          // dây đứt / mất nguồn
assert(kg::co2Ppm(1000,1000,400,3000,5000)==400);
assert(kg::co2Ppm(2000,1000,400,3000,5000)==2700);
assert(kg::co2Ppm(1,1000,400,3000,5000)>=0);                   // kẹp >= 0
std::puts("CO2 C++ PASS: ADC->ppm, unplugged=NaN, clamp");
```
(thêm `#include <cmath>`)

- [ ] **Step 2: Viết test thất bại trong `safety_test.cpp`** (dùng lại helper `ready`, `settle`, `with`, `SAFE_CLOSED` sẵn có)

```cpp
{
  auto g=ready(now);g.setCo2(1500);settle(g,SAFE_CLOSED,now);const uint32_t seen=now+30;
  assert(!g.alarms(seen+300000).trapped && g.alarms(seen+300001).trapped && g.outputs(seen+300001).buzzer);
  g.setCo2(900);g.tick(seen+300002);assert(!g.alarms(seen+300003).trapped);          // CO2 về thấp -> hết
  auto low=ready(now);low.setCo2(1499);settle(low,SAFE_CLOSED,now);assert(!low.alarms(now+400000).trapped);
  auto nan=ready(now);nan.setCo2(NAN);settle(nan,SAFE_CLOSED,now);assert(!nan.alarms(now+400000).trapped);
  auto open=ready(now);open.setCo2(5000);settle(open,with(SAFE_CLOSED,0,true),now);assert(!open.alarms(now+400000).trapped);
  std::puts("CO2 PASS: high CO2 + both doors closed >5 min = trapped; low/unknown/open door = not");
}
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `g++ -std=gnu++11 firmware/test/safety_test.cpp -o .local/t.exe && .local/t.exe`
Expected: lỗi biên dịch `'class kg::Controller' has no member named 'setCo2'`

- [ ] **Step 4: Cài đặt trong `controller.h`**
  - Thêm `co2Ppm` và `CO2_TRAPPED_PPM` cạnh `TRAPPED_MS`.
  - Thêm `bool co2High=false; void setCo2(float ppm){co2High=ppm>=CO2_TRAPPED_PPM;}`; NaN so sánh luôn false nên chưa biết = không có dấu hiệu.
  - Trong `tick()`, đổi điều kiện mắc kẹt thành `((inputs[6].known && inputs[6].value) || co2High) && isClosed(0) && isClosed(1)`.
  - Thêm comment: `// ponytail: no hysteresis at CO2_TRAPPED_PPM; noise only delays the 5-min timer, add a band if Wokwi readings jitter`.

- [ ] **Step 5: Chạy cả hai test C++**

Run: `g++ -std=gnu++11 firmware/test/safety_test.cpp -o .local/t.exe && .local/t.exe && g++ -std=c++17 firmware/test/controller_test.cpp -o .local/c.exe && .local/c.exe`
Expected: mọi dòng `PASS` cũ cùng `CO2 PASS` và `CO2 C++ PASS`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add firmware/include/controller.h firmware/test/safety_test.cpp firmware/test/controller_test.cpp
git commit -m "feat(firmware): treat high CO2 as trapped-person evidence"
```

---

### Task 2: MQ-2 trên Wokwi → telemetry `co2_ppm`

**Files:**
- Modify: `firmware/diagram.json` (thêm part `gas`, 3 dây)
- Modify: `firmware/include/config.h` (mục GPIO)
- Modify: `firmware/lib/khoguard/src/kg_state.h`, `kg_state.cpp` (`extern float co2;` khởi tạo `NAN`)
- Modify: `firmware/lib/khoguard/src/kg_environment.cpp` (`poll()`)
- Modify: `firmware/lib/khoguard/src/kg_edge.cpp` (`step()`)
- Modify: `firmware/lib/khoguard/src/kg_messages.cpp` (khối `environment`, dòng 28–39)
- Modify: `firmware/MAPPING.md` (thêm dòng `state::co2` → `environment.co2_ppm`)
- Test: `tests/diagram.test.js`

**Interfaces:**
- Consumes: `kg::co2Ppm`, `Controller::setCo2` (Task 1).
- Produces:
  - Hằng số `config::GAS_AOUT_PIN = 36` và `config::CO2_CAL[4]`: `{raw0, ppm0, raw1, ppm1}`, là núm hiệu chuẩn.
  - Trường telemetry `payload.environment.co2_ppm` (số hoặc `null`), cùng quy tắc "fresh" như DHT22.

- [ ] **Step 1: Spike, xác định part và đường đặc tuyến MQ-2 trên Wokwi**
  - Đọc https://docs.wokwi.com/parts/wokwi-gas-sensor; ghi lại tên attr nồng độ (dự kiến `ppm`) và tên chân (dự kiến `AOUT`, `DOUT`, `GND`, `VCC`).
  - Thêm part tạm và một dòng `Serial.printf("GAS raw=%d\r\n", analogRead(36))`.
  - Chạy Wokwi ở hai mức ppm (400 và mức cao nhất thanh trượt cho phép), ghi giá trị raw.
  - Nếu ba điểm 400 / giữa / cao không thẳng hàng (lệch >10 %), dùng hai điểm bao quanh vùng 1000–1500 ppm cho `CO2_CAL`, vì đó là vùng quyết định cảnh báo.
  - Ghi số đo vào `DESITION.md` ở Task 5.

- [ ] **Step 2: Viết test thất bại trong `tests/diagram.test.js`**
  - Thêm `'wokwi-gas-sensor':['AOUT','DOUT','GND','VCC']` vào `PART_PINS` (sửa theo Step 1 nếu khác).
  - Thêm alias `36:'esp:VP'` vào helper `esp`.
  - Thêm test:

```js
test('MQ-2 gas sensor stands in for CO2: AOUT on GPIO36 (ADC1, works with WiFi)',()=>{
  assert.equal(part('gas')?.type,'wokwi-gas-sensor');
  assert.equal(scalar('GAS_AOUT_PIN'),36);
  assert.deepEqual(wired('gas:AOUT'),['esp:VP']);
  assert.deepEqual(wired('gas:VCC'),['esp:VIN']);
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `node --test tests/diagram.test.js`
Expected: FAIL `MQ-2 gas sensor…` (part undefined)

- [ ] **Step 4: Thêm part và dây vào `diagram.json`**
  - Part: `{"type":"wokwi-gas-sensor","id":"gas","attrs":{"ppm":"400"}}`, đặt cạnh nhóm đầu vào.
  - Dây: `gas:AOUT→esp:VP`, `gas:VCC→esp:VIN`, `gas:GND→esp:GND.1`. DOUT để trống.

- [ ] **Step 5: Firmware**
  - `config.h`: thêm `GAS_AOUT_PIN`, `CO2_CAL` (giá trị đo ở Step 1) và comment ghi rằng bản mạch thật cần cầu phân áp vì AOUT 5 V vượt mức chịu của ADC 3,3 V.
  - `kg_environment.cpp poll()`: đọc `analogRead(config::GAS_AOUT_PIN)`, đổi qua `co2Ppm`, ghi `state::co2` trong cùng critical section với DHT. Thêm `co2=%.0f` vào dòng `SENSOR_HEARTBEAT`.
  - `kg_edge.cpp step()`: trong critical section, trước `update()`, gọi `state::controller.setCo2(fresh ? state::co2 : NAN)`, với `fresh = millis()-state::sampleAt <= config::SENSOR_STALE_MS`.
  - `kg_messages.cpp`: thêm `co2_ppm` theo cùng mẫu `temperature_c`. Giá trị chỉ gửi khi `fresh && isfinite(c) && 0<=c<=100000`, ngoài ra gửi `nullptr`.

- [ ] **Step 6: Chạy test và build**

Run: `node --test tests/diagram.test.js tests/contracts.test.js tests/firmware.test.js && npm.cmd run firmware:build`
Expected: tất cả pass; build `SUCCESS`.

- [ ] **Step 7: Kiểm tra trên Wokwi**
  - Start Simulator, kéo ppm lên 2000 rồi xuống 400.
  - Serial phải có `co2=` tương ứng; MQTTX (tài khoản observer) thấy `environment.co2_ppm` đổi theo.

- [ ] **Step 8: Commit**

```bash
git add firmware/diagram.json firmware/include/config.h firmware/lib/khoguard/src/kg_state.h firmware/lib/khoguard/src/kg_state.cpp firmware/lib/khoguard/src/kg_environment.cpp firmware/lib/khoguard/src/kg_edge.cpp firmware/lib/khoguard/src/kg_messages.cpp firmware/MAPPING.md tests/diagram.test.js
git commit -m "feat(firmware): add MQ-2 gas sensor as CO2 stand-in on GPIO36"
```

---

### Task 3: Safety Relay phần cứng theo Panic

**Files:**
- Modify: `firmware/diagram.json` (thêm `safety07`, `safety08`; nối lại COM của `relay07`, `relay08`)
- Test: `tests/diagram.test.js` (sửa assertion `relay${door}:COM` ở dòng 55, thêm test mới)

**Interfaces:**
- Consumes: không có. Thay đổi chỉ ở dây nối, firmware giữ nguyên (`Controller::locked()` vốn đã nhả khóa khi có Panic).
- Produces: chuỗi nguồn khóa `3V3 → safety07 COM/NC → safety08 COM/NC → relay07:COM + relay08:COM`.

- [ ] **Step 1: Viết test thất bại**
  - Sửa dòng 55 thành `assert.deepEqual(wired('safety08:NC').sort(),['relay07:COM','relay08:COM'])`.
  - Thêm test:

```js
test('safety relays cut lock power in hardware while a Panic button is held (Chương 2 safety relay)',()=>{
  for (const door of ['07','08']) {
    assert.equal(part(`safety${door}`)?.type,'wokwi-relay-module');
    assert.equal(part(`safety${door}`).attrs.transistor,'pnp','Panic HIGH opens COM–NC');
    assert.deepEqual(wired(`panic${door}:1.r`),[`safety${door}:IN`]);
  }
  assert.deepEqual(wired('safety07:COM'),['esp:3V3']);
  assert.deepEqual(wired('safety07:NC'),['safety08:COM']);
});
```
  `wired()` chỉ đọc theo chiều `[from,to]`, nên khi sửa `diagram.json` phải ghi dây đúng chiều này.

- [ ] **Step 2: Chạy test, xác nhận thất bại**

Run: `node --test tests/diagram.test.js`
Expected: FAIL (`safety07` undefined)

- [ ] **Step 3: Sửa `diagram.json`**
  - Thêm 2 part `wokwi-relay-module` với `{"transistor":"pnp"}`.
  - VCC→`esp:VIN`, GND→`esp:GND.2`.
  - `panic07:1.r→safety07:IN`, `panic08:1.r→safety08:IN`.
  - `safety07:COM→esp:3V3`, `safety07:NC→safety08:COM`, `safety08:NC→relay07:COM`, `safety08:NC→relay08:COM`.
  - Xóa 2 dây cũ `relay07:COM→esp:3V3` và `relay08:COM→esp:3V3`.

- [ ] **Step 4: Chạy test**

Run: `node --test tests/diagram.test.js`
Expected: PASS

- [ ] **Step 5: Kiểm tra cực tính trên Wokwi (bắt buộc)**
  - Hai cửa đóng, LED khóa D07/D08 sáng. Giữ nút Panic D07 thì cả hai LED khóa phải tắt **ngay khi bấm**, cả lúc tạm tắt WiFi gateway.
  - Nếu LED khóa vẫn sáng khi giữ Panic, hoặc tắt khi không bấm, tức là cực tính PNP ngược với tài liệu. Khi đó đổi `NC` thành `NO` trong chuỗi, cập nhật test Step 1 và ghi kết quả vào DESITION ở Task 5.
  - Nhả nút: khóa vẫn nhả vì firmware chốt Panic, cho tới khi gửi lệnh reset từ web.

- [ ] **Step 6: Chạy lại kiểm thử Wokwi tự động**

Run: `npm.cmd run firmware:build` rồi chạy `node scripts/wokwi-acceptance.mjs` theo `docs/HUONG_DAN_DEMO.md`
Expected: các kịch bản Panic D07/D08 vẫn đạt.

- [ ] **Step 7: Commit**

```bash
git add firmware/diagram.json tests/diagram.test.js
git commit -m "feat(wokwi): hardware safety relays cut lock power while Panic is held"
```

---

### Task 4: Backend cảnh báo CO2, giao diện React và ThingsBoard

**Files:**
- Modify: `server/alerts.mjs` (thêm hằng số và khối CO2 trong `desiredAlerts`, sửa câu chữ `TRAPPED_PERSON`)
- Modify: `src/live-data.js` (dòng 34: thêm `co2`), `src/demo.js` (zone C: `co2: 650`), `src/WarehouseMap.jsx` (dòng 38: thêm `<dt>CO₂</dt>`), `src/DataTables.jsx` (thêm cột CO₂)
- Modify: `integrations/thingsboard.mjs` (`co2_display`, measurement `co2_ppm`), `integrations/thingsboard-dashboard.mjs` (thêm cột `['co2_display','CO₂']` vào bảng; giữ 3 widget)
- Không tự sinh lại `infra/thingsboard/dashboard.json`: file này chỉ được ghi khi `npm.cmd run thingsboard:setup` gọi Cloud bằng API key của người dùng. Người dùng tự chạy lệnh đó sau khi merge (ghi vào Task 6).
- Test: `tests/control.test.js`, `tests/live-dashboard.test.js`, `tests/thingsboard.test.js`

**Interfaces:**
- Consumes: `payload.environment.co2_ppm` (Task 2).
- Produces:
  - `export const CO2_WARNING_PPM = 1000, CO2_HYSTERESIS_PPM = 100;`
  - Mã cảnh báo `CO2_HIGH` (warning).
  - Field UI `zone.co2` (số hoặc `null`).

- [ ] **Step 1: Viết test thất bại trong `tests/control.test.js`** (dùng lại helper `esp()` và `zone` của file)

```js
test('CO2 >= 1000 ppm raises CO2_HIGH; clears only below 900; null raises nothing', () => {
  const env = co2 => esp({ environment: { temperature_c: -18, humidity_pct: 55, co2_ppm: co2 } });
  const codes = (m, keys = new Set()) => desiredAlerts(m, zone, keys).map(a => a.code);
  assert.ok(!codes(env(999)).includes('CO2_HIGH'));
  assert.ok(codes(env(1000)).includes('CO2_HIGH'));
  assert.ok(codes(env(950), new Set(['C|-|CO2_HIGH'])).includes('CO2_HIGH'));
  assert.ok(!codes(env(899), new Set(['C|-|CO2_HIGH'])).includes('CO2_HIGH'));
  assert.ok(!codes(env(null)).includes('CO2_HIGH'));
  assert.ok(!codes(esp({ environment: { temperature_c: -18, humidity_pct: 55 } })).includes('CO2_HIGH'));
});
```

- [ ] **Step 2: Viết test thất bại cho UI và Cloud**
  - `tests/live-dashboard.test.js`: snapshot có `co2_ppm: 1200` cho ra `zone.co2 === 1200`; snapshot không có trường này cho ra `zone.co2 === null`.
  - `tests/thingsboard.test.js`:
    - Có `co2_ppm: 800` thì `co2_display === '800 ppm'` và measurement có `co2_ppm: 800`.
    - Không có trường thì `co2_display === 'Chưa rõ'` và measurement không có `co2_ppm`.
    - Assertion "3 widget" ở dòng 111 giữ nguyên.

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `node --test tests/control.test.js tests/live-dashboard.test.js tests/thingsboard.test.js`
Expected: FAIL ở các test mới.

- [ ] **Step 4: Cài đặt**
  - `alerts.mjs`:
    - Thêm khối CO2 theo mẫu nhiệt độ, dùng `activeKeys` cho hysteresis. Tiêu đề: `CO₂ cao ở khu ${z}`. Chi tiết: `${c} ppm, ngưỡng ${CO2_WARNING_PPM} ppm; tự hết khi dưới ${CO2_WARNING_PPM-CO2_HYSTERESIS_PPM} ppm.`
    - Sửa chi tiết `TRAPPED_PERSON` thành: `'PIR có chuyển động hoặc CO₂ ≥ 1500 ppm liên tục khi cả hai cửa đóng hơn 5 phút; đèn, còi và sưởi tại chỗ đã bật.'`
  - UI và ThingsBoard: `co2_ppm ?? null`; hiển thị `reading()` sẵn có, đơn vị `ppm`.

- [ ] **Step 5: Chạy toàn bộ test JS và build web**

Run: `npm.cmd test && npm.cmd run build`
Expected: toàn bộ pass; Vite build OK.

- [ ] **Step 6: Commit**

```bash
git add server/alerts.mjs src/live-data.js src/demo.js src/WarehouseMap.jsx src/DataTables.jsx integrations/thingsboard.mjs integrations/thingsboard-dashboard.mjs tests/control.test.js tests/live-dashboard.test.js tests/thingsboard.test.js
git commit -m "feat: show CO2 and raise CO2_HIGH alert on web and ThingsBoard"
```

---

### Task 5: Tài liệu và sơ đồ khớp Chương 2

**Files:**
- Modify: `scripts/generate-diagrams.mjs`
  - Thêm MQ-2 và Safety relay vào `so-do-noi-day.svg`.
  - Thêm sơ đồ mới `kien-truc-3-lop.svg`, thay Hình 2.1. Tier 1 Edge: DHT22, PIR, HC-SR04, contact, RFID, MQ-2, Panic. Tier 2: Safety Relay (Panic nối dây) và ESP32 (WiFi, MQTT/TLS). Tier 3: Mosquitto TLS + ACL → Backend/MySQL → React; Bridge → ThingsBoard.
- Regenerate: `docs/diagrams/so-do-noi-day.svg`, `docs/diagrams/kien-truc-3-lop.svg`
- Modify:
  - `docs/LINH_KIEN_VA_NOI_DAY.md`: bảng linh kiện +MQ-2 +2 relay, tổng **33** phần tử; bảng nối dây; xóa câu "Không có MQ-2"; thêm ghi chú AOUT 5 V cần phân áp ngoài mô phỏng.
  - `README.md`: chức năng, số linh kiện, ngưỡng CO2.
  - `ARCHITECTURE.md`: mục "Mất kết nối" và "Giới hạn" thêm câu "Panic cắt nguồn khóa bằng relay phần cứng; liên động đóng cửa vẫn do firmware".
  - `firmware/README.md`.
  - `docs/NOI_DUNG_SLIDE.md`: các dòng "Không có MQ-2", "30 phần tử".
  - `DESITION.md`: DEC mới gồm lý do, số đo hiệu chuẩn ở Task 2 Step 1, cực tính relay ở Task 3 Step 5, và giới hạn: không chốt Panic bằng phần cứng, MQ-2 không đo CO2 thật.
  - `QUA_TRINH.md`: nhật ký ngày làm.

- [ ] **Step 1: Sửa generator và sinh lại SVG**

Run: `node scripts/generate-diagrams.mjs`
Expected: hai file SVG cập nhật hoặc được tạo; mở trong trình duyệt thấy MQ-2 nối VP và chuỗi relay an toàn.

- [ ] **Step 2: Sửa các file .md theo danh sách trên**

- [ ] **Step 3: Kiểm tra không còn câu cũ mâu thuẫn**

Run: `git grep -n -E "Không có (LCD, )?MQ-2|30 phần tử" -- README.md ARCHITECTURE.md docs/*.md firmware/*.md`
Expected: không có kết quả (file trong `docs/evidence/` là lịch sử, giữ nguyên).

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-diagrams.mjs docs/diagrams/so-do-noi-day.svg docs/diagrams/kien-truc-3-lop.svg docs/LINH_KIEN_VA_NOI_DAY.md README.md ARCHITECTURE.md firmware/README.md docs/NOI_DUNG_SLIDE.md DESITION.md QUA_TRINH.md
git commit -m "docs: align components and 3-tier diagram with Chương 2"
```

---

### Task 6: Nghiệm thu toàn bộ

- [ ] **Step 1:** Dừng backend, Vite, bridge và Wokwi; giữ broker và MySQL. Run: `npm.cmd run verify:all`. Expected: mọi mục `pass`, trong đó C++ có dòng `CO2 PASS`. Kết quả trong `.local/verify-all.json`.
- [ ] **Step 2:** `.\run.bat` và Start Wokwi, chạy các kịch bản trong `docs/HUONG_DAN_DEMO.md`, thêm 3 kịch bản mới:
  - (a) ppm 1200 thì web hiện cảnh báo CO₂ cao; về 850 thì cảnh báo tự hết.
  - (b) ppm 2000 và hai cửa đóng, sau 5 phút có `TRAPPED_PERSON`, đèn/còi/sưởi bật.
  - (c) giữ Panic thì LED khóa tắt ngay.
- [ ] **Step 3 (người dùng tự chạy, cần API key Cloud):** `npm.cmd run thingsboard:setup` để cập nhật dashboard Cloud có cột CO₂, rồi `npm.cmd run thingsboard:check`.
- [ ] **Step 4:** Ghi bằng chứng vào `docs/evidence/CHUONG2-2026-11-15.md` (lệnh, kết quả, ảnh chụp Wokwi), rồi commit riêng file đó.

---

**Ngoài phạm vi (làm sau nếu cần):**
- Cập nhật `docs/slides/KhoGuard-thuyet-trinh.pptx`, `docs/Bao_cao_KhoGuard_mot_khu.docx` và chính file Chương 2 (thay Hình 2.1, câu về broker và relay) theo code mới.
- Chốt Panic bằng phần cứng (flip-flop) nếu giảng viên yêu cầu an toàn độc lập cả sau khi nhả nút.
