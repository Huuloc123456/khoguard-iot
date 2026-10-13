#include <cassert>
#include <cstdio>
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
}
