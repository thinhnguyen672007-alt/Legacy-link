# Legacy-link

Configuration-driven, low-cost gateway for connecting legacy equipment to modern software.

> Status: early prototype. The current firmware validates ESP32 UART communication with a serial echo test.

## Overview

Legacy-link is intended to bridge older industrial or laboratory equipment with modern applications through a configurable gateway. The repository is organized so the firmware, future backend, frontend, simulators, and documentation can evolve independently.

## Repository Layout

| Directory | Purpose |
| --- | --- |
| `firmware/` | PlatformIO firmware for the ESP32 gateway |
| `backend/` | Planned service and API layer |
| `frontend/` | Planned operator interface |
| `simulators/` | Planned hardware and protocol simulators |
| `tests/` | Cross-component and integration tests |
| `docs/` | Architecture, hardware, and protocol documentation |

## Current Firmware

The current `esp32dev` target initializes UART0 at `115200` baud and echoes newline-terminated input. This is a hardware bring-up test, not the final gateway protocol.

### Requirements

- ESP32 Dev Module
- VS Code with PlatformIO, or the PlatformIO CLI
- USB data cable and the appropriate CP210x driver, if required by the board

### Build

From the repository root:

```powershell
pio run -d firmware/legacy-link-core
```

Upload to a connected board by specifying the port for your machine:

```powershell
pio run -d firmware/legacy-link-core -t upload --upload-port COM3
```

Monitor the serial output:

```powershell
pio device monitor -d firmware/legacy-link-core -b 115200
```

Type a line and press Enter. The board should print the received text back over UART0.

## Roadmap

- Define the legacy device protocol and configuration schema
- Add framed UART parsing and validation
- Add simulator-driven tests for malformed and partial messages
- Implement the backend gateway API
- Add a frontend for device status and configuration
- Document supported hardware, wiring, and deployment

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Keep changes focused, explain hardware-dependent behavior, and include a test or build command in the pull request description.

## License

No license has been selected yet. Until one is added, the default copyright rules apply and reuse is not automatically permitted.
