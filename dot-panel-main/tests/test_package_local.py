# SPDX-License-Identifier: AGPL-3.0-only
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_local', ROOT / 'scripts/package-local.py')
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)


class LocalPackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'fixture' / 'dot-panel-main'
        self.root.mkdir(parents=True)
        self.launcher = self.root.parent / 'start.sh'
        self.launcher.write_bytes((ROOT.parent / 'start.sh').read_bytes())
        names = package.ROOT_FILES | {
            'local/desktop-start.py', 'local/install-desktop.sh', 'local/server.mjs',
            'local/events.mjs', 'local/emit.mjs', 'local/DESKTOP-STARTUP.md',
            'src/TaskWindow.tsx', 'src/task-window.css', 'src/project-model.ts',
            'worker/index.ts', 'worker/sites.ts', 'worker/auth.ts',
            'packaging/LOCAL-INSTALL.md', 'scripts/package-local.py',
            'local/report.mjs', 'local/reporting.mjs', 'local/REPORTING.md',
            'lib/task-reporting.mjs', 'lib/task-reporting.d.mts',
            'lib/project-identity.mjs', 'lib/project-identity.d.mts',
        }
        for name in names:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('GNU AFFERO GENERAL PUBLIC LICENSE\n' if name == 'LICENSE' else '// synthetic source\n')

    def build(self, where='output'):
        return package.build(self.base / where, self.root, self.launcher)

    def test_current_modified_source_and_outer_launcher_are_included(self):
        (self.root / 'src/TaskWindow.tsx').write_text('Current local change\n')
        archive = self.build()
        result = package.validate(archive)
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(z.read(package.BUNDLE + '/dot-panel-main/src/TaskWindow.tsx'), b'Current local change\n')
            self.assertEqual(z.read(package.BUNDLE + '/start.sh'), self.launcher.read_bytes())
            self.assertIn(package.BUNDLE + '/dot-panel-main/local/install-desktop.sh', z.namelist())
        self.assertTrue(result['source_only'])

    def test_runtime_secrets_qa_and_old_manifest_are_excluded(self):
        unwanted = ['.env', '.env.local', '.dev.vars', 'task-events.jsonl',
                    '.wrangler/state/db.sqlite', 'node_modules/demo/index.ts',
                    'dist/index.html', 'dist/reading-qa.html', 'local/__pycache__/cache.pyc',
                    'tests/local/layout-fixtures.mjs', 'tests/local/reading-qa.mjs',
                    'tests/local/unified-qa.mjs', 'src/status.json', 'src/debug.log']
        for name in unwanted:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('EXCLUDED PRIVATE SENTINEL\n')
        (self.root / 'SOURCE_MANIFEST.json').write_text('{"checks": "stale upstream claims"}')
        payload = package.collect(self.root, self.launcher)
        self.assertFalse(any(b'EXCLUDED PRIVATE SENTINEL' in data for data in payload.values()))
        current = json.loads(payload['dot-panel-main/SOURCE_MANIFEST.json'])
        self.assertNotIn('checks', current)
        for name in unwanted:
            self.assertNotIn('dot-panel-main/' + name, payload)

    def test_exact_rebuild_ignores_source_mtime_and_permissions(self):
        first = self.build('first').read_bytes()
        path = self.root / 'src/TaskWindow.tsx'
        os.utime(path, (1700000000, 1700000000))
        path.chmod(0o600)
        self.assertEqual(first, self.build('second').read_bytes())

    def test_extracted_bundle_rebuilds_identically(self):
        original = self.build()
        target = self.base / 'extracted'
        package.validate(original, target)
        extracted = target / package.BUNDLE
        rebuilt = package.build(self.base / 'rebuilt', extracted / 'dot-panel-main', extracted / 'start.sh')
        self.assertEqual(original.read_bytes(), rebuilt.read_bytes())
        self.assertEqual(stat.S_IMODE((extracted / 'start.sh').stat().st_mode), 0o755)

    def test_source_and_package_manifests_cover_current_files(self):
        payload = package.collect(self.root, self.launcher)
        source = json.loads(payload['dot-panel-main/SOURCE_MANIFEST.json'])
        rows = {row['path']: row for row in source['files']}
        self.assertEqual(rows['src/TaskWindow.tsx']['sha256'], package.digest(b'// synthetic source\n'))
        self.assertIn('local/desktop-start.py', rows)
        self.assertIn('local/install-desktop.sh', rows)
        self.assertEqual(package.validate(self.build())['files'], len(payload))

    def test_reject_symlink_source(self):
        (self.root / 'src/linked.ts').symlink_to(self.root / 'src/TaskWindow.tsx')
        with self.assertRaisesRegex(ValueError, 'Non-regular'):
            self.build()

    def test_missing_startup_file_is_an_error(self):
        (self.root / 'local/desktop-start.py').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required source'):
            self.build()

    def test_backend_source_is_required_and_included(self):
        payload = package.collect(self.root, self.launcher)
        self.assertIn('dot-panel-main/worker/index.ts', payload)
        self.assertIn('dot-panel-main/worker/sites.ts', payload)
        self.assertIn('dot-panel-main/worker/auth.ts', payload)
        (self.root / 'worker/index.ts').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required source'):
            self.build()

    def test_secret_pattern_in_selected_source_fails_closed(self):
        (self.root / 'src/secret.ts').write_bytes(b'const key = "' + b'sk-' + b'a' * 30 + b'";')
        with self.assertRaisesRegex(ValueError, 'Private identifier/credential pattern'):
            self.build()

    def test_unsafe_archive_paths_are_rejected(self):
        for name in ['../escape', '/absolute', 'a/../escape', 'a\\escape', 'a:escape',
                     'node_modules/a.ts', '.env.local']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                package.safe_path(name)

    def test_tampered_payload_is_rejected(self):
        original = self.build()
        target = self.base / 'tampered.zip'
        with zipfile.ZipFile(original) as src, zipfile.ZipFile(target, 'w') as dst:
            for item in src.infolist():
                data = src.read(item)
                if item.filename.endswith('/src/TaskWindow.tsx'):
                    data += b'// tampered\n'
                dst.writestr(item, data)
        with self.assertRaisesRegex(ValueError, 'hash mismatch'):
            package.validate(target)

    def test_extraction_never_overwrites_an_existing_folder(self):
        target = self.base / 'exists'
        target.mkdir()
        with self.assertRaisesRegex(ValueError, 'new directory'):
            package.validate(self.build(), target)

    def test_output_cannot_be_inside_source(self):
        with self.assertRaisesRegex(ValueError, 'outside the source'):
            package.build(self.root / 'output', self.root, self.launcher)

    def test_outer_launcher_resolves_a_moved_folder_with_spaces(self):
        moved = self.base / 'moved bundle with spaces'
        (moved / 'dot-panel-main' / 'local').mkdir(parents=True)
        (moved / 'start.sh').write_bytes(self.launcher.read_bytes())
        bindir = self.base / 'bin'
        bindir.mkdir()
        output = self.base / 'arguments.txt'
        stub = bindir / 'python3'
        stub.write_text('#!/bin/sh\nprintf "%s\\n" "$@" > "$CAPTURE_ARGS"\n')
        stub.chmod(0o755)
        env = {**os.environ, 'PATH': str(bindir) + ':' + os.environ['PATH'], 'CAPTURE_ARGS': str(output)}
        subprocess.run(['bash', str(moved / 'start.sh'), '--no-display', '--no-open'],
                       cwd=self.base, env=env, check=True)
        self.assertEqual(output.read_text().splitlines(), [str(moved / 'dot-panel-main/local/desktop-start.py'),
                                                         '--no-display', '--no-open'])


if __name__ == '__main__':
    unittest.main()
