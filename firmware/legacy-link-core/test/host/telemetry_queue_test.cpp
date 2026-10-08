#include <Arduino.h>
#include "telemetry_queue.h"
#include <cassert>
#include <cstdio>
TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;
int main() {
  TelemetryQueue q;
  assert(q.push("A", "boot-1", "{\"temperature\":25}"));
  assert(!q.acknowledge("B", "boot-1"));
  assert(!q.acknowledge("A", "boot-2"));
  assert(q.size() == 1);
  assert(q.acknowledge("A", "boot-1"));
  assert(!q.acknowledge("A", "boot-1"));
  for (size_t i=0; i<TelemetryQueue::capacity; ++i) {
    char id[40]; snprintf(id,sizeof(id),"boot-%u",unsigned(i));
    assert(q.push(i%2?"B":"A",id,"{}"));
  }
  assert(!q.push("A","overflow","{}"));
  assert(q.dropped()==1);
  for (size_t i=0; i<TelemetryQueue::capacity; ++i) {
    char id[40]; snprintf(id,sizeof(id),"boot-%u",unsigned(i));
    assert(q.acknowledge(i%2?"B":"A",id));
  }
  assert(!q.front());
  assert(q.push("C","next","{}"));
  puts("Telemetry queue tests passed");
}
