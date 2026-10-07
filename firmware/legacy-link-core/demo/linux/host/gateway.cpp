// Run production configuration, polling, alarms and serializers on Linux.
// Wi-Fi, Preferences and PubSubClient are host doubles; Python bridges MQTT.
#include "../../../src/main.cpp"
#include <chrono>
#include <fstream>
#include <iostream>
#include <iterator>
#include <thread>
#include <fcntl.h>
#include <unistd.h>

TestSerial Serial, Serial2;
TestEsp ESP;
unsigned long test_millis = 0;

int main(int argc, char **argv) {
  if (argc != 2) return 2;
  std::ifstream input(argv[1]);
  if (!input) return 2;
  std::string config((std::istreambuf_iterator<char>(input)), {});
  setup(); reconnect_mqtt();
  mqttClient.receive(config_topic, config);
  fcntl(STDIN_FILENO, F_SETFL, O_NONBLOCK);
  std::string pending;
  const auto started = std::chrono::steady_clock::now();
  while (true) {
    char buffer[8192];
    const auto count = read(STDIN_FILENO, buffer, sizeof(buffer));
    if (count == 0) return 0;
    if (count > 0) pending.append(buffer, count);
    size_t end;
    while ((end = pending.find('\n')) != std::string::npos) {
      DynamicJsonDocument command(12288);
      if (!deserializeJson(command, pending.substr(0, end))) {
        const char *topic = command["topic"];
        const char *payload = command["payload"];
        if (topic && payload) mqttClient.receive(topic, payload);
      }
      pending.erase(0, end + 1);
    }
    test_millis = 1000 + std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - started).count();
    loop();
    for (const auto &message : mqttClient.published) {
      DynamicJsonDocument envelope(8192);
      envelope["topic"] = message.topic;
      envelope["payload"] = message.payload;
      envelope["retained"] = message.retained;
      std::string line; serializeJson(envelope, line);
      std::cout << line << std::endl;
    }
    mqttClient.published.clear();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
}
