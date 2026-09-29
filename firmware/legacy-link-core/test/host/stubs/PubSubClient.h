#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <vector>
struct PubSubClient {
  struct Message { std::string topic, payload; bool retained; };
  explicit PubSubClient(WiFiClient &) {}
  bool online = false, subscribe_ok = true;
  unsigned subscriptions = 0;
  std::string client_id, subscribed_topic;
  std::vector<Message> published;
  size_t buffer_size = 256;
  void (*callback)(char *, byte *, unsigned int) = nullptr;
  void setServer(const char *, int) {}
  void setCallback(void (*fn)(char *, byte *, unsigned int)) { callback = fn; }
  bool setBufferSize(uint16_t size) { buffer_size = size; return true; }
  bool connected() { return online; }
  bool connect(const char *id, const char *, const char *) {
    client_id = id; online = true; return true;
  }
  bool subscribe(const char *topic, uint8_t qos) {
    if (qos != 1) return false;
    subscribed_topic = topic; ++subscriptions; return subscribe_ok;
  }
  void disconnect() { online = false; }
  int state() { return 0; }
  void loop() {}
  bool publish(const char *topic, const char *payload, bool retained = false) {
    if (!online) return false;
    published.push_back({topic, payload, retained}); return true;
  }
  void receive(std::string topic, std::string payload) {
    callback(&topic[0], reinterpret_cast<byte *>(&payload[0]), payload.size());
  }
};
