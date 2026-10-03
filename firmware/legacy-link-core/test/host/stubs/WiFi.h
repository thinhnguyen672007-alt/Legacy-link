#pragma once
#define WL_CONNECTED 3
#define WL_DISCONNECTED 6
#define WIFI_STA 1
struct WiFiClient {
  unsigned stops = 0;
  void stop() { ++stops; }
};
struct TestWiFi {
  int connection_status = WL_CONNECTED;
  int selected_mode = 0;
  unsigned begins = 0, reconnects = 0;
  void mode(int value) { selected_mode = value; }
  void begin(const char *, const char *) { ++begins; }
  bool reconnect() { ++reconnects; return true; }
  int status() { return connection_status; }
  const char *localIP() { return "127.0.0.1"; }
};
static TestWiFi WiFi;
