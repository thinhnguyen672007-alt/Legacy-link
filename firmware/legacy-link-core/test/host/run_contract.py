#!/usr/bin/env python3
"""Check actual firmware messages against backend validators at a Git revision."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend-ref', default='origin/main',
                        help='Fetched Git revision containing the backend validators (default: origin/main)')
    args = parser.parse_args()
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


if __name__ == '__main__':
    main()
