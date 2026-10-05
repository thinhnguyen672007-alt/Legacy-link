#!/usr/bin/env python3
"""Check actual firmware messages against backend validators at a Git revision."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from broker_roundtrip import roundtrip


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend-ref', default='origin/main',
                        help='Fetched Git revision containing the backend validators (default: origin/main)')
    parser.add_argument('--mqtt-host', help='Also send captured messages through this test broker')
    parser.add_argument('--mqtt-port', type=int, default=1883)
    parser.add_argument('--mosquitto-bin-dir', help='Directory containing mosquitto_pub and mosquitto_sub')
    args = parser.parse_args()
    if not 1 <= args.mqtt_port <= 65535:
        parser.error('--mqtt-port must be between 1 and 65535')
    host = Path(__file__).resolve().parent
    project = host.parent.parent
    repo = project.parent.parent
    revision = subprocess.check_output(
        ['git', 'rev-parse', '--verify', '--end-of-options', f'{args.backend_ref}^{{commit}}'],
        cwd=repo, text=True).strip()
    print(f'Checking backend validators at {revision}', flush=True)
    include = project / '.pio/libdeps/esp32dev/ArduinoJson/src'
    if not (include / 'ArduinoJson.h').is_file():
        parser.error('Run pio run -d firmware/legacy-link-core to install ArduinoJson first.')

    with tempfile.TemporaryDirectory(prefix='legacy-link-contract-') as temp:
        work = Path(temp)
        (work / 'package.json').write_text(json.dumps({'type': 'module'}), encoding='utf8')
        for name in ['shared', 'telemetry', 'status', 'alarm']:
            source = subprocess.check_output(
                ['git', 'show', f'{revision}:backend/src/validation/{name}.js'], cwd=repo)
            (work / f'{name}.js').write_bytes(source)
        binary = work / 'messages'
        subprocess.run([
            os.environ.get('CXX', 'c++'), '-std=c++11', '-Wall', '-Wextra', '-Werror',
            '-fsanitize=address,undefined', '-fno-omit-frame-pointer',
            '-I', str(host / 'stubs'), '-I', str(project / 'include'), '-I', str(include),
            str(project / 'src/modbus_reader.cpp'), str(project / 'src/alarm_monitor.cpp'),
            str(project / 'src/config_parser.cpp'), str(host / 'contract_messages.cpp'),
            '-o', str(binary),
        ], check=True)
        capture = work / 'messages.jsonl'
        with capture.open('w', encoding='utf8') as output:
            subprocess.run([str(binary), str(project / 'examples/bench-device.json')],
                           stdout=output, check=True)
        subprocess.run(['node', str(host / 'check_contract.mjs'), str(work), str(capture)], check=True)
        if args.mqtt_host:
            try:
                received = roundtrip(capture, work, args.mqtt_host, args.mqtt_port, args.mosquitto_bin_dir)
            except RuntimeError as error:
                parser.exit(1, f'Broker test failed: {error}\n')
            except (subprocess.SubprocessError, OSError):
                # Subprocess exceptions can include command-line credentials.
                parser.exit(1, 'Broker test failed: check connection, credentials, permissions and client tools.\n')
            subprocess.run(['node', str(host / 'check_contract.mjs'), str(work), str(received)], check=True)
            print('Scope: host-simulated firmware -> live test broker -> backend validators. '
                  'No physical ESP32, remote backend process or database was tested.')
        else:
            print('Scope: serialization and validation only; no physical ESP32, broker or database was used.')


if __name__ == '__main__':
    main()
