#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include <vector>
struct PubSubClient {
  struct Message { std::string topic, payload; bool retained; };
  WiFiClient &transport;
  unsigned transport_stops = 0;
  explicit PubSubClient(WiFiClient &client) : transport(client) {}
  bool online = false, subscribe_ok = true, publish_ok = true;
  unsigned subscriptions = 0;
  std::string client_id, subscribed_topic;
  std::string will_topic, will_payload;
  bool will_retained = false;
  uint8_t will_qos = 0;
  unsigned connections = 0;
  unsigned loops = 0;
  unsigned long last_loop_time = 0, max_loop_gap = 0;
  std::vector<Message> published;
  size_t buffer_size = 256;
  void (*callback)(char *, byte *, unsigned int) = nullptr;
  void setServer(const char *, int) {}
  void setCallback(void (*fn)(char *, byte *, unsigned int)) { callback = fn; }
  void setSocketTimeout(uint16_t) {}
  bool setBufferSize(uint16_t size) { buffer_size = size; return true; }
  bool connected() { return online && transport.stops == transport_stops; }
  bool connect(const char *id, const char *, const char *) {
    ++connections;
    transport_stops = transport.stops;
    client_id = id; online = true; return true;
  }
  bool connect(const char *id, const char *user, const char *password,
               const char *topic, uint8_t qos, bool retained, const char *payload) {
    will_topic = topic; will_payload = payload; will_qos = qos; will_retained = retained;
    return connect(id, user, password);
  }
  bool subscribe(const char *topic, uint8_t qos) {
    if (qos != 1) return false;
    subscribed_topic = topic; ++subscriptions; return subscribe_ok;
  }
  void disconnect() { online = false; }
  int state() { return 0; }
  void loop() {
    if (loops && millis() - last_loop_time > max_loop_gap) max_loop_gap = millis() - last_loop_time;
    ++loops; last_loop_time = millis();
  }
  bool publish(const char *topic, const char *payload, bool retained = false) {
    if (!online || !publish_ok || 5 + 2 + strlen(topic) + strlen(payload) > buffer_size) return false;
    published.push_back({topic, payload, retained}); return true;
  }
  void receive(std::string topic, std::string payload) {
    callback(&topic[0], reinterpret_cast<byte *>(&payload[0]), payload.size());
  }
};
