# Contributing

## Workflow

1. Create a branch from `main` using a focused name such as `feature/uart-parser`, `fix/serial-timeout`, or `docs/setup-guide`.
2. Keep each pull request focused on one change.
3. Explain hardware requirements and manual verification steps in the pull request.
4. Run the relevant build and tests before requesting review.

## Firmware Checks

From the repository root:

```powershell
pio run -d firmware/legacy-link-core
pio test -d firmware/legacy-link-core
```

If a check requires physical hardware, state that clearly in the pull request and include the board, port settings, baud rate, and observed result.

## Commit Messages

Use short, descriptive messages with an optional component prefix:

```text
feat(firmware): add UART frame parser
fix(backend): reject invalid device configuration
docs: document ESP32 wiring
```

Do not commit `.pio` output, local upload ports, credentials, or generated editor configuration.

## Pull Requests

Include:

- What changed and why
- How it was tested
- Hardware or environment details, when relevant
- Screenshots or serial output for user-visible behavior