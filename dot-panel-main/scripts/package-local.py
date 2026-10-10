#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Package the current local console source, without Git, private state or publication."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = 'dot-console-local-review'
SOURCE_DIR = 'dot-panel-main'
UPSTREAM_COMMIT = '55b19217d08f33c01e18b51609d1685212aa1c67'
ROOT_FILES = {
    '.dev.vars.example', '.env.example', '.gitignore', 'LICENSE', 'README.md',
    'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'cloudflare-env.d.ts',
    'drizzle.config.ts', 'index.html', 'package.json', 'package-lock.json',
    'tsconfig.json', 'vite.config.ts', 'wrangler.jsonc',
}
SOURCE_DIRS = {'agent-skills', 'db', 'docs', 'drizzle', 'lib', 'local',
               'packaging', 'public', 'scripts', 'src', 'tests', 'worker'}
EXTENSIONS = {'.ts', '.tsx', '.mts', '.mjs', '.css', '.py', '.sh', '.md', '.json',
              '.sql', '.svg', '.png', '.ico', '.webmanifest', '.yml'}
DENIED = {'.git', '.aws', '.codex', '.openai', '.wrangler', 'node_modules',
          'dist', '__pycache__', 'task-events.jsonl', 'usage-helper-state.json',
          'last-good.json', 'config.json', 'status.json', 'runtime', 'logs'}
EXCLUSIONS = [
    'Credentials and non-example .env/.dev.vars files',
    'Task-event history, runtime state, databases, logs and process/open markers',
    'Dependency trees, generated dist output, QA HTML and private-data QA generators',
    'Git metadata, host configuration, backups, screenshots and prior delivery files',
]
PRIVATE = re.compile(
    r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
    r'|\bsk-[A-Za-z0-9_-]{24,}'
    r'|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{25,}'
    r'|\bAKIA[A-Z0-9]{16}\b'
    r'|\b(?:libfile_[a-z0-9]+|file_[0-9a-f]{20,}|plugin_asdk_app_[0-9a-f]+)\b'
    r'|https://[^\s"<>]*(?:sites\.chatgpt\.com|\.workers\.dev)'
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def dump(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def safe_path(name):
    require(bool(name) and not name.startswith('/') and '\\' not in name and ':' not in name,
            f'Unsafe path: {name}')
    require(all(part not in ('', '.', '..') for part in name.split('/')), f'Unsafe path: {name}')
    parts = PurePosixPath(name).parts
    require(not any(part in DENIED for part in parts), f'Excluded path: {name}')
    require(not any(part.startswith(('.env', '.dev.vars')) and part not in
                    ('.env.example', '.dev.vars.example') for part in parts), f'Credential path: {name}')


def selected(name):
    path = PurePosixPath(name)
    if name in ROOT_FILES:
        return True
    if path.parts[:2] == ('.github', 'workflows'):
        return path.suffix == '.yml'
    if path.parts[0] not in SOURCE_DIRS or path.suffix not in EXTENSIONS:
        return False
    # These local browser fixture generators read host-private history or backups.
    if name.startswith('tests/local/') and (path.name.endswith('-qa.mjs') or
                                           path.name.endswith('-fixtures.mjs')):
        return False
    try:
        safe_path(name)
    except ValueError:
        return False
    return not any(part.startswith('.') for part in path.parts)


def scan(name, data):
    safe_path(name)
    if PurePosixPath(name).suffix not in ('.png', '.ico'):
        require(not PRIVATE.search(data.decode('utf-8')), f'Private identifier/credential pattern: {name}')


def mode(name, data):
    return 0o755 if name.endswith('.sh') or data.startswith(b'#!/') else 0o644


def collect(root, launcher):
    require(root.is_dir() and not root.is_symlink(), 'Source must be a real directory')
    payload = {}
    for path in sorted(root.rglob('*')):
        name = path.relative_to(root).as_posix()
        # Do not read or follow files in excluded trees, even if they resemble source.
        if any(part in DENIED for part in PurePosixPath(name).parts):
            continue
        if selected(name):
            require(not path.is_symlink() and path.is_file(), f'Non-regular source: {name}')
            data = path.read_bytes()
            scan(name, data)
            payload[f'{SOURCE_DIR}/{name}'] = data
    for name in ROOT_FILES | {'local/desktop-start.py', 'local/install-desktop.sh',
                             'local/server.mjs', 'local/events.mjs', 'local/emit.mjs',
                             'local/report.mjs', 'local/reporting.mjs', 'local/REPORTING.md',
                             'lib/task-reporting.mjs', 'lib/task-reporting.d.mts',
                             'lib/project-identity.mjs', 'lib/project-identity.d.mts',
                             'local/DESKTOP-STARTUP.md', 'src/TaskWindow.tsx',
                             'src/task-window.css', 'src/project-model.ts',
                             'worker/index.ts', 'worker/sites.ts', 'worker/auth.ts',
                             'packaging/LOCAL-INSTALL.md', 'scripts/package-local.py'}:
        require(f'{SOURCE_DIR}/{name}' in payload, f'Missing required source: {name}')
    require(launcher.is_file() and not launcher.is_symlink(), 'Launcher must be a regular file')
    payload['start.sh'] = launcher.read_bytes()
    scan('start.sh', payload['start.sh'])
    require(b'/dot-panel-main' in payload['start.sh'] and b'local/desktop-start.py' in payload['start.sh'],
            'Launcher must use the portable sibling dot-panel-main checkout')
    payload['INSTALL.md'] = payload[f'{SOURCE_DIR}/packaging/LOCAL-INSTALL.md']
    manifest = {
        'project': 'Dot Console local review snapshot', 'license': 'AGPL-3.0-only',
        'source_only': True, 'scope': 'Current included source; no inherited test claims',
        'files': [{'path': name.removeprefix(SOURCE_DIR + '/'), 'sha256': digest(data)}
                  for name, data in sorted(payload.items()) if name.startswith(SOURCE_DIR + '/')],
    }
    payload[f'{SOURCE_DIR}/SOURCE_MANIFEST.json'] = dump(manifest)
    payload['PROVENANCE.json'] = dump({
        'package': BUNDLE, 'format_version': 1, 'license': 'AGPL-3.0-only',
        'source': 'Current local working-tree snapshot, including uncommitted local modifications',
        'upstream_repository': 'https://github.com/graydeon/dot-panel',
        'upstream_baseline_commit': UPSTREAM_COMMIT,
        'baseline_scope': 'Historical plugin baseline only; not the identity of this local snapshot',
        'source_manifest_sha256': digest(payload[f'{SOURCE_DIR}/SOURCE_MANIFEST.json']),
        'dependencies': 'Not bundled; install exact package-lock.json with npm ci, then npm run build',
        'distribution_scope': 'Private local review/install; source retains owner-specific project labels',
        'desktop_scope': 'Linux X11; advertised 16:10 mode best effort; verified 1280x800 on the original host',
        'autostart_scope': 'Standard per-user XDG login entry; original managed host consumption unverified',
        'viewer_reconnect': 'No viewer reconnect hook; no universal reconnect/open guarantee',
        'publication': 'No upload, release publication, deployment or plugin installation performed',
        'exclusions': EXCLUSIONS,
    })
    payload['PACKAGE_CONTENTS.json'] = dump({'files': [
        {'path': name, 'sha256': digest(data), 'mode': format(mode(name, data), '04o')}
        for name, data in sorted(payload.items())
    ]})
    return payload


def build(output, root=ROOT, launcher=None):
    output, root = output.resolve(), root.resolve()
    require(not output.is_relative_to(root), 'Write the archive outside the source checkout')
    payload = collect(root, launcher or root.parent / 'start.sh')
    output.mkdir(parents=True, exist_ok=True)
    path = output / (BUNDLE + '.zip')
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_STORED) as archive:
        # Stored (uncompressed) entries avoid compressor-version differences as well as mtimes.
        for name, data in sorted(payload.items()):
            item = zipfile.ZipInfo(BUNDLE + '/' + name, (1980, 1, 1, 0, 0, 0))
            item.create_system = 3
            item.external_attr = (stat.S_IFREG | mode(name, data)) << 16
            archive.writestr(item, data)
    return path


def validate(path, extract=None):
    payload, modes = {}, {}
    with zipfile.ZipFile(path) as archive:
        require(len(archive.infolist()) <= 1000, 'Unexpected archive entry count')
        require(sum(item.file_size for item in archive.infolist()) <= 32 * 1024 * 1024,
                'Unexpected archive size')
        require(archive.testzip() is None, 'Corrupt ZIP')
        for item in archive.infolist():
            safe_path(item.filename)
            require(item.filename.startswith(BUNDLE + '/'), 'Unexpected archive root')
            name = item.filename[len(BUNDLE) + 1:]
            require(name not in payload, 'Duplicate archive entry')
            require(stat.S_IFMT(item.external_attr >> 16) == stat.S_IFREG, 'Non-regular archive entry')
            require(item.file_size < 8_000_000, 'Unexpected large file')
            if name.startswith(SOURCE_DIR + '/'):
                source = name[len(SOURCE_DIR) + 1:]
                require(source == 'SOURCE_MANIFEST.json' or selected(source), f'Unapproved source path: {name}')
            else:
                require(name in {'start.sh', 'INSTALL.md', 'PROVENANCE.json', 'PACKAGE_CONTENTS.json'},
                        f'Unexpected top-level file: {name}')
            payload[name] = archive.read(item)
            scan(name, payload[name])
            modes[name] = stat.S_IMODE(item.external_attr >> 16)
            require(modes[name] == mode(name, payload[name]), f'Unexpected archive mode: {name}')
    for name in ROOT_FILES | {'local/desktop-start.py', 'local/install-desktop.sh',
                             'local/server.mjs', 'local/events.mjs', 'local/emit.mjs',
                             'local/report.mjs', 'local/reporting.mjs', 'local/REPORTING.md',
                             'lib/task-reporting.mjs', 'lib/task-reporting.d.mts',
                             'lib/project-identity.mjs', 'lib/project-identity.d.mts',
                             'src/TaskWindow.tsx', 'src/task-window.css', 'src/project-model.ts',
                             'worker/index.ts', 'worker/sites.ts', 'worker/auth.ts',
                             'scripts/package-local.py', 'SOURCE_MANIFEST.json'}:
        require(f'{SOURCE_DIR}/{name}' in payload, f'Missing required source: {name}')
    contents = json.loads(payload['PACKAGE_CONTENTS.json'])['files']
    require(len(contents) == len(payload) - 1 and {row['path'] for row in contents} ==
            set(payload) - {'PACKAGE_CONTENTS.json'}, 'Incomplete package manifest')
    for row in contents:
        require(digest(payload[row['path']]) == row['sha256'], f'Package hash mismatch: {row["path"]}')
        require(format(modes[row['path']], '04o') == row['mode'], f'Mode mismatch: {row["path"]}')
    source_manifest = json.loads(payload[f'{SOURCE_DIR}/SOURCE_MANIFEST.json'])
    source_rows = source_manifest['files']
    expected = {name[len(SOURCE_DIR) + 1:] for name in payload if name.startswith(SOURCE_DIR + '/')}
    expected.remove('SOURCE_MANIFEST.json')
    require(len(source_rows) == len(expected) and {row['path'] for row in source_rows} == expected,
            'Incomplete source manifest')
    for row in source_rows:
        require(digest(payload[f'{SOURCE_DIR}/{row["path"]}']) == row['sha256'], f'Source hash mismatch: {row["path"]}')
    provenance = json.loads(payload['PROVENANCE.json'])
    require(provenance['license'] == source_manifest['license'] == 'AGPL-3.0-only', 'Incorrect license')
    require(provenance['source_manifest_sha256'] == digest(payload[f'{SOURCE_DIR}/SOURCE_MANIFEST.json']),
            'Source provenance mismatch')
    require(b'GNU AFFERO GENERAL PUBLIC LICENSE' in payload[f'{SOURCE_DIR}/LICENSE'], 'Missing AGPL license')
    require(payload['INSTALL.md'] == payload[f'{SOURCE_DIR}/packaging/LOCAL-INSTALL.md'], 'Install instructions differ')
    if extract:
        extract = extract.resolve()
        require(not extract.exists(), 'Extract only into a new directory')
        extract.mkdir(parents=True)
        for name, data in payload.items():
            target = extract / BUNDLE / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            os.chmod(target, modes[name])
    return {'archive': str(path), 'sha256': digest(path.read_bytes()), 'bytes': path.stat().st_size,
            'files': len(payload), 'source_only': True, 'exclusions': EXCLUSIONS,
            'checks': ['safe regular unique paths', 'current-source and package hashes', 'AGPL attribution',
                       'private identifier/credential pattern scan', 'no runtime state or generated QA HTML'],
            'limits': 'Content hashes are integrity checks, not a signature or comprehensive secret audit. '
                      'Source tests, dependency installation and host autostart require separate verification.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--output', type=Path)
    action.add_argument('--validate', type=Path)
    parser.add_argument('--source', type=Path, default=ROOT)
    parser.add_argument('--launcher', type=Path)
    parser.add_argument('--extract', type=Path)
    args = parser.parse_args()
    path = args.validate or build(args.output, args.source, args.launcher)
    print(json.dumps(validate(path, args.extract), indent=2))


if __name__ == '__main__':
    main()
