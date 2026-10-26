import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import mqtt from 'mqtt';
import { local, root, registry, readJson } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { signIn, authFetch } from './check-session.mjs';
import { toThingsBoard, unavailableTelemetry, telemetryMessages, cloudTarget } from '../integrations/thingsboard.mjs';
import { warehouseDashboard } from '../integrations/thingsboard-dashboard.mjs';

const privateFile=join(local,'thingsboard-cloud.json'),envFile=join(local,'thingsboard-cloud.env');
const deviceName='KhoGuard-WH01';
function configuration() {
  const env=parseEnv(readFileSync(envFile,'utf8'));
  return {...cloudTarget(env.TB_CLOUD_URL),apiKey:env.TB_CLOUD_API_KEY};
}
async function api(config,path,{method='GET',body}={}) {
  if(!/^[!-~]{16,512}$/.test(config.apiKey??''))throw new Error('CLOUD_API_KEY_REQUIRED');
  const response=await fetch(config.url+path,{method,signal:AbortSignal.timeout(15000),redirect:'error',
    headers:{'content-type':'application/json','X-Authorization':`ApiKey ${config.apiKey}`},...(body===undefined?{}:{body:JSON.stringify(body)})});
  if(!response.ok)throw new Error(`TB_API_${response.status}`);
  const text=await response.text();return text?JSON.parse(text):null;
}
const save=data=>writeFileSync(privateFile,JSON.stringify(data,null,2),{mode:0o600});
async function setup() {
  assert.ok(existsSync(local),'Run infra:setup first to create the protected .local directory');
  if(!existsSync(envFile))writeFileSync(envFile,'# Fill the API key from ThingsBoard Cloud > Account > Security > API keys. Never send it in chat.\nTB_CLOUD_URL=https://thingsboard.cloud\nTB_CLOUD_API_KEY=\n',{mode:0o600});
  const config=configuration(),previous=existsSync(privateFile)?readJson(privateFile):null;
  if(previous && previous.url!==config.url)throw new Error('CLOUD_REGION_CHANGED');
  const user=await api(config,'/api/auth/user');assert.ok(typeof user.id?.id==='string');
  let device=await api(config,`/api/tenant/devices?deviceName=${encodeURIComponent(deviceName)}`).catch(error=>{if(error.message==='TB_API_404')return null;throw error;});
  if(device && device.additionalInfo?.integration!=='khoguard-snapshot-v1')throw new Error('CLOUD_DEVICE_NAME_IN_USE');
  if(!device)device=await api(config,'/api/device',{method:'POST',body:{name:deviceName,type:'default',label:'KhoGuard · Khu C / 2 cửa',additionalInfo:{integration:'khoguard-snapshot-v1',gateway:false,description:'Read-only warehouse snapshot mirror; no RPC controls.'}}});
  if(device.label!=='KhoGuard · Khu C / 2 cửa')device=await api(config,'/api/device',{method:'POST',body:{...device,label:'KhoGuard · Khu C / 2 cửa'}});
  assert.equal(device.name,deviceName);assert.ok(typeof device.id?.id==='string');
  const credential=await api(config,`/api/device/${device.id.id}/credentials`);
  assert.equal(credential.credentialsType,'ACCESS_TOKEN');assert.ok(typeof credential.credentialsId==='string' && credential.credentialsId.length>0);
  const state={...previous,url:config.url,deviceId:device.id.id,deviceToken:credential.credentialsId};save(state);
  const body=warehouseDashboard(device.id.id);if(state.dashboardId)body.id={entityType:'DASHBOARD',id:state.dashboardId};
  const dashboard=await api(config,'/api/dashboard',{method:'POST',body});assert.ok(typeof dashboard.id?.id==='string');
  state.dashboardId=dashboard.id.id;state.dashboardUrl=`${config.url}/dashboards/${state.dashboardId}`;save(state);
  writeFileSync(join(root,'infra/thingsboard/dashboard.json'),JSON.stringify(body,null,2));
  console.log(`Cloud configured: ${state.dashboardUrl}\nOne ThingsBoard device represents the warehouse. Credentials stay in .local.`);
}
const bounded=async(promise,ms=5000)=>{
  let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('TIMEOUT')),ms);})]);}finally{clearTimeout(timer);}
};
async function bridge() {
  const state=readJson(privateFile),target=cloudTarget(state.url);assert.ok(typeof state.deviceToken==='string' && state.deviceToken.length>0);
  const config=readConfig(process.env),source=`http://${config.host}:${config.port}`;
  let client,stopping=false,lastStatus;
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopping=true;client?.end(true);});
  console.log('KhoGuard → ThingsBoard Cloud · read-only · MQTT/TLS · no RPC/door commands.');
  try {while(!stopping) {
    try {
      if(!client?.connected) {
        client?.end(true);client=await mqtt.connectAsync({...target.mqtt,username:state.deviceToken,
          clientId:`kg-tb-${randomUUID()}`,clean:true,reconnectPeriod:0,connectTimeout:5000,queueQoSZero:false});
        client.on('error',()=>{});
      }
      let data,status='source unavailable';
      try {
        let response=await authFetch(source+'/api/snapshot',{signal:AbortSignal.timeout(3000)});
        if(response.status===401){await signIn(source,'viewer');response=await authFetch(source+'/api/snapshot',{signal:AbortSignal.timeout(3000)});}
        if(response.status!==200)throw new Error('SOURCE_UNAVAILABLE');data=toThingsBoard(await response.json());
        status=Object.values(data).every(frames=>frames[0].values.source_available)?'snapshot forwarded':'source unavailable';
      }catch{data=unavailableTelemetry();}
      for(const message of telemetryMessages(data))await bounded(client.publishAsync('v1/devices/me/telemetry',JSON.stringify(message),{qos:1,retain:false}));
      if(status!==lastStatus){console.log(`ThingsBoard: ${status}.`);lastStatus=status;}
    }catch{client?.end(true);if(lastStatus!=='target unavailable'){console.error('ThingsBoard Cloud unavailable; retrying. KhoGuard is unaffected.');lastStatus='target unavailable';}}
    if(!stopping)await delay(10000);
  }}finally{client?.end(true);}
}
async function check() {
  const config=configuration(),state=readJson(privateFile);assert.equal(config.url,state.url);
  const keys=registry.devices.flatMap(d=>['source_available','freshness','temperature_display','last_seen_at'].map(k=>`${d.id.replaceAll('-','_')}_${k}`));
  const data=await api(config,`/api/plugins/telemetry/DEVICE/${state.deviceId}/values/timeseries?keys=${keys.join(',')}`);
  const summary=registry.devices.map(({id})=>{
    const prefix=id.replaceAll('-','_'),read=k=>data[`${prefix}_${k}`]?.[0];
    assert.ok(read('source_available'),`No mirrored telemetry for ${id}`);
    assert.ok(Date.now()-read('source_available').ts<=30000,`Bridge data expired for ${id}`);
    assert.equal(String(read('source_available').value),'true',`Backend source unavailable for ${id}`);
    return {device:id,freshness:read('freshness')?.value,temperature:read('temperature_display')?.value,updated_at:new Date(read('source_available').ts).toISOString()};
  });
  const saved=await api(config,`/api/dashboard/${state.dashboardId}`);assert.equal(Object.keys(saved.configuration.widgets).length,registry.zones.length+2);
  console.log(JSON.stringify({checked_at:new Date().toISOString(),dashboard:state.dashboardUrl,devices:summary},null,2));
}
try {
  if(process.argv[2]==='setup')await setup();
  else if(process.argv[2]==='bridge')await bridge();
  else if(process.argv[2]==='check')await check();
  else throw new Error('Use setup | bridge | check');
}catch(error){console.error(`ThingsBoard Cloud operation failed (${/^[A-Z_0-9]+$/.test(error.message)?error.message:error.code??'CHECK_FAILED'}); credentials not printed. See docs/THINGSBOARD.md.`);process.exitCode=1;}
