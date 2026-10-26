import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { connect } from 'node:net';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, renameSync, existsSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {faultSources} from './wokwi-fault-source.mjs';
import { homedir } from 'node:os';
import { randomUUID, createHash, X509Certificate } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import mqtt from 'mqtt';
import { root, local, readJson, firmwareSecrets } from './local-config.mjs';
import { readConfig } from '../server/config.mjs';
import { brokerOptions } from '../server/mqtt.mjs';
import { validateMqttMessage } from '../contracts/validate.js';
import { signIn, authFetch } from './check-session.mjs';

// Real ESP32/Wokwi, with acquisition faults compiled into a private test image only. Controller rules stay byte-for-byte.
// Needs .local/wokwi-remaining open as the VS Code workspace, with its simulator running and visible.
// Its active/ image is watched inside that workspace; the normal project binary and credentials are never changed.
const lab=join(local,'wokwi-remaining'),project=join(lab,'project');
if(process.argv.includes('--prepare')) {
  mkdirSync(join(lab,'active'),{recursive:true});
  for(const name of ['firmware.bin','firmware.elf']) copyFileSync(join(local,'firmware-build/esp32dev',name),join(lab,'active',name));
  copyFileSync(join(root,'firmware/diagram.json'),join(lab,'diagram.json'));
  writeFileSync(join(lab,'wokwi.toml'),`[wokwi]\nversion = 1\nfirmware = 'active/firmware.bin'\nelf = 'active/firmware.elf'\nrfc2217ServerPort = { port = 4000, host = "127.0.0.1" }\n\n[net]\ngateway = 'ws://127.0.0.1:9011'\n`);
  console.log(`Private Wokwi test workspace prepared: ${lab}. Close other Simulators, open this folder in VS Code and Start Simulator before running the tests.`);
  process.exit(0);
}
const run=join(lab,'runs',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(join(project,'src'),{recursive:true});mkdirSync(join(project,'include'),{recursive:true});mkdirSync(run,{recursive:true});
const originalBin=join(lab,'active/firmware.bin');
const originalElf=join(lab,'active/firmware.elf');
assert.ok(existsSync(originalBin),'Run npm run wokwi:remaining -- --prepare, then start its Simulator first');
const backupBin=join(run,'normal-firmware.bin'),backupElf=join(run,'normal-firmware.elf');
copyFileSync(originalBin,backupBin);copyFileSync(originalElf,backupElf);
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const allowedBins=new Set([hash(originalBin)]);
const config=readConfig(process.env),base=`http://${config.host}:${config.port}`;
const accounts=readJson(join(local,'mosquitto/accounts.json'));
const ca=readFileSync(join(local,'tls/ca.crt'),'utf8');
const frames=[],serial=[],checks=[];
let observer,socket,partial='',iac=0,restored=false,deployedTest=false;
const log=(name,text)=>writeFileSync(join(run,name),text,{flag:'a'});
const say=text=>{console.log(text);log('steps.log',`${new Date().toISOString()} ${text}\n`);};
async function until(read,accept,ms=20000,label='condition') {
  const end=Date.now()+ms;let last;
  while(Date.now()<end) {last=await read();if(accept(last))return last;await delay(100);}
  throw new Error(`Timeout: ${label}`);
}
async function openSerial() {
  socket=connect(4000,'127.0.0.1');
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  socket.on('error',()=>{});
  socket.on('data',chunk=>{
    for(const byte of chunk) {
      if(iac===0&&byte===255){iac=1;continue;}
      if(iac===1){iac=byte>=251&&byte<=254?2:byte===250?3:0;if(byte!==255)continue;}
      else if(iac===2){iac=0;continue;}
      else if(iac===3){if(byte===240)iac=0;continue;}
      if(byte===10){const text=partial.replace(/\r$/,'');partial='';serial.push({at:Date.now(),text});log('serial.log',`${new Date().toISOString()} ${text}\n`);}
      else partial+=String.fromCharCode(byte);
    }
  });
}
async function uart(text) {
  const mark=serial.length;socket.write(`${text}\n`);log('serial.log',`>>> ${text}\n`);
  await until(()=>serial.slice(mark),lines=>lines.some(l=>/ACCEPTANCE_INPUT|RFID_EVENT|RFID_LINE_DROPPED/.test(l.text)),10000,`serial ${text.slice(0,30)}`);
}
const latest=()=>frames.findLast(f=>f.kind==='telemetry'&&!f.retain);
const payload=f=>f?.message.payload;
const snapshot=async()=>await(await authFetch(`${base}/api/snapshot`)).json();
const post=async(path,body)=>{const r=await authFetch(`${base}${path}`,{method:'POST',headers:{origin:'http://127.0.0.1:5173','content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
async function command(expected) {
  for(let attempt=0;attempt<3;attempt++) {
    const sent=await post('/api/doors/D07/commands',{action:'close'});assert.equal(sent.status,202);
    const result=await until(async()=>await(await authFetch(`${base}/api/commands/${sent.body.command_id}`)).json(),r=>r.status!=='pending',14000,'command ACK');
    if(result.reason==='REVISION_MISMATCH'&&attempt<2){await delay(2200);continue;}
    assert.equal(result.status,expected ? 'rejected':'applied');assert.equal(result.reason,expected);
    return result;
  }
}
const fixturePaths=['src/main.cpp','lib/khoguard/src/kg_edge.cpp','lib/khoguard/src/kg_rfid.cpp','lib/khoguard/src/kg_network.cpp'];
const normalSources=Object.fromEntries(fixturePaths.map(path=>[path,readFileSync(join(root,'firmware',path),'utf8').replaceAll('\r\n','\n')]));
// Fail before deploying anything if the module structure has changed.
faultSources(normalSources,'good');
cpSync(join(root,'firmware/lib/khoguard'),join(project,'lib/khoguard'),{recursive:true});
const pio=join(homedir(),'.platformio/penv/Scripts/pio.exe');
let ini=readFileSync(join(root,'firmware/platformio.ini'),'utf8');
ini=ini.replace('build_dir = ../.local/firmware-build',`build_dir = ../build\nlibdeps_dir = ${join(root,'firmware/.pio/libdeps').replaceAll('\\','/')}`).replace('build_flags = -Iinclude -I../.local/firmware','build_flags = -Iinclude');
writeFileSync(join(project,'platformio.ini'),ini);
for(const name of ['controller.h','config.h']) copyFileSync(join(root,'firmware/include',name),join(project,'include',name));
assert.equal(hash(join(project,'include/controller.h')),hash(join(root,'firmware/include/controller.h')));
async function build(variant) {
  for(const [path,source] of Object.entries(faultSources(normalSources,variant))) {mkdirSync(dirname(join(project,path)),{recursive:true});writeFileSync(join(project,path),source);}
  writeFileSync(join(project,'include/kg_secrets.h'),firmwareSecrets(accounts['ESP-C01'],variant==='wrong-ca' ? readFileSync(join(lab,'rogue-ca.crt'),'utf8'):ca));
  say(`Building private ${variant} firmware (controller unchanged; secrets stay in .local).`);
  await new Promise((resolve,reject)=>{
    const child=spawn(pio,['run','--project-dir',project],{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8'}});
    child.stdout.on('data',d=>log(`build-${variant}.log`,d));child.stderr.on('data',d=>log(`build-${variant}.log`,d));
    child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`PlatformIO ${variant} exit ${code}`)));
  });
  const built=join(lab,'build/esp32dev/firmware.bin');
  const output=join(run,`${variant}.bin`);copyFileSync(built,output);return output;
}
function deploy(image) {
  assert.ok(allowedBins.has(hash(originalBin)),'active firmware changed outside this test; refuse overwrite');
  const digest=hash(image);allowedBins.add(digest);
  const tmp=join(lab,'active',`${randomUUID()}.tmp`);copyFileSync(image,tmp);renameSync(tmp,originalBin);
  return digest;
}
async function load(variant) {
  const image=await build(variant),mark=serial.length;
  copyFileSync(join(lab,'build/esp32dev/firmware.elf'),originalElf);
  const sha256=deploy(image);
  deployedTest=true;
  const boot=await until(()=>serial.slice(mark),lines=>lines.find(l=>l.text.includes(`ACCEPTANCE_PROFILE variant=${variant}`)),30000,'Wokwi binary reload (keep Simulator visible)');
  const line=boot.find(l=>l.text.includes(`ACCEPTANCE_PROFILE variant=${variant}`));
  const id=/boot=([a-f0-9]{32})/.exec(line.text)[1];say(`Wokwi ${variant} boot=${id}; SHA256=${sha256}`);
  return {boot:id,sha256};
}
async function live(boot,predicate=()=>true) {
  return until(latest,f=>f&&f.message.boot_id===boot&&predicate(payload(f)),20000,'live firmware state');
}
async function knownEmpty(boot) {
  await uart('TEST INPUTS_CLEAR');await uart('TEST PRESENCE_CLEAR');
  await live(boot,p=>p.occupancy.count_verified&&p.occupancy.current_occupants===0&&p.occupancy.presence===false&&p.doors.every(d=>d.local_inputs_healthy));
  await delay(2200);
}
try {
  assert.ok(existsSync(pio),'PlatformIO required');
  const codeStatus=execFileSync('cmd.exe',['/d','/s','/c','code --status'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']});
  assert.ok(codeStatus.includes('(Wokwi Simulator - wokwi-remaining - Visual Studio Code)'), 'Start Simulator in the wokwi-remaining window, not the normal project window');
  await signIn(base,'operator');
  assert.equal((await fetch(`${base}/api/ready`)).status,200);
  const before=await snapshot();assert.equal(before.devices.find(d=>d.id==='ESP-C01').freshness,'fresh','start the normal Wokwi first');
  await openSerial();
  observer=await mqtt.connectAsync({...brokerOptions(config.mqtt),username:'khoguard-observer',password:accounts['khoguard-observer'],clientId:`kg-remaining-${randomUUID()}`,reconnectPeriod:1000,connectTimeout:3000});
  observer.on('error',()=>{});
  observer.on('message',(topic,raw,packet)=>{const valid=validateMqttMessage(topic,raw);if(valid.ok){const f={at:Date.now(),kind:valid.value.kind,retain:packet.retain,message:valid.value};frames.push(f);log('mqtt.jsonl',JSON.stringify(f)+'\n');}});
  await observer.subscribeAsync(['telemetry','status','acks','commands'].map(k=>`khoguard/v1/WH01/devices/ESP-C01/${k}`),{qos:1});
  const openssl='C:/Program Files/Git/usr/bin/openssl.exe';
  execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-subj','/CN=KhoGuard acceptance rogue CA','-keyout',join(lab,'rogue-ca.key'),'-out',join(lab,'rogue-ca.crt')],{stdio:'ignore',env:{...process.env,MSYS_NO_PATHCONV:'1'}});
  const serverCert=new X509Certificate(readFileSync(join(local,'tls/server.crt')));
  assert.equal(serverCert.verify(new X509Certificate(ca).publicKey),true);
  assert.ok(serverCert.checkHost('host.wokwi.internal'));assert.equal(serverCert.checkHost('wrong.example.invalid'),undefined);
  assert.equal(serverCert.verify(new X509Certificate(readFileSync(join(lab,'rogue-ca.crt'))).publicKey),false);
  const good=await load('good');
  await live(good.boot,p=>p.occupancy.count_verified===false&&p.occupancy.current_occupants===null&&p.occupancy.presence===true);
  await knownEmpty(good.boot);
  await uart('RFID D07 DEMO-017 IN');await live(good.boot,p=>p.occupancy.current_occupants===1);
  await uart('TEST PRESENCE_HIGH');await live(good.boot,p=>p.occupancy.current_occupants===1&&p.occupancy.presence===true);
  const mark=serial.length;socket.write('TEST REBOOT\n');
  const rebootLines=await until(()=>serial.slice(mark),lines=>lines.some(l=>/ACCEPTANCE_PROFILE variant=good/.test(l.text)),25000,'actual ESP.restart');
  const rebootBoot=/boot=([a-f0-9]{32})/.exec(rebootLines.find(l=>/ACCEPTANCE_PROFILE/.test(l.text)).text)[1];
  assert.notEqual(rebootBoot,good.boot);
  const rebootFrame=await live(rebootBoot,p=>p.occupancy.current_occupants===null&&!p.occupancy.count_verified&&p.occupancy.presence===true);
  const rebootAck=await command('INPUT_UNKNOWN');
  checks.push({case:'reboot',before_boot:good.boot,after_boot:rebootBoot,before_count:1,after:rebootFrame.message.payload.occupancy,ack:rebootAck});say('PASS reboot: new boot, count null/unverified with presence HIGH, close rejected INPUT_UNKNOWN.');
  await knownEmpty(rebootBoot);
  for(const [name,text,predicate] of [
    ['beam unknown','TEST BEAM_UNKNOWN',p=>p.doors.find(d=>d.door_id==='D07').beam_clear===null],
    ['presence unknown','TEST PRESENCE_UNKNOWN',p=>p.occupancy.presence===null],
    ['contact unknown','TEST CONTACT_UNKNOWN',p=>p.doors.find(d=>d.door_id==='D07').state==='unknown'],
  ]) {
    await uart(text);const sample=await live(rebootBoot,predicate);const ack=await command('INPUT_UNKNOWN');
    checks.push({case:name,payload:sample.message.payload,ack});say(`PASS ${name}: real firmware close rejected INPUT_UNKNOWN.`);await knownEmpty(rebootBoot);
  }
  await uart('RFID D07 DEMO-017 IN');await live(rebootBoot,p=>p.occupancy.current_occupants===1);
  await uart('X'.repeat(100));const lost=await live(rebootBoot,p=>p.occupancy.current_occupants===null&&!p.occupancy.count_verified);
  checks.push({case:'count unknown after dropped serial line',occupancy:lost.message.payload.occupancy,ack:await command('INPUT_UNKNOWN')});
  say('PASS RFID line loss: unknown count, close rejected INPUT_UNKNOWN.');
  await uart('RFID D07 DEMO-017 OUT');await knownEmpty(rebootBoot);
  await uart('TEST PAUSE_TELEMETRY');
  const stale=await until(snapshot,s=>s.devices.find(d=>d.id==='ESP-C01').freshness==='stale',18000,'backend staleness');
  const commandCount=frames.filter(f=>f.kind==='commands').length;
  const denied=await post('/api/doors/D07/commands',{action:'close'});assert.equal(denied.status,409);assert.equal(denied.body.error.code,'DEVICE_NOT_LIVE');
  await delay(500);assert.equal(frames.filter(f=>f.kind==='commands').length,commandCount);
  const unaffected=await snapshot();
  assert.ok(unaffected.devices.filter(d=>d.id!=='ESP-C01').every(d=>d.freshness==='fresh'),'rejecting one stale device must not invalidate other live sessions');
  checks.push({case:'stale telemetry',device:stale.devices.find(d=>d.id==='ESP-C01'),response:denied,no_mqtt_command:true});say('PASS stale: 409 DEVICE_NOT_LIVE, no command published.');
  await uart('TEST RESUME_TELEMETRY');await until(snapshot,s=>s.devices.find(d=>d.id==='ESP-C01').freshness==='fresh',20000,'stale device recovers without new online status');
  for(const variant of ['wrong-ca','wrong-hostname']) {
    const loaded=await load(variant),start=Date.now();
    await until(()=>serial.filter(l=>l.at>=start),lines=>lines.filter(l=>l.text.includes(`TLS_REJECT variant=${variant} error=-9984`)).length>=2,30000,`${variant} X509 refusal`);
    assert.equal(frames.filter(f=>f.message.boot_id===loaded.boot&&f.kind==='telemetry'&&!f.retain).length,0,'no telemetry from rejected TLS boot');
    assert.equal(serial.some(l=>l.text.includes(`MQTT_ONLINE boot=${loaded.boot}`)),false);
    // The last valid image's frame may still be within its 10 s freshness window; wait for that cached state to age out.
    const rejected=await until(snapshot,s=>s.devices.find(d=>d.id==='ESP-C01').freshness!=='fresh',20000,'last good frame expires during TLS refusal');
    assert.notEqual(rejected.devices.find(d=>d.id==='ESP-C01').boot_id,loaded.boot,'rejected TLS boot must not become current');
    checks.push({case:variant,...loaded,tls_failures:serial.filter(l=>l.at>=start&&l.text.includes(`TLS_REJECT variant=${variant}`)).map(l=>l.text),no_live_telemetry:true});
    say(`PASS ${variant}: ESP32 X509 verification refuses TLS, no MQTT_ONLINE or telemetry.`);
    if(variant==='wrong-ca') {const control=await load('good');await live(control.boot);say('PASS positive control: correct CA connects again.');}
  }
} catch(error) {say(`FAIL ${error.code??error.name}: ${error.message}`);process.exitCode=1;}
finally {
  try {
    const restoreAt=Date.now(),previousBoot=latest()?.message.boot_id;
    if(deployedTest) {deploy(backupBin);copyFileSync(backupElf,originalElf);}
    say('Normal firmware restored; waiting for live normal ESP32.');
    const expected=hash(backupBin);assert.equal(hash(originalBin),expected);
    if(observer) {
      const restoredFrame=await until(latest,f=>f&&(!deployedTest||(f.at>=restoreAt&&f.message.boot_id!==previousBoot))&&/^[a-f0-9]{32}$/.test(f.message.boot_id),30000,'normal firmware restoration');
      const final=await until(snapshot,s=>s.devices.every(d=>d.freshness==='fresh'),20000,'all active devices fresh');
      restored=true;checks.push({case:'restored normal firmware',sha256:expected,boot:restoredFrame.message.boot_id,devices:final.devices.map(d=>({id:d.id,state:d.state,freshness:d.freshness})),ready:(await fetch(`${base}/api/ready`)).status});
      say('PASS restore: original firmware SHA256, all active devices fresh.');
    }
  } catch(error) {say(`RESTORE ATTENTION: ${error.message}`);process.exitCode=1;}
  writeFileSync(join(run,'result.json'),JSON.stringify({checked_at:new Date().toISOString(),pass:process.exitCode!==1,restored,checks,controller_sha256:hash(join(project,'include/controller.h')),note:'Private acquisition-fault image; production controller.h unchanged. TLS checked by ESP32 mbedTLS, not a Node surrogate.'},null,2));
  socket?.destroy();await observer?.endAsync(true);
  say(`Evidence: ${run}`);
}
