"""Transport firmware payloads through an isolated Mosquitto test namespace."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import uuid


def roundtrip(capture, work, host, port, bin_dir):
    def tool(name):
        executable = str(Path(bin_dir) / name) if bin_dir else shutil.which(name)
        if not executable or not Path(executable).is_file():
            raise RuntimeError(f'{name} is required for the broker test.')
        return executable

    publisher, subscriber = tool('mosquitto_pub'), tool('mosquitto_sub')
    stdbuf = shutil.which('stdbuf')
    if not stdbuf:
        raise RuntimeError('The broker test requires stdbuf (GNU coreutils).')
    connection = ['-h', host, '-p', str(port)]
    username, password = os.environ.get('MQTT_USERNAME'), os.environ.get('MQTT_PASSWORD')
    if bool(username) != bool(password):
        raise RuntimeError('Set both MQTT_USERNAME and MQTT_PASSWORD, or neither.')
    if username:
        connection += ['-u', username, '-P', password]

    expected = [json.loads(line) for line in capture.read_text().splitlines()]
    namespace = f'legacy-link/test/contract-{uuid.uuid4().hex}/'
    topic_map = {namespace + msg['topic']: msg['topic'] for msg in expected}
    retained_topics = set()
    output = work / 'broker-output.log'
    errors = work / 'broker-errors.log'
    process = None
    try:
        with output.open('w') as log, errors.open('w') as error_log:
            process = subprocess.Popen([
                stdbuf, '-oL', subscriber, *connection, '-t', namespace + '#',
                '-q', '1', '-v', '-d', '-C', str(len(expected)), '-W', '30',
            ], stdout=log, stderr=error_log)
            deadline = time.monotonic() + 10
            while 'received SUBACK' not in output.read_text():
                if process.poll() is not None:
                    raise RuntimeError('Subscriber exited before subscription was ready; check broker access.')
                if time.monotonic() > deadline:
                    raise RuntimeError('Timed out waiting for the MQTT subscription.')
                time.sleep(0.05)

            for index, message in enumerate(expected):
                payload = work / f'publish-{index}.json'
                payload.write_text(message['payload'])
                topic = namespace + message['topic']
                command = [publisher, *connection, '-t', topic, '-q', '0', '-f', str(payload)]
                if message['retained']:
                    retained_topics.add(topic)
                    command.append('-r')
                subprocess.run(command, check=True, timeout=10,
                               stdout=subprocess.DEVNULL, stderr=error_log)
            if process.wait(timeout=35) != 0:
                raise RuntimeError('Subscriber did not receive all firmware messages.')

        received = []
        for line in output.read_text().splitlines():
            topic, _, payload = line.partition(' ')
            if topic in topic_map:
                received.append({'topic': topic_map[topic], 'payload': payload})
        wanted = [{'topic': msg['topic'], 'payload': msg['payload']} for msg in expected]
        if received != wanted:
            raise RuntimeError('Broker payloads or their sequence differ from firmware output.')
        result = work / 'received.jsonl'
        result.write_text('\n'.join(json.dumps({**msg, 'retained': original['retained']})
                                    for msg, original in zip(received, expected)) + '\n')
        print(f'PASS: {len(received)} firmware payloads received unchanged through {host}:{port}.', flush=True)
        print(f'Test namespace: {namespace} (not production device topics).', flush=True)
        return result
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        # Remove only retained test messages belonging to this particular run.
        for topic in retained_topics:
            try:
                subprocess.run([publisher, *connection, '-t', topic, '-r', '-n'],
                               check=True, timeout=5, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL)
            except (subprocess.SubprocessError, OSError):
                print(f'Cleanup failed; clear the retained test topic manually: {topic}', flush=True)
