import { randomUUID } from 'node:crypto';
import { registry } from '../contracts/validate.js';

export function warehouseDashboard(deviceId) {
  const aliasId=randomUUID(),widgets={},layout={};
  function add(title,fqn,type,keys,row,sizeY) {
    const id=randomUUID();widgets[id]={id,typeFullFqn:fqn,type,sizeX:24,sizeY,config:{title,showTitle:true,showTitleIcon:false,showLegend:true,
      datasources:[{type:'entity',entityAliasId:aliasId,dataKeys:keys.map(([name,label])=>({name,label,type:'timeseries',settings:{}}))}],
      timewindow:{realtime:{timewindowMs:3600000}},settings:{enableSearch:false,enablePagination:false,displayPagination:false}}};
    layout[id]={sizeX:24,sizeY,row,col:0};
  }
  for(const [i,zone] of registry.zones.entries()) {
    const devices=registry.devices.filter(d=>d.zone_id===zone),owner=devices.find(d=>d.environment),prefix=owner.id.replaceAll('-','_');
    const keys=[['source_available','Nguồn có dữ liệu'],['freshness','Độ mới'],['temperature_display','Nhiệt độ'],['humidity_display','Độ ẩm'],['occupants_display','Số người'],['presence_display','Hiện diện'],['last_seen_at','Lần nhận cuối']].map(([name,label])=>[`${prefix}_${name}`,label]);
    for(const device of devices)for(const door of device.doors)keys.push([`${device.id.replaceAll('-','_')}_${door}_state`,door]);
    add(`Khu ${zone} · xem độ mới trước khi dùng số liệu`,'system.cards.entities_table','latest',keys,i*5,5);
  }
  for(const [i,[key,label]] of [['temperature_c','Nhiệt độ (°C)'],['humidity_pct','Độ ẩm (%)']].entries()) {
    add(`${label} · theo thời điểm dữ liệu gốc`,'system.charts.basic_timeseries','timeseries',registry.devices.filter(d=>d.environment).map(d=>[`${d.id.replaceAll('-','_')}_${key}`,`Khu ${d.zone_id}`]),registry.zones.length*5+i*7,7);
  }
  return {title:'KhoGuard · Kho lạnh C',configuration:{description:'Dashboard Cloud phụ từ KhoGuard. Không có RPC. Biểu đồ giữ lịch sử; xem độ mới và lần nhận cuối. Một Cloud device đại diện ESP-C01, khu C và hai cửa D07–D08.',
    widgets,entityAliases:{[aliasId]:{id:aliasId,alias:'KhoGuard-WH01',filter:{type:'singleEntity',resolveMultiple:false,singleEntity:{entityType:'DEVICE',id:deviceId}}}},
    states:{default:{name:'Tổng quan',root:true,layouts:{main:{widgets:layout,gridSettings:{columns:24,margin:12,backgroundColor:'#ffffff'}}}}},
    timewindow:{realtime:{timewindowMs:3600000}},settings:{showTitle:true},filters:{}}};
}
