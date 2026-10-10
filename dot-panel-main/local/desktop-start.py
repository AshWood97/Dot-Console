#!/usr/bin/env python3
"""One-shot cloud desktop startup. No viewer, browser-profile, or polling hooks."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:8787/'


def log(message):
    print(f'Dot Console: {message}', flush=True)


def parse_outputs(text):
    outputs = []
    for line in text.splitlines():
        match = re.match(r'^(\S+) connected\b(.*)', line)
        if match:
            outputs.append({'name': match[1], 'primary': ' primary ' in ' ' + match[2] + ' ', 'modes': [], 'current': None})
        elif line and not line[0].isspace():
            outputs.append(None)
        elif outputs and outputs[-1] is not None:
            match = re.match(r'^\s+(\d+x\d+)\s+(.*)', line)
            if match:
                outputs[-1]['modes'].append(match[1])
                if '*' in match[2]:
                    outputs[-1]['current'] = match[1]
    return [output for output in outputs if output]


def choose_mode(output):
    modes = [m for m in output['modes'] if int(m.split('x')[0]) * 10 == int(m.split('x')[1]) * 16]
    if '1280x800' in modes:
        return '1280x800'
    if output['current'] in modes:
        return output['current']
    return min(modes, key=lambda m: abs(int(m.split('x')[0]) - 1280)) if modes else None


def display_defaults():
    if not os.environ.get('DISPLAY') or not shutil.which('xrandr'):
        log('no X11 display/xrandr; leaving display unchanged')
        return False
    def query():
        return parse_outputs(subprocess.check_output(['xrandr', '--query'], text=True, stderr=subprocess.STDOUT, timeout=8))
    try:
        outputs = query()
        output = next((o for o in outputs if o['primary']), outputs[0] if outputs else None)
        mode = choose_mode(output) if output else None
        if not mode:
            log('no advertised 16:10 mode; leaving display unchanged')
            return False
        if output['current'] != mode:
            subprocess.run(['xrandr', '--output', output['name'], '--mode', mode], check=True, capture_output=True, timeout=8)
        verified = next((o for o in query() if o['name'] == output['name']), None)
        if not verified or verified['current'] != mode:
            log('display change could not be verified; no custom mode will be created')
            return False
        log(f"verified display {output['name']} {mode} (16:10)")
        return True
    except (OSError, subprocess.SubprocessError) as error:
        log(f'display setting unavailable ({type(error).__name__}); continuing')
        return False


def healthy():
    try:
        # Ignore proxy environment for this strictly loopback-only request.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(URL + 'api/task-events', timeout=2) as response:
            value = json.load(response)
        if not (isinstance(value.get('events'), list) and isinstance(value.get('cursor'), str) and 'serverTime' in value):
            return False
        with opener.open(URL, timeout=2) as response:
            return response.status == 200 and b'<html' in response.read(8192).lower()
    except (OSError, ValueError, AttributeError):
        return False


def state_directory():
    # /tmp is machine-local: shared source must not make distinct localhost namespaces share a lock.
    suffix = hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
    path = Path('/tmp') / f'dot-console-{os.getuid()}-{suffix}'
    path.mkdir(mode=0o700, exist_ok=True)
    if path.is_symlink() or path.stat().st_uid != os.getuid():
        raise RuntimeError('Unsafe runtime directory')
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-open', action='store_true', help='Start/check service without opening the browser')
    parser.add_argument('--open', action='store_true', help='Explicitly open again (may create a tab if one already exists)')
    parser.add_argument('--session-start', action='store_true', help='Called once by desktop login autostart; open for the new session')
    parser.add_argument('--no-display', action='store_true', help='Leave display unchanged')
    parser.add_argument('--foreground', action='store_true', help='Keep this process attached to a newly started server')
    args = parser.parse_args()
    state = state_directory()
    process = None
    with (state / 'startup.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not args.no_display and os.environ.get('DOT_CONSOLE_DISPLAY', '1') != '0':
            display_defaults()
        if not healthy():
            try:
                with socket.create_connection(('127.0.0.1', 8787), timeout=1):
                    log('port 8787 is occupied but panel health failed; leaving the existing process untouched')
                    return 1
            except OSError:
                pass
            node = shutil.which('node')
            bundled = Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')
            if node is None and bundled.is_file():
                node = str(bundled)
            if not node or not (ROOT / 'dist/index.html').is_file():
                log('Node or built UI missing; install dependencies and run npm run build first')
                return 1
            env = os.environ.copy()
            env['PATH'] = str(Path(node).parent) + os.pathsep + env.get('PATH', '')
            # Preserve desktop HOME for xdg-open; isolate only the backend tooling state.
            env.update(HOME='/tmp/dot-panel-home', XDG_CONFIG_HOME='/tmp/dot-panel-config', WRANGLER_LOG_PATH='/tmp/dot-panel-logs', WRANGLER_SEND_METRICS='false')
            with (state / 'server.log').open('ab') as output:
                process = subprocess.Popen([node, str(ROOT / 'local/server.mjs')], cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=output, stderr=output, start_new_session=not args.foreground)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline and process.poll() is None and not healthy():
                time.sleep(.25)
            if not healthy():
                log(f'service did not become healthy; inspect {state / "server.log"}')
                if process.poll() is None:
                    process.terminate()
                return 1
            log('started and verified panel service')
        else:
            log('existing panel service healthy; reused')
        session = os.environ.get('XDG_SESSION_ID', '') + ':' + os.environ.get('DISPLAY', '')
        marker = state / ('opened-' + hashlib.sha256(session.encode()).hexdigest()[:12])
        should_open = not args.no_open and os.environ.get('DOT_CONSOLE_OPEN', '1') != '0'
        if should_open and (args.open or args.session_start or not marker.exists()):
            if not os.environ.get('DISPLAY') or not shutil.which('xdg-open'):
                log(f'no desktop opener; open {URL} in this machine’s browser')
            else:
                try:
                    subprocess.run(['xdg-open', URL], check=True, timeout=15, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    marker.touch()
                    log('requested panel via the normal desktop browser opener')
                except (OSError, subprocess.SubprocessError):
                    log(f'browser open unconfirmed; open {URL} manually')
        elif should_open:
            log('browser already requested this session; no duplicate tab requested')
    if args.foreground and process:
        try:
            return process.wait()
        except KeyboardInterrupt:
            process.terminate()
            process.wait(timeout=5)
    return 0


if __name__ == '__main__':
    sys.exit(main())
