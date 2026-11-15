#include <cassert>
#include <cmath>
#include <cstdio>
#include <string>
#include "../include/controller.h"
int main() {
  kg::Input input;
  assert(!input.known);
  assert(!input.update(true,0)); assert(!input.update(false,10)); assert(!input.update(true,20));
  assert(!input.update(true,49)); assert(input.update(true,50)); assert(input.known && input.value);
  assert(!input.update(false,51)); assert(!input.update(true,60)); assert(!input.update(true,100));
  assert(input.value);
  kg::Input wrap;wrap.update(false,0xfffffff0u);assert(wrap.update(false,20));assert(wrap.known);
  kg::Controller c;c.update({false,true,false,false,true,false,false},0);
  assert(!c.healthy(0));c.update({false,true,false,false,true,false,false},30);
  assert(c.healthy(0) && c.healthy(1));assert(!c.inputs[0].value && c.inputs[1].value);
  c.update({true,true,true,false,true,false,true},100);c.update({true,true,true,false,true,false,true},130);
  assert(c.inputs[0].value && c.panic[0] && c.inputs[6].value);assert(!c.panic[1]);
  c.update({true,true,false,false,true,false,false},200);c.update({true,true,false,false,true,false,false},230);
  assert(c.panic[0]);assert(!c.inputs[6].value);
  std::puts("M07 C++ PASS: debounce, rollover, mapping/isolation, panic latch and input health");
  kg::Occupancy count;
  assert(!count.verified && count.count==0);
  assert(!count.reconcile(false));assert(count.reconcile(true));
  assert(count.verified && count.count==0);
  assert(count.scan(0,true)==kg::ScanResult::accepted);assert(count.count==1);
  assert(count.scan(0,true)==kg::ScanResult::duplicate);assert(count.count==1);
  assert(count.scan(2,true)==kg::ScanResult::unauthorized);assert(count.count==1);
  assert(count.scan(0,false)==kg::ScanResult::accepted);assert(count.count==0);
  assert(count.scan(0,false)==kg::ScanResult::duplicate);assert(count.count==0);
  assert(!kg::countAllowsClose(count,true));assert(kg::countAllowsClose(count,false));
  count.invalidate();assert(!count.verified);assert(!kg::countAllowsClose(count,false));
  assert(count.scan(0,false)==kg::ScanResult::duplicate);assert(count.count==0);
  std::puts("M08 C++ PASS: whitelist, per-card anti-repeat, no underflow, reconciliation, lost-event invalidation and presence gate");
  kg::Occupancy busy;busy.scan(1,true);
  assert(!busy.reconcile(true) && !busy.verified);
  kg::Controller room;room.update({false,true,false,false,true,false,true},0);room.update({false,true,false,false,true,false,true},30);
  assert(!room.occupancy.verified);
  const auto before=room.revision;room.update({false,true,false,false,true,false,false},40);room.update({false,true,false,false,true,false,false},70);
  assert(room.occupancy.verified && room.revision>before);
  kg::RfidRead read;
  assert(kg::parseRfid("RFID D07 DEMO-017 IN",read) && read.door==0 && read.card==0 && read.entering);
  assert(kg::parseRfid("rfid d08 demo-018 out",read) && read.door==1 && read.card==1 && !read.entering);
  assert(kg::parseRfid("RFID D07 STRANGER-1 IN",read) && read.card==kg::CARDS.size() && std::string(read.cardId)=="STRANGER-1");
  for(const char* bad:{"RFID D09 DEMO-017 IN","RFID D07 DEMO-017","RFID D07 DEMO-017 IN extra","RFID D07 bad\"id IN","",
      "RFID D07 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA IN"}) assert(!kg::parseRfid(bad,read));
  const auto r=room.revision;assert(room.scan(read.card,true)==kg::ScanResult::unauthorized && room.revision==r);
  assert(room.scan(0,true)==kg::ScanResult::accepted && room.revision==r+1 && room.occupancy.count==1);
  std::puts("M08 C++ PASS: serial RFID parser, card table, reconcile only when no card inside, revision on count change");
  // Wokwi gas sensor measured 15/11/2026 (slider = log10 ppm). Off-grid points are the 20-run check, max error 1%.
  for(const auto& m:{std::array<float,2>{3628,400},{3762,1000},{3337,100},{4041,100000},{843,0.1f},
      {3811,1514},{3751,912},{3889,3467},{3774,1096},{3956,9550},{3853,2291},{3017,33.1f}})
    assert(std::fabs(kg::co2Ppm(int(m[0]))-m[1])<=m[1]*0.011f);
  assert(std::isnan(kg::co2Ppm(0)) && std::isnan(kg::co2Ppm(842)) && std::isnan(kg::co2Ppm(4042)));  // unplugged / outside measured range
  for(int raw=843;raw<4041;raw++) assert(kg::co2Ppm(raw)<kg::co2Ppm(raw+1));                       // table stays monotonic
  std::puts("CO2 C++ PASS: measured Wokwi curve, unplugged/out-of-range=NaN, monotonic");
}
