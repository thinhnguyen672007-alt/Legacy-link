#pragma once
#define WL_CONNECTED 3
struct WiFiClient {};
struct TestWiFi {
  void begin(const char *, const char *) {}
  int status() { return WL_CONNECTED; }
  const char *localIP() { return "127.0.0.1"; }
};
static TestWiFi WiFi;
