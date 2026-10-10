# Firmware local validation — 2026-10-10

## Scope and revisions

Firmware-only changes on `feature/firmware-base`. Runtime changes through
`8edce69`, regression fixtures through `35e66ad`. Documentation follow-ups do not
change the binary. No backend, infrastructure or frontend files were modified by
this work. No board was flashed and no physical acceptance is claimed here.

| Reference checked | Revision | Result |
| --- | --- | --- |
| `origin/main` | `cc8f542` | Already included in firmware branch; backend contract passed |
| `origin/feature/backend-base` | `9054237` | Backend contract passed |
| `origin/feature/infra-base` | `64d946e` | Reviewed new outage-test and HTTP-token wiring changes; no MQTT firmware contract change |

Non-mutating branch merge simulations (`git merge-tree --write-tree`) at firmware
`35e66ad` succeeded against all three references without text conflicts. They
create temporary Git tree objects, not merges or branch updates. This is not a
guarantee about future commits or full-stack runtime compatibility. Teammate
branches were fetched repeatedly during implementation; their unmerged work was
not imported into firmware.

## Checks performed

| Check | Evidence/result |
| --- | --- |
| Complete host regression suite | 17 executables passed with AddressSanitizer and UndefinedBehaviorSanitizer; LeakSanitizer disabled in the sandbox |
| Final maximum-key fixture adjustment | `gateway_test` rerun passed |
| ESP32 PlatformIO build | Passed; static RAM 107,452 / 327,680 bytes (32.8%); flash 802,249 / 1,310,720 bytes (61.2%) |
| Backend contract, main | 22 serialized messages accepted; wrong identities/schema and incomplete/mismatched read reports rejected |
| Backend contract, teammate branch | Same 22-message check passed at `9054237` |
| Local live broker | All 22 messages received with identical payload bytes and order through the existing local Mosquitto container, then passed the backend validators again |
| Packet boundary | 16-register configuration: 2,225 bytes; tested read report with long IDs/keys and wide values: 2,998 bytes; 4,095-byte config accepted and 4,096 rejected |
| Scope/whitespace | Diff limited to `firmware/legacy-link-core/`; `git diff --check` passed |

The local broker test used namespace
`legacy-link/test/contract-f58231b26b464120a35d65b4e4c7fb91/`; its retained test
messages were cleared by the runner. MQTT CLI tools ran inside the existing
broker container using temporary local wrappers. Credentials came from an
ignored local Compose file and are not part of this report or Git history.
The test did not publish to production device topics, run a database assertion,
or prove the remote backend's authorization policy.

Reproduce the software checks from the repository root:

```bash
ASAN_OPTIONS=detect_leaks=0 bash firmware/legacy-link-core/test/host/run.sh
ASAN_OPTIONS=detect_leaks=0 python3 firmware/legacy-link-core/test/host/run_contract.py --backend-ref origin/main
ASAN_OPTIONS=detect_leaks=0 python3 firmware/legacy-link-core/test/host/run_contract.py --backend-ref origin/feature/backend-base
pio run -d firmware/legacy-link-core
```

For broker transport, follow the [broker test guide](first-connection.md#test-payload-transport-through-a-live-broker-without-an-esp32)
and choose a local test broker with permissions for the isolated test namespace.
Do not copy private credentials into commands committed to the repository.

## Behaviors now covered

- Reject metric names incompatible with backend ingestion before applying config.
- Reject malformed/NUL-containing ACK identities and command strings.
- Recheck expiry and expected active configuration before execution; identify busy requests.
- Preserve an executing probe when another MQTT command arrives during a Modbus wait.
- Stop an expired probe after the current transaction and restore UART settings.
- Keep large probe workspaces on the heap and expose failed local report writes.
- Inspect raw/scaled values, read errors, age and unknown state through `:inspect`.
- Enumerate pending IDs without altering queues using `:outbox`.
- Apply a new profile immediately with old telemetry and alarm backlog intact.
- Preserve old payload bytes through rejection and continue collecting the new map.

## Remaining integrated acceptance

The team should flash this version and repeat cold power-off/NVS/NTP recovery,
Wi-Fi/broker/backend/database outages, lost ACK after commit, rejection/full
queues, profile changes with backlog, signed/UINT32 reads and alarm
high→critical→cool→rearm against the final frontend/backend deployment.
Previous hardware evidence belongs to its original firmware revision; it is not
proof for this new build. Database deduplication and dashboard behavior were not
retested in this local software pass.

MQTT remains plaintext as requested. RAM queues still lose pending samples on
power loss, full queues refuse new samples, and a rejected FIFO head delays later
samples. USB inspection reports Unknown/Error locally; frontend display and
historical profile attribution require the existing backend/frontend integration.
See [profile backlog semantics](backend-alignment.md#profile-changes-with-pending-delivery).
