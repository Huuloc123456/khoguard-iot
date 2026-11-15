import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const directory=new URL('../docs/diagrams/',import.meta.url);mkdirSync(directory,{recursive:true});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const text=(x,y,lines,size=24,color='#20313c',anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${lines.map((s,i)=>`<tspan x="${x}" dy="${i?size*1.4:0}">${esc(s)}</tspan>`).join('')}</text>`;
const rect=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#ffffff" stroke="#b5c4ce" stroke-width="2"/>`;
const line=(x1,y1,x2,y2)=>`<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#287467" stroke-width="3" fill="none"/>`;
const wrap=(w,h,title,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><title>${esc(title)}</title><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial, sans-serif">${body}</g></svg>`;
const inputs=[
 ['DHT22 SDA',['VCC 3V3 · GND chung · pull-up 10 kΩ'],'GPIO15'],
 ['CONTACT D07 chân 2',['Chân 1 GND · chân 3 3V3'],'GPIO16 / RX2'],
 ['CONTACT D08 chân 2',['HIGH mở · LOW đóng'],'GPIO19'],
 ['HC-SR04 D07 ECHO',['<100 cm hoặc mất echo >250 ms = chắn'],'GPIO17 / TX2'],
 ['HC-SR04 D08 ECHO',['VCC VIN 5 V · GND chung'],'GPIO21'],
 ['HC-SR04 D07 + D08 TRIG',['Chung xung 10 µs mỗi 60 ms'],'GPIO5'],
 ['PANIC D07 chân 1.l',['2.l lên 3V3 · 10 kΩ kéo xuống GND'],'GPIO18'],
 ['PANIC D08 chân 1.l',['Nhấn HIGH · nhả LOW'],'GPIO22'],
 ['PIR OUT',['VCC VIN 5 V · HIGH khi có chuyển động'],'GPIO23'],
 ['MFRC522 SPI',['3.3V + RST lên 3V3 · GND chung'],'2 SCK / 13 MOSI','34 MISO / 12 CS'],
 ['RFID DIRECTION chân 2',['1 GND · 3 3V3 · HIGH IN / LOW OUT'],'GPIO35'],
 ['MQ-2 AOUT (thay CO₂)',['VCC VIN 5 V · GND chung · DOUT bỏ trống'],'GPIO36 / VP']
];
const outputs=[
 ['RELAY KHÓA D07 IN',['VCC VIN · GND · COM ← chuỗi safety relay','NO → 220 Ω → LED xanh → GND'],'GPIO25'],
 ['RELAY KHÓA D08 IN',['VCC VIN · GND · COM ← chuỗi safety relay','NO → 220 Ω → LED xanh → GND'],'GPIO26'],
 ['SERVO D07 PWM',['V+ VIN 5 V · GND chung','0° đóng · 90° mở'],'GPIO27'],
 ['SERVO D08 PWM',['Contact xác nhận vị trí độc lập','Tự gạt contact sau khi servo quay'],'GPIO14'],
 ['LED ĐÈN TRẮNG',['GPIO → 220 Ω → anode LED','Cathode về GND'],'GPIO32'],
 ['BUZZER chân 2',['Chân 1 về GND','Tone 2 kHz, LEDC riêng servo'],'GPIO33'],
 ['RELAY SƯỞI / QUẠT IN',['COM 3V3 · NO → 220 Ω → LED sưởi','NC → 220 Ω → LED quạt · GND chung'],'GPIO4'],
 ['SAFETY RELAY D07 + D08 IN',['IN ← nút Panic 1.r, dây cứng, không qua ESP32','3V3 → COM/NC 07 → COM/NC 08 → COM khóa'],'Không GPIO']
];
let body=text(60,56,['SƠ ĐỒ NỐI DÂY KHOGUARD MỘT KHU C'],36)+text(60,98,['ESP-C01 · D07–D08 · Sơ đồ mô phỏng số, không dùng trực tiếp để chế tạo'],24);
body+=`<rect x="850" y="130" width="400" height="1240" rx="14" fill="#edf5f3" stroke="#287467" stroke-width="3"/>`+text(1050,755,['ESP32','ESP-C01'],40,'#176052','middle');
for(const [i,[title,notes,pin,pin2]]of inputs.entries()){
 const y=140+i*100;body+=rect(60,y,560,85)+text(78,y+29,[title],25)+text(78,y+61,notes,20)+line(620,y+40,850,y+40)+text(835,y+31,[pin,...(pin2?[pin2]:[])],pin2?19:22,'#176052','end');
}
for(const [i,[title,notes,pin]]of outputs.entries()){
 const y=140+i*157;body+=rect(1480,y,560,132)+text(1498,y+34,[title],25)+text(1498,y+72,notes,22)+line(1250,y+60,1480,y+60)+text(1265,y+47,[pin],22,'#176052');
}
body+=text(60,1420,['NGUỒN: 3V3 cho MFRC522/DHT22 và mức logic · VIN 5 V cho servo/sonar/PIR/relay · Tất cả GND chung'],24);
body+=text(60,1468,['LƯU Ý: ECHO nối trực tiếp chỉ trong Wokwi. Mạch thật cần hạ mức 5 V xuống 3,3 V và nguồn tải riêng.'],24,'#9b351c');
body+=text(60,1510,['PIR không đo hiện diện tĩnh. HC-SR04 không phải rèm quang an toàn. GPIO2/5/12/15 cần xét strapping trên bo thật.'],23,'#9b351c');
writeFileSync(new URL('so-do-noi-day.svg',directory),wrap(2100,1560,'Nối dây mô phỏng một ESP32 và hai cửa',body));
body=text(60,64,['KIẾN TRÚC KHOGUARD MỘT KHU C'],34);
const boxes=[{x:60,y:160,w:350,h:215,t:['ĐẦU VÀO','DHT22, PIR, MFRC522','2 contact, 2 Panic','2 HC-SR04']},{x:510,y:160,w:350,h:215,t:['ESP-C01 / WOKWI','Liên động D07–D08','Xử lý tại chỗ, timer','Servo, relay, LED, còi']},{x:960,y:160,w:320,h:215,t:['MOSQUITTO','MQTT/TLS 18885','ACL: 3 account','QoS1, CA + hostname']},{x:1380,y:160,w:350,h:215,t:['BACKEND NODE.JS','Kiểm tra dữ liệu/phiên','REST + WebSocket','MySQL lưu lịch sử']},{x:1380,y:480,w:350,h:170,t:['REACT KHOGUARD','Điều hành khu C','Yêu cầu lệnh + ACK']},{x:960,y:480,w:320,h:170,t:['BRIDGE VIEWER','Snapshot mỗi 10 s','MQTT/TLS lên Cloud']},{x:510,y:480,w:350,h:170,t:['THINGSBOARD CLOUD','1 bảng khu C','2 biểu đồ môi trường']}];
for(const b of boxes)body+=rect(b.x,b.y,b.w,b.h)+text(b.x+22,b.y+40,b.t,26);
for(const [a,b,c,d]of [[410,265,510,265],[860,265,960,265],[1280,265,1380,265],[1555,375,1555,480],[1380,330,1340,330],[1340,330,1340,565],[1340,565,1280,565],[960,565,860,565]])body+=line(a,b,c,d);
body+=text(60,740,['Quan trắc: ESP32 tới backend, React và Cloud. Lệnh: React qua backend về ESP32, thiết bị tự quyết định.','MySQL giữ lịch sử bản nhiều khu. Mọi màn hình và nghiệp vụ hiện hành chỉ chọn khu C.'],25);
writeFileSync(new URL('kien-truc-mot-khu.svg',directory),wrap(1800,820,'Kiến trúc KhoGuard một khu',body));
// Chương 2, Hình 2.1 redrawn from the code: 3 tiers, safety path wired locally, network only monitors.
body=text(60,64,['KIẾN TRÚC 3 LỚP · PHÂN HỆ AN TOÀN KHO LẠNH (KHỚP MÔ PHỎNG WOKWI)'],32);
const tier=(y,label)=>text(60,y,[label],24,'#287467');
body+=tier(120,'TẦNG 1 · EDGE')+tier(380,'TẦNG 2 · CỤC BỘ')+tier(640,'TẦNG 3 · MÁY CHỦ');
const tiers=[{x:60,y:140,w:560,h:170,t:['NÚT PANIC D07 / D08','Dây cứng tới safety relay','và GPIO18 / GPIO22']},{x:820,y:140,w:760,h:170,t:['CẢM BIẾN → GPIO ESP32','DHT22 · PIR (thay mmWave) · MQ-2 (thay CO₂)','HC-SR04 (thay rèm quang) · contact · RFID-RC522']},
 {x:60,y:400,w:560,h:170,t:['SAFETY RELAY ×2','Panic cắt nguồn relay khóa','không cần firmware hay mạng']},{x:820,y:400,w:760,h:170,t:['ESP32 ESP-C01 (WiFi Wokwi)','Liên động đóng cửa, Panic, mắc kẹt: tại chỗ','JSON qua MQTT/TLS · nhận lệnh, trả ACK']},
 {x:60,y:660,w:380,h:150,t:['MOSQUITTO RIÊNG','TLS 18885','ACL 3 tài khoản']},{x:500,y:660,w:380,h:150,t:['BACKEND + MYSQL','Kiểm tra, lưu log','lịch ca demo']},{x:940,y:660,w:340,h:150,t:['REACT','Giám sát, cảnh báo','yêu cầu lệnh + ACK']},{x:1340,y:660,w:400,h:150,t:['THINGSBOARD CLOUD','Bản sao qua bridge','chỉ xem']}];
for(const b of tiers)body+=rect(b.x,b.y,b.w,b.h)+text(b.x+22,b.y+42,b.t,25);
for(const [a,b,c,d]of [[340,310,340,400],[1200,310,1200,400],[620,225,820,225],[620,485,820,485],[1200,570,1200,610],[400,610,1200,610],[400,610,400,660],[440,735,500,735],[880,735,940,735],[690,810,690,850],[690,850,1540,850],[1540,850,1540,810]])body+=line(a,b,c,d);
body+=text(640,215,['GPIO'],20,'#176052')+text(640,475,['cắt nguồn khóa'],20,'#176052')+text(1215,598,['MQTT/TLS'],20,'#176052');
body+=text(60,910,['Mạng, MQTT và dashboard chỉ giám sát, ghi log, cảnh báo và gửi yêu cầu lệnh. Mất mạng: ESP32 và safety relay vẫn xử lý tại chỗ.','VLAN của bản thực tế được thay bằng tài khoản + ACL topic riêng trên broker. Camera nhiệt, radar mmWave, LoRaWAN chỉ là hướng nâng cấp.'],23);
writeFileSync(new URL('kien-truc-3-lop.svg',directory),wrap(1800,990,'Kiến trúc 3 lớp phân hệ an toàn kho lạnh',body));
const diagram=JSON.parse(readFileSync(new URL('../firmware/diagram.json',import.meta.url)));
const count=diagram.parts.filter(p=>p.type!=='wokwi-text').length;
if(count!==33)throw new Error(`BOM changed: ${count} electrical parts; update documentation`);
console.log('Three SVG diagrams written; active electrical BOM = 33 parts.');
