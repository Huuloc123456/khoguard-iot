import assert from 'node:assert/strict';

// Used only by the private Wokwi workspace; production firmware files are never overwritten.
export function faultSources(files,variant) {
  assert.ok(['good','wrong-ca','wrong-hostname'].includes(variant),'unknown acceptance profile');
  const out={...files};
  const replace=(path,anchor,next)=>{
    assert.equal(out[path]?.split(anchor).length,2,`source anchor changed in ${path}: ${anchor}`);
    out[path]=out[path].replace(anchor,next);
  };
  const main='src/main.cpp',edge='lib/khoguard/src/kg_edge.cpp',rfid='lib/khoguard/src/kg_rfid.cpp',network='lib/khoguard/src/kg_network.cpp';
  out['lib/khoguard/src/kg_acceptance.h']=`#pragma once
#include <atomic>
#include <cstring>
#include <stdint.h>
namespace kg { namespace acceptance {
extern std::atomic<bool> paused;
extern uint8_t mask;
extern bool presence;
extern const char variant[];
}}
`;
  replace(main,'#include "khoguard.h"',`#include "khoguard.h"
#include "kg_state.h"
#include "kg_acceptance.h"
namespace kg { namespace acceptance {
std::atomic<bool> paused{false};
uint8_t mask=0;
bool presence=true;
const char variant[]="${variant}";
}}`);
  replace(main,'  kg::network::start();',`  Serial.printf("ACCEPTANCE_PROFILE variant=%s boot=%s presence_fixture=1\\r\\n",kg::acceptance::variant,kg::state::bootId);
  kg::network::start();`);
  for(const path of [edge,rfid,network])out[path]='#include "kg_acceptance.h"\n'+out[path];
  replace(edge,'  const std::array<bool,7> raw=board::readInputs();','  std::array<bool,7> raw=board::readInputs();\n  raw[6]=acceptance::presence;');
  replace(edge,'  const auto before=state::controller;',`  for(unsigned i=0;i<7;i++) if(acceptance::mask&(1u<<i)) {state::controller.inputs[i].known=false;state::controller.inputs[i].started=false;}
  const auto before=state::controller;`);
  replace(rfid,"    line[length]='\\0';length=0;",`    line[length]='\\0';length=0;
    if(!overflow && std::strncmp(line,"TEST ",5)==0) {
      if(std::strcmp(line,"TEST REBOOT")==0) {Serial.println("ACCEPTANCE_REBOOT");Serial.flush();ESP.restart();}
      if(std::strcmp(line,"TEST BEAM_UNKNOWN")==0) acceptance::mask=2;
      else if(std::strcmp(line,"TEST CONTACT_UNKNOWN")==0) acceptance::mask=1;
      else if(std::strcmp(line,"TEST PRESENCE_UNKNOWN")==0) acceptance::mask=64;
      else if(std::strcmp(line,"TEST INPUTS_CLEAR")==0) acceptance::mask=0;
      else if(std::strcmp(line,"TEST PRESENCE_HIGH")==0) acceptance::presence=true;
      else if(std::strcmp(line,"TEST PRESENCE_CLEAR")==0) acceptance::presence=false;
      else if(std::strcmp(line,"TEST PAUSE_TELEMETRY")==0) acceptance::paused.store(true);
      else if(std::strcmp(line,"TEST RESUME_TELEMETRY")==0) acceptance::paused.store(false);
      else {Serial.println("ACCEPTANCE_BAD_INPUT");continue;}
      portENTER_CRITICAL(&state::sampleLock);state::controller.revision++;portEXIT_CRITICAL(&state::sampleLock);
      Serial.printf("ACCEPTANCE_INPUT mask=%u presence=%d paused=%d\\r\\n",acceptance::mask,acceptance::presence,acceptance::paused.load());
      continue;
    }`);
  replace(network,'if (client.connected() && millis() - publishedAt >= config::TELEMETRY_PERIOD_MS)','if (!acceptance::paused.load() && client.connected() && millis() - publishedAt >= config::TELEMETRY_PERIOD_MS)');
  replace(network,'        if (net.connect(MQTT_HOST, MQTT_PORT, config::TCP_CONNECT_TIMEOUT_MS) && client.connect',`        bool tlsConnected;
        ${variant==='wrong-hostname'?'IPAddress address; tlsConnected=WiFi.hostByName(MQTT_HOST,address) && net.connect(address,MQTT_PORT,"wrong.example.invalid",MQTT_CA_CERT,nullptr,nullptr);':'tlsConnected=net.connect(MQTT_HOST,MQTT_PORT,config::TCP_CONNECT_TIMEOUT_MS);'}
        if(!tlsConnected) {char detail[180]{};const int error=net.lastError(detail,sizeof(detail));Serial.printf("TLS_REJECT variant=%s error=%d detail=%s\\r\\n",acceptance::variant,error,detail);}
        if (tlsConnected && client.connect`);
  assert.ok(out[network].includes('net.setCACert(MQTT_CA_CERT)'));
  assert.ok(!/\bnet\.setInsecure\s*\(/.test(out[network]));
  return out;
}
