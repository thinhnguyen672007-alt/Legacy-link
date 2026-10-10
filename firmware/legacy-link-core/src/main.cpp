#include "telemetry_queue.h"
#include "config_parser.h"
#include "command_deadline.h"
#include "json_text.h"
#include "modbus_reader.h"
#include "alarm_monitor.h"
#include "config_store.h"
#include "gateway_settings.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <IPAddress.h>
#include <PubSubClient.h>
#include <time.h>
#include <sys/time.h>
#include <math.h>
#include <memory>
#include <new>
#ifndef LEGACYLINK_HOST_BUILD
#include <esp_system.h>
#endif

// ============================================================
// CẤU HÌNH MẠNG - Đổi theo môi trường của team
// ============================================================
const char *ssid = LEGACYLINK_WIFI_SSID;
const char *password = LEGACYLINK_WIFI_PASSWORD;
const char *mqtt_server = LEGACYLINK_MQTT_HOST;
const int mqtt_port = LEGACYLINK_MQTT_PORT;
const char *mqtt_user = LEGACYLINK_MQTT_USER;
const char *mqtt_pass = LEGACYLINK_MQTT_PASSWORD;
const char *ntp_server_1 = LEGACYLINK_NTP_SERVER;
const char *ntp_server_2 = "time.nist.gov";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Stable gateway identity allows provisioning before any device config exists.
static char gateway_id[13];
static char mqtt_client_id[80];
static char config_topic[80];
static char probe_topic[80];
static bool pending_probe = false;
static char active_request_id[65] = {};
static char boot_id[17] = {};
static bool restored_at_boot = false;
static char device_config_topic[80];
static bool pending_device_config = false;
static constexpr size_t CONFIG_BUFFER_SIZE = MAX_CONFIG_PAYLOAD_BYTES + 1;
static char pending_config[CONFIG_BUFFER_SIZE];
static bool config_pending = false;
static AlarmMonitor alarm_monitor;
static bool wifi_was_connected = false;
static uint32_t last_wifi_retry = 0;
static constexpr uint32_t WIFI_RETRY_INTERVAL_MS = 10000;
static bool active_config_persisted = false;
static char config_ack[768];
static bool config_ack_pending = false;
static bool poll_active = false;
static uint8_t poll_index = 0;
static uint32_t last_poll_started = 0;
static modbus_result_t poll_results[MAX_REGISTERS];

void reset_poll_cycle() {
  poll_active = false;
  poll_index = 0;
  last_poll_started = static_cast<uint32_t>(millis()) - global_device_config.sampling_interval_ms;
}

// Trả về epoch MILLISECONDS (13 chữ số) khớp với backend validation
// Backend kiểm tra: timestamp >= Date.UTC(2020,0,1) = 1577836800000
unsigned long long current_epoch_ms() {
  timeval now = {};
  if (gettimeofday(&now, nullptr) != 0 || now.tv_sec < 1700000000) return 0;
  return static_cast<unsigned long long>(now.tv_sec) * 1000ULL + now.tv_usec / 1000;
}

void publish_gateway_state() {
  if (!mqttClient.connected()) return;
  StaticJsonDocument<512> doc;
  doc["schemaVersion"] = 1;
  doc["gatewayId"] = gateway_id;
  doc["bootId"] = boot_id;
  doc["configRequestId"] = active_request_id;
  doc["restored"] = restored_at_boot;
  doc["persisted"] = active_config_persisted;
  doc["timestamp"] = current_epoch_ms();
  if (is_config_valid) doc["deviceId"] = global_device_config.device_id;
  char topic[96], payload[640];
  snprintf(topic, sizeof(topic), "legacy-link/gateways/%s/state", gateway_id);
  serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topic, payload, true);
}

void flush_config_ack() {
  if (!config_ack_pending || !mqttClient.connected()) return;
  char topic[96];
  snprintf(topic, sizeof(topic), "legacy-link/gateways/%s/config/ack", gateway_id);
  if (mqttClient.publish(topic, config_ack, false)) config_ack_pending = false;
}

void queue_config_ack(const char *result, const char *reason, const char *request_id = "") {
  Serial.printf("[CONFIG] %s: %s; persisted=%s\r\n", result, reason,
                active_config_persisted ? "true" : "false");
  StaticJsonDocument<512> doc;
  doc["schemaVersion"] = 1;
  doc["gatewayId"] = gateway_id;
  if (is_config_valid) doc["deviceId"] = global_device_config.device_id;
  if (request_id[0]) doc["requestId"] = request_id;
  doc["bootId"] = boot_id;
  doc["result"] = result;
  doc["reason"] = reason;
  doc["persisted"] = active_config_persisted;
  const uint64_t timestamp = current_epoch_ms();
  if (timestamp) doc["timestamp"] = timestamp;
  if (doc.overflowed() || measureJson(doc) >= sizeof(config_ack)) return;
  serializeJson(doc, config_ack, sizeof(config_ack));
  config_ack_pending = true;
}

static bool read_request_id(const char *payload, char (&id)[65]) {
  DynamicJsonDocument doc(8192);
  if (deserializeJson(doc, payload) || !doc.is<JsonObject>()) return false;
  if (!doc.containsKey("requestId")) return true;
  const char *value = doc["requestId"].as<const char *>();
  if (!value || !value[0] || strlen(value) >= sizeof(id) ||
      doc["requestId"].as<JsonString>().size() != strlen(value)) return false;
  strlcpy(id, value, sizeof(id));
  return true;
}

// ============================================================
// MQTT TOPIC FORMAT (khớp với backend/src/config.js)
// Topic: legacy-link/devices/{deviceId}/telemetry
// Topic: legacy-link/devices/{deviceId}/status
// Topic: legacy-link/devices/{deviceId}/alarm
// ============================================================

// --- HÀM PUBLISH TELEMETRY LÊN MQTT ---
// Payload format khớp với backend/src/validation/telemetry.js:
// { "deviceId": "CNC-001", "timestamp": 1690000000000, "schemaVersion": 1, "metrics": {"temp": 65.4} }
static TelemetryQueue telemetry_queue;
static uint64_t telemetry_sequence = 0;
static AlarmQueue alarm_queue;

// A bounded exponential backoff prevents retry storms; unsigned subtraction
// preserves retry timing when millis wraps. Queues use independent head samples.
template<size_t N>
void flush_queue(DeliveryQueue<N> &queue, const char *kind) {
  if (!mqttClient.connected()) return;
  auto *sample = queue.front();
  if (!sample) return;
  const uint32_t delay_ms = sample->rejection[0] ? 30000 :
    (1000UL << (sample->attempts > 5 ? 5 : sample->attempts ? sample->attempts - 1 : 0));
  if (sample->attempts && static_cast<uint32_t>(millis() - sample->lastAttempt) < delay_ms) return;
  char topic[120];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/%s", sample->device, kind);
  sample->lastAttempt = millis();
  if (sample->attempts < UINT32_MAX) ++sample->attempts;
  // Replay byte-for-byte: identity and original capture time never change.
  mqttClient.publish(topic, sample->payload, false);
}
void flush_telemetry() { flush_queue(telemetry_queue, "telemetry"); }


void publish_telemetry(const device_config_t *cfg, modbus_result_t *results, uint8_t count) {
  if (count == 0) return;

  StaticJsonDocument<2048> doc;
  doc["deviceId"] = cfg->device_id;

  unsigned long long ts = current_epoch_ms();
  if (ts == 0) {
    Serial.println("[MQTT] Skip telemetry: NTP time not synchronized yet");
    return;
  }
  char message_id[80];
  snprintf(message_id, sizeof(message_id), "%s-%s-%llu", gateway_id, boot_id,
           static_cast<unsigned long long>(++telemetry_sequence));
  doc["messageId"] = message_id;
  doc["gatewayId"] = gateway_id;
  doc["timestamp"] = ts;
  doc["schemaVersion"] = 1;  // Backend bắt buộc field này

  JsonObject metrics = doc.createNestedObject("metrics");
  for (uint8_t i = 0; i < count; i++) {
    if (results[i].success && isfinite(results[i].scaled_value)) {
      metrics[results[i].key] = results[i].scaled_value;
    }
  }

  // Xây topic: legacy-link/devices/{deviceId}/telemetry
  char topic[80];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/telemetry", cfg->device_id);

  if (metrics.size() == 0 || doc.overflowed()) return;
  char payload[1024];
  if (measureJson(doc) >= sizeof(payload)) return;
  serializeJson(doc, payload, sizeof(payload));
  if (!telemetry_queue.push(cfg->device_id, message_id, payload, !mqttClient.connected()))
    Serial.printf("[OUTBOX] Full or oversized; dropped newest. Total dropped: %u\r\n", telemetry_queue.dropped());
  flush_telemetry();
}

bool publish_alarm(const device_config_t *cfg, const alarm_config_t *alarm,
                   double value, uint64_t timestamp) {
  if (timestamp == 0 || !isfinite(value)) return false;
  const char *metric_key = nullptr;
  for (uint8_t i = 0; i < cfg->register_count; ++i) {
    const auto &reg = cfg->registers[i];
    if (alarm == &reg.alarm || alarm == &reg.critical_alarm || alarm == &reg.low_alarm) {
      metric_key = reg.key; break;
    }
  }
  if (!metric_key) return false;
  char event_id[80];
  snprintf(event_id, sizeof(event_id), "%s-%s-%llu", gateway_id, boot_id,
           static_cast<unsigned long long>(++telemetry_sequence));
  StaticJsonDocument<768> doc;
  doc["gatewayId"] = gateway_id;
  doc["eventId"] = event_id;
  doc["metricKey"] = metric_key;
  doc["deviceId"] = cfg->device_id;
  doc["timestamp"] = timestamp;
  doc["schemaVersion"] = 1;
  doc["code"] = alarm->code;
  doc["severity"] = alarm->severity;
  doc["value"] = value;
  char topic[80], payload[768];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/alarm", cfg->device_id);
  if (doc.overflowed() || measureJson(doc) >= sizeof(payload)) return false;
  serializeJson(doc, payload, sizeof(payload));
  const bool queued = alarm_queue.push(cfg->device_id, event_id, payload, !mqttClient.connected());
  if (!queued) Serial.printf("[OUTBOX] Alarm queue full; failed enqueue attempts: %u\r\n", alarm_queue.dropped());
  flush_queue(alarm_queue, "alarm");
  return queued;
}

// --- HÀM PUBLISH DEVICE STATUS ---
// Backend validateStatus() yêu cầu: status là boolean, timestamp epoch ms, schemaVersion = 1
void publish_status(const device_config_t *cfg, bool is_online) {
  if (!mqttClient.connected()) return;

  unsigned long long ts = current_epoch_ms();
  if (ts == 0) return;  // NTP chưa đồng bộ, bỏ qua

  StaticJsonDocument<256> doc;
  doc["deviceId"] = cfg->device_id;
  doc["timestamp"] = ts;
  doc["schemaVersion"] = 1;
  doc["status"] = is_online;  // boolean: true/false (không phải string)

  char topic[80];
  snprintf(topic, sizeof(topic), "legacy-link/devices/%s/status", cfg->device_id);

  char payload[256];
  serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topic, payload, true);
  Serial.printf("[MQTT] Status: %s\r\n", is_online ? "online" : "offline");
}

// Start association without waiting for the access point to become available.
void setup_wifi() {
  WiFi.mode(WIFI_STA);
  wifi_was_connected = false;
  last_wifi_retry = millis();
  WiFi.begin(ssid, password);
  Serial.println("[WIFI] Connecting in background; Serial configuration is available");
}

void maintain_wifi() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifi_was_connected) {
      wifi_was_connected = true;
      Serial.println("[WIFI] Connected; starting time synchronization");
      configTime(0, 0, ntp_server_1, ntp_server_2);
    }
    return;
  }

  const uint32_t now = millis();
  if (wifi_was_connected) {
    wifi_was_connected = false;
    last_wifi_retry = now;
    // Close the old transport so MQTT reconnects and restores subscriptions.
    // Do not send MQTT DISCONNECT on an unexpected link loss: let the broker
    // publish the registered Last Will for this session.
    espClient.stop();
    Serial.println("[WIFI] Disconnected; continuing local polling");
  }
  if (static_cast<uint32_t>(now - last_wifi_retry) >= WIFI_RETRY_INTERVAL_MS) {
    last_wifi_retry = now;
    WiFi.reconnect();
    Serial.println("[WIFI] Retrying connection");
  }
}

// ModbusMaster calls this while waiting for UART bytes. MQTT callbacks only
// copy configurations; UART/config changes remain deferred until loop().
void service_modbus_wait() {
  static uint32_t last_service = 0;
  const uint32_t now = millis();
  if (static_cast<uint32_t>(now - last_service) >= 10) {
    last_service = now;
    maintain_wifi();
    if (mqttClient.connected()) mqttClient.loop();
  }
  delay(1); // Give ESP32 background networking and watchdog tasks CPU time.
}

// --- HÀM RECONNECT MQTT (Non-blocking, thử 1 lần rồi thôi) ---
void reconnect_mqtt() {
  if (mqttClient.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("Attempting MQTT connection...");

  bool connected = false;
  if (is_config_valid) {
    const uint64_t timestamp = current_epoch_ms();
    if (!timestamp) return; // Never register a will with an invalid epoch.
    snprintf(mqtt_client_id, sizeof(mqtt_client_id), "legacy-link-%s-%s", global_device_config.device_id, gateway_id);
    snprintf(device_config_topic, sizeof(device_config_topic), "legacy-link/devices/%s/config", global_device_config.device_id);
    char will_topic[80], will_payload[256];
    snprintf(will_topic, sizeof(will_topic), "legacy-link/devices/%s/status", global_device_config.device_id);
    StaticJsonDocument<256> will;
    will["schemaVersion"] = 1;
    will["deviceId"] = global_device_config.device_id;
    will["timestamp"] = timestamp;
    will["status"] = false;
    serializeJson(will, will_payload, sizeof(will_payload));
    connected = mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass, will_topic, 1, true, will_payload);
  } else {
    connected = mqttClient.connect(mqtt_client_id, mqtt_user, mqtt_pass);
  }
  if (connected) {
    Serial.println("connected!");

    char ingestion_topic[96];
    snprintf(ingestion_topic, sizeof(ingestion_topic), "legacy-link/gateways/%s/ingestion/ack", gateway_id);
    if (!mqttClient.subscribe(ingestion_topic, 1) || !mqttClient.subscribe(probe_topic, 1) || !mqttClient.subscribe(config_topic, 1) ||
        (is_config_valid && !mqttClient.subscribe(device_config_topic, 1))) {
      Serial.println("[MQTT] Config subscription failed; reconnecting on next retry");
      mqttClient.disconnect();
      return;
    }
    Serial.printf("[MQTT] Config topic: %s\r\n", config_topic);
    if (is_config_valid) publish_status(&global_device_config, true);
    publish_gateway_state();
    flush_config_ack();
  } else {
    Serial.print("failed, rc=");
    Serial.println(mqttClient.state());
  }
}

template<size_t N>
void accept_ingestion_ack(DeliveryQueue<N> &queue, const JsonDocument &ack) {
  auto *sample = queue.front();
  const char *device = json_text(ack["deviceId"], 63);
  const char *id = json_text(ack["messageId"], 79);
  if (!sample || !device || !id || strcmp(sample->device, device) || strcmp(sample->id, id)) return;
  const char *status = json_text(ack["status"], 16);
  if (!status) return;
  if (!strcmp(status, "committed")) queue.acknowledge(device, id);
  else if (!strcmp(status, "rejected")) {
    const char *reason = json_text(ack["reason"], 128);
    if (!reason) reason = "rejected";
    if (strcmp(reason, sample->rejection)) Serial.printf("[OUTBOX] Rejected %s: %s; retained for retry\r\n", id, reason);
    strlcpy(sample->rejection, reason, sizeof(sample->rejection));
  }
}

// Validate the control envelope both on receipt and immediately before execution.
const char *command_rejection(const JsonDocument &command, bool probe) {
  if (!command.is<JsonObjectConst>()) return "invalid_payload";
  for (const char *field : {"requestId", "expectedBootId", "expectedConfigRequestId"}) {
    if (command.containsKey(field) && !json_text(command[field],
        !strcmp(field, "expectedBootId") ? 16 : 64, !strcmp(field, "expectedConfigRequestId")))
      return "invalid_payload";
  }
  const char *id = command["requestId"] | "";
  if (!command_deadline_valid(command, current_epoch_ms()) ||
      (command.containsKey("expectedBootId") && strcmp(command["expectedBootId"], boot_id)) ||
      (!probe && command.containsKey("expectedConfigRequestId") &&
       strcmp(command["expectedConfigRequestId"], active_request_id) && strcmp(id, active_request_id)))
    return "stale_command";
  return nullptr;
}

// Copy the MQTT-owned bytes before returning; apply outside the callback.
void mqtt_callback(char *topic, byte *payload, unsigned int length) {
  char ack_topic[96];
  snprintf(ack_topic, sizeof(ack_topic), "legacy-link/gateways/%s/ingestion/ack", gateway_id);
  if (!strcmp(topic, ack_topic)) {
    StaticJsonDocument<768> ack;
    if (length >= 768 || deserializeJson(ack, payload, length) || ack["schemaVersion"] != 1) return;
    const char *kind = json_text(ack["kind"], 16);
    if (!kind) return;
    if (!strcmp(kind, "telemetry")) accept_ingestion_ack(telemetry_queue, ack);
    else if (!strcmp(kind, "alarm")) accept_ingestion_ack(alarm_queue, ack);
    return;
  }
  const bool device_topic = device_config_topic[0] && !strcmp(topic, device_config_topic);
  const bool is_probe = !strcmp(topic, probe_topic);
  if (strcmp(topic, config_topic) != 0 && !device_topic && !is_probe) return;
  if (length == 0 || length >= sizeof(pending_config) || memchr(payload, '\0', length)) {
    Serial.println("[CONFIG] Rejected: empty, oversized or NUL-containing MQTT payload");
    queue_config_ack("rejected", "invalid_payload");
    return;
  }
  DynamicJsonDocument command(8192);
  if (deserializeJson(command, reinterpret_cast<const char *>(payload), length)) {
    queue_config_ack("rejected", "invalid_payload");
    return;
  }
  const char *id = json_text(command["requestId"], 64);
  if (!id) id = "";
  if (config_pending) {
    queue_config_ack("rejected", "busy", id);
    flush_config_ack();
    return;
  }
  if (const char *reason = command_rejection(command, is_probe)) {
    queue_config_ack("rejected", reason, id);
    return;
  }
  memcpy(pending_config, payload, length);
  pending_config[length] = '\0';
  config_pending = true;
  pending_device_config = device_topic;
  pending_probe = is_probe;
  char request_id[65] = {};
  if (read_request_id(pending_config, request_id) && request_id[0]) {
    queue_config_ack("received", "ok", request_id);
    flush_config_ack();
  }
}

// Reconnect only on identity changes, otherwise a retained config would cause
// a reconnect loop. Device-scoped updates cannot reassign the gateway.
bool apply_runtime_config(const char *payload, bool device_scoped = false) {
  char request_id[65] = {};
  if (!payload || strnlen(payload, CONFIG_BUFFER_SIZE) >= CONFIG_BUFFER_SIZE ||
      !read_request_id(payload, request_id)) {
    queue_config_ack("rejected", "invalid_payload");
    return false;
  }
  std::unique_ptr<device_config_t> storage(new (std::nothrow) device_config_t{});
  if (!storage) { queue_config_ack("rejected", "out_of_memory", request_id); return false; }
  device_config_t &next = *storage;
  if (!parse_device_config(payload, &next)) {
    Serial.println("[CONFIG] Rejected: invalid configuration; keeping current config");
    queue_config_ack("rejected", "invalid_config", request_id);
    return false;
  }
  if (device_scoped && (!is_config_valid || strcmp(next.device_id, global_device_config.device_id))) {
    Serial.println("[CONFIG] Rejected: deviceId does not match config topic");
    queue_config_ack("rejected", "device_id_mismatch", request_id);
    return false;
  }
  if (is_config_valid && !memcmp(&next, &global_device_config, sizeof(next))) {
    if (!active_config_persisted || strcmp(active_request_id, request_id)) {
      active_config_persisted = save_config(payload);
      restored_at_boot = false;
    }
    strlcpy(active_request_id, request_id, sizeof(active_request_id));
    publish_gateway_state();
    queue_config_ack("unchanged", active_config_persisted ? "ok" : "storage_error", request_id);
    return true;
  }
  const bool identity_changed = !is_config_valid || strcmp(next.device_id, global_device_config.device_id);
  if (identity_changed && is_config_valid) publish_status(&global_device_config, false);
  if (!apply_new_configuration(payload)) {
    queue_config_ack("rejected", "apply_failed", request_id);
    return false;
  }
  active_config_persisted = save_config(payload);
  strlcpy(active_request_id, request_id, sizeof(active_request_id));
  restored_at_boot = false;
  publish_gateway_state();
  if (!active_config_persisted) Serial.println("[CONFIG] Applied in RAM; flash save failed");
  alarm_monitor.reset();
  reset_poll_cycle();
  queue_config_ack("applied", active_config_persisted ? "ok" : "storage_error", request_id);
  if (identity_changed) {
    mqttClient.disconnect();
    device_config_topic[0] = '\0';
    reconnect_mqtt();
  } else publish_status(&global_device_config, true);
  return true;
}

bool restore_saved_configuration() {
  if (!load_saved_config(pending_config, sizeof(pending_config))) return false;
  const bool restored = apply_new_configuration(pending_config);
  if (!restored) { pending_config[0] = '\0'; return false; }
  active_request_id[0] = '\0';
  read_request_id(pending_config, active_request_id);
  pending_config[0] = '\0';
  restored_at_boot = true;
  active_config_persisted = true;
  alarm_monitor.reset();
  reset_poll_cycle();
  Serial.println("[CONFIG] Restored validated configuration from flash");
  return true;
}

// Full scan diagnostics are sent even when every register fails. A status
// heartbeat never makes an unsuccessful measurement appear fresh.
void add_reading(JsonArray rows, const register_config_t &reg, const modbus_result_t &result) {
  JsonObject row = rows.createNestedObject();
  row["key"] = reg.key;
  row["address"] = reg.address;
  row["success"] = result.success;
  row["errorCode"] = result.error_code;
  const uint64_t now = current_epoch_ms();
  const uint32_t age = static_cast<uint32_t>(millis()) - result.completed_at_ms;
  row["sampledAt"] = now > age ? now - age : 0;
  if (result.success) {
    row["rawValue"] = result.raw_value;
    row["value"] = result.scaled_value;
    JsonArray words = row.createNestedArray("rawWords");
    for (uint8_t i = 0; i < result.word_count; ++i) words.add(result.raw_words[i]);
  }
}

void send_read_report(const device_config_t &cfg, modbus_result_t *results,
                      const char *request_id = nullptr) {
  if (!mqttClient.connected()) return;
  DynamicJsonDocument doc(8192);
  doc["schemaVersion"] = 1;
  doc["gatewayId"] = gateway_id;
  doc["deviceId"] = cfg.device_id;
  doc["bootId"] = boot_id;
  doc["timestamp"] = current_epoch_ms();
  doc["samplingIntervalMs"] = cfg.sampling_interval_ms;
  doc["configRequestId"] = active_request_id;
  if (request_id) { doc["requestId"] = request_id; doc["result"] = "completed"; }
  JsonArray rows = doc.createNestedArray("readings");
  for (uint8_t i = 0; i < cfg.register_count; ++i) add_reading(rows, cfg.registers[i], results[i]);
  char topic[96];
  if (request_id) snprintf(topic, sizeof(topic), "legacy-link/gateways/%s/probe/result", gateway_id);
  else snprintf(topic, sizeof(topic), "legacy-link/devices/%s/diagnostics", cfg.device_id);
  std::unique_ptr<char[]> payload(new (std::nothrow) char[4096]);
  if (!payload || doc.overflowed() || measureJson(doc) >= 4096) return;
  serializeJson(doc, payload.get(), 4096);
  mqttClient.publish(topic, payload.get(), false);
}

void run_probe(const char *payload) {
  char request_id[65] = {};
  std::unique_ptr<device_config_t> candidate(new (std::nothrow) device_config_t{});
  if (!candidate || !read_request_id(payload, request_id) || !request_id[0] ||
      !parse_device_config(payload, candidate.get())) {
    queue_config_ack("rejected", "invalid_probe", request_id);
    return;
  }
  uint64_t expires_at = 0;
  {
    DynamicJsonDocument command(8192);
    if (deserializeJson(command, payload) || !command_deadline_valid(command, current_epoch_ms())) {
      queue_config_ack("rejected", "stale_command", request_id);
      return;
    }
    expires_at = command["expiresAt"] | uint64_t(0);
  }
  const uint64_t started_epoch = current_epoch_ms();
  const uint32_t started_ms = millis();
  // Keep large workspaces off the ESP32 loop stack.
  std::unique_ptr<modbus_result_t[]> results(new (std::nothrow) modbus_result_t[MAX_REGISTERS]{});
  std::unique_ptr<device_config_t> fallback;
  if (!is_config_valid) fallback.reset(new (std::nothrow) device_config_t{});
  if (!results || (!is_config_valid && !fallback)) {
    queue_config_ack("rejected", "out_of_memory", request_id);
    return;
  }
  if (fallback) { fallback->baud_rate = 9600; fallback->stop_bits = 1; }
  // Temporarily switch UART settings; never replace global config, NVS or alarms.
  apply_uart_config(candidate.get());
  bool expired = false;
  for (uint8_t i = 0; i < candidate->register_count; ++i) {
    modbus_read_one(candidate.get(), i, &results[i]);
    // A transaction cannot be interrupted; stop before starting the next one.
    // Monotonic elapsed time also protects against an NTP clock step backwards.
    expired = expires_at && (current_epoch_ms() >= expires_at ||
        expires_at <= started_epoch ||
        static_cast<uint32_t>(millis() - started_ms) >= expires_at - started_epoch);
    if (expired) break;
  }
  apply_uart_config(is_config_valid ? &global_device_config : fallback.get());
  reset_poll_cycle();
  if (expired) queue_config_ack("rejected", "stale_command", request_id);
  else send_read_report(*candidate, results.get(), request_id);
}

void poll_modbus_step() {
  if (!is_config_valid) return;
  const uint32_t now = millis();
  if (!poll_active) {
    if (static_cast<uint32_t>(now - last_poll_started) < global_device_config.sampling_interval_ms) return;
    last_poll_started = now;
    poll_index = 0;
    poll_active = true;
  }
  modbus_read_one(&global_device_config, poll_index, &poll_results[poll_index]);
  if (++poll_index < global_device_config.register_count) return;
  poll_active = false;
  alarm_monitor.evaluate(&global_device_config, poll_results, poll_index, current_epoch_ms(), publish_alarm);
  publish_telemetry(&global_device_config, poll_results, poll_index);
  send_read_report(global_device_config, poll_results);
}

// Read-only bench diagnostics. No credentials or payload values are exposed.
template<size_t N>
void describe_outbox(JsonObject target, const DeliveryQueue<N> &queue) {
  target["pending"] = queue.size();
  target["capacity"] = N;
  target["highWater"] = queue.highWater();
  target["committed"] = queue.committed();
  target["failedEnqueues"] = queue.dropped();
  const auto *head = queue.front();
  if (head) {
    target["headId"] = head->id;
    target["deviceId"] = head->device;
    target["attempts"] = head->attempts;
    target["rejection"] = head->rejection;
  }
}
size_t delivery_health_json(char *output, size_t capacity) {
  StaticJsonDocument<2048> doc;
  doc["gatewayId"] = gateway_id;
  doc["bootId"] = boot_id;
  doc["wifiConnected"] = WiFi.status() == WL_CONNECTED;
  doc["mqttConnected"] = mqttClient.connected();
  doc["clockReady"] = current_epoch_ms() != 0;
  doc["freeHeapBytes"] = ESP.getFreeHeap();
  doc["storage"] = "RAM; cleared on reset";
  doc["mqttTransport"] = "plaintext";
  describe_outbox(doc.createNestedObject("telemetry"), telemetry_queue);
  describe_outbox(doc.createNestedObject("alarm"), alarm_queue);
  if (doc.overflowed() || measureJson(doc) >= capacity) return 0;
  return serializeJson(doc, output, capacity);
}
bool handle_serial_diagnostic(const char *line) {
  if (!strcmp(line, ":health")) {
    char output[2048];
    if (delivery_health_json(output, sizeof(output))) Serial.println(output);
    return true;
  }
  if (!strcmp(line, ":help")) {
    Serial.println(":health - read-only delivery health JSON; :help - commands. JSON config remains supported.");
    return true;
  }
  return false;
}

// ============================================================
// HÀM SETUP CHÍNH
// ============================================================
void setup() {
  Serial.setRxBufferSize(CONFIG_BUFFER_SIZE + 128);
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("   LEGACY LINK GATEWAY v0.2 - ONLINE   ");
  Serial.println("========================================");
  Serial.println("  Hardware : ESP32 DevKit v1");
  Serial.printf("  Free RAM : %u bytes\r\n", ESP.getFreeHeap());

  // Kết nối Wi-Fi (nếu thất bại vẫn chạy offline mode)
  setup_wifi();

  const uint64_t chip_id = ESP.getEfuseMac();
  snprintf(gateway_id, sizeof(gateway_id), "%04X%08X",
           static_cast<unsigned int>(chip_id >> 32), static_cast<unsigned int>(chip_id));
  snprintf(mqtt_client_id, sizeof(mqtt_client_id), "legacy-link-%s", gateway_id);
  snprintf(config_topic, sizeof(config_topic), "legacy-link/gateways/%s/config", gateway_id);
  snprintf(probe_topic, sizeof(probe_topic), "legacy-link/gateways/%s/probe", gateway_id);
#ifdef LEGACYLINK_HOST_BUILD
  strlcpy(boot_id, "host-test-boot", sizeof(boot_id));
#else
  snprintf(boot_id, sizeof(boot_id), "%08X%08X", esp_random(), esp_random());
#endif
  Serial.printf("[MQTT] Gateway ID: %s; config topic: %s\r\n", gateway_id, config_topic);

  // Cấu hình MQTT Broker
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqtt_callback);
  mqttClient.setSocketTimeout(1);
  modbus_init(1); // Bind UART and optional RS-485 direction callbacks; no poll yet.
  modbus_set_idle_callback(service_modbus_wait);
  // Include MQTT header and topic overhead in addition to the config payload.
  if (!mqttClient.setBufferSize(CONFIG_BUFFER_SIZE + 128)) {
    Serial.println("[MQTT] Failed to allocate configuration receive buffer");
  }
  restore_saved_configuration();

  Serial.println(is_config_valid ? "  Status   : Configuration restored" : "  Status   : Waiting for JSON config...");
  Serial.println("========================================");
  Serial.println("Paste JSON config and press Enter:\n");
}

// ============================================================
// HÀM LOOP CHÍNH
// ============================================================
void loop() {
  maintain_wifi();
  // 1. Giữ kết nối MQTT sống (thử reconnect mỗi 5 giây nếu mất)
  static unsigned long last_mqtt_retry = 0;
  if (!mqttClient.connected() && millis() - last_mqtt_retry >= 5000) {
    last_mqtt_retry = millis();
    reconnect_mqtt();
  }
  if (mqttClient.connected()) {
    mqttClient.loop();
  }

  if (config_pending) {
    // Keep the command busy while Modbus idle callbacks service MQTT.
    // Admission can precede execution by a slow network/Modbus operation.
    // Recheck expiry before any UART changes or flash writes.
    DynamicJsonDocument command(8192);
    const bool parsed = !deserializeJson(command, static_cast<const char *>(pending_config));
    const char *reason = parsed ? command_rejection(command, pending_probe) : "invalid_payload";
    if (reason) {
      const char *id = json_text(command["requestId"], 64);
      queue_config_ack("rejected", reason, id ? id : "");
    }
    else if (pending_probe) run_probe(pending_config);
    else apply_runtime_config(pending_config, pending_device_config);
    config_pending = false;
  }

  // 2. Nhận JSON qua Serial Monitor để cấu hình (backup khi chưa có MQTT config)
  static char inputBuffer[CONFIG_BUFFER_SIZE];
  static size_t inputLength = 0;
  static bool inputOverflow = false;

  while (Serial.available() > 0) {
    const char receivedByte = static_cast<char>(Serial.read());

    if (receivedByte == '\r') {
      continue;
    }

    if (receivedByte == '\n') {
      if (inputOverflow) {
        inputOverflow = false;
        inputLength = 0;
        continue;
      }
      inputBuffer[inputLength] = '\0';

      if (inputLength > 0) {
        Serial.printf("\n[RECV] %u bytes received\r\n", inputLength);
        if (!handle_serial_diagnostic(inputBuffer)) apply_runtime_config(inputBuffer);
      }

      inputLength = 0;
    } else if (inputOverflow) {
      continue; // Discard the entire oversized line, including any valid-looking suffix.
    } else if (receivedByte == '\0') {
      inputOverflow = true;
      inputLength = 0;
      Serial.println("[CONFIG] Rejected: NUL-containing Serial input");
    } else if (inputLength < sizeof(inputBuffer) - 1) {
      inputBuffer[inputLength++] = receivedByte;
    } else {
      inputLength = 0;
      inputOverflow = true;
      Serial.println("[ERROR] Input too long (max 4095 bytes); discarding line");
    }
  }

  flush_config_ack();
  flush_queue(alarm_queue, "alarm");
  flush_telemetry();
  static uint32_t last_gateway_report = 0;
  if (mqttClient.connected() && millis() - last_gateway_report >= 10000) {
    last_gateway_report = millis();
    publish_gateway_state();
  }
  // At most one register transaction per iteration; network service continues
  // inside the transaction through ModbusMaster's idle hook.
  poll_modbus_step();

  // 4. Publish heartbeat status mỗi 30 giây
  if (is_config_valid && mqttClient.connected()) {
    static unsigned long last_status_time = 0;
    if (millis() - last_status_time >= 30000) {
      last_status_time = millis();
      publish_status(&global_device_config, true);
    }
  }
}
