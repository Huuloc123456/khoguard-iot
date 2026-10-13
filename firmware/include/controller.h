#pragma once
#include <cstdint>
#include <array>
namespace kg {
struct Input {
  bool known=false,value=false,candidate=false,started=false;
  uint32_t changedAt=0;
  bool update(bool raw,uint32_t now) {
    if(!started || raw!=candidate) {started=true;candidate=raw;changedAt=now;}
    if(uint32_t(now-changedAt)<30 || (known && value==candidate)) return false;
    value=candidate;known=true;return true;
  }
};
struct Controller {
  // Per door: contact(open), beam(clear), panic(active); then shared presence.
  std::array<Input,7> inputs;
  std::array<bool,2> panic{{false,false}};
  uint64_t revision=0;
  bool update(const std::array<bool,7>& raw,uint32_t now) {
    bool changed=false;
    for(unsigned i=0;i<inputs.size();i++) changed=inputs[i].update(raw[i],now)||changed;
    for(unsigned d=0;d<2;d++) if(inputs[d*3+2].known && inputs[d*3+2].value) panic[d]=true;
    if(changed) revision++;
    return changed;
  }
  bool healthy(unsigned door) const {
    return door<2 && inputs[door*3].known && inputs[door*3+1].known && inputs[door*3+2].known;
  }
};
}
