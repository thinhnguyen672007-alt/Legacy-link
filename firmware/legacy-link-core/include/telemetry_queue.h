#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>

// Bounded RAM outbox. Keep accepted samples until an exact application ACK.
// Drop newest on overflow, preserving all already accepted samples.
template<size_t Capacity>
class DeliveryQueue {
 public:
  static constexpr size_t capacity = Capacity;
  struct Sample { char device[64]; char id[80]; char payload[1024]; uint32_t attempts; bool buffered; uint32_t lastAttempt; char rejection[40]; };
  bool push(const char *device, const char *id, const char *payload, bool offline = false) {
    if (size_ == capacity || strlen(device) >= 64 || strlen(id) >= 80 || strlen(payload) >= 1024) {
      ++dropped_; return false;
    }
    Sample &s = samples_[(head_ + size_) % capacity];
    strcpy(s.device, device); strcpy(s.id, id); strcpy(s.payload, payload);
    s.lastAttempt = 0; s.rejection[0] = 0; s.attempts = 0; s.buffered = offline || size_ > 0;
    ++size_; if (size_ > high_water_) high_water_ = size_; return true;
  }
  Sample *front() { return size_ ? &samples_[head_] : nullptr; }
  const Sample *front() const { return size_ ? &samples_[head_] : nullptr; }
  bool acknowledge(const char *device, const char *id) {
    const Sample *s = front();
    if (!s || strcmp(s->device, device) || strcmp(s->id, id)) return false;
    head_ = (head_ + 1) % capacity; --size_; ++committed_; return true;
  }
  size_t size() const { return size_; }
  uint32_t committed() const { return committed_; }
  size_t highWater() const { return high_water_; }
  uint32_t dropped() const { return dropped_; }
 private:
  Sample samples_[capacity]{};
  size_t head_ = 0, size_ = 0;
  uint32_t dropped_ = 0, committed_ = 0;
  size_t high_water_ = 0;
};

using TelemetryQueue = DeliveryQueue<32>;
using AlarmQueue = DeliveryQueue<8>;
