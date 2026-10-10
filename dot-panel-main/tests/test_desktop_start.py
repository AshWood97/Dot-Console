import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('desktop_start', ROOT / 'local/desktop-start.py')
start = importlib.util.module_from_spec(spec)
spec.loader.exec_module(start)

XRANDR = '''Screen 0: current 1280 x 800
DUMMY0 connected 1280x800+0+0
   1364x1024_60.00 60.01 +
   1280x1024 60.00
   1280x800 59.81*
   1600x1000 60.00
DUMMY1 disconnected
'''


class StartupTests(unittest.TestCase):
    def test_advertised_modes_and_actual_mode(self):
        self.assertEqual(start.parse_outputs(XRANDR), [{'name': 'DUMMY0', 'primary': False, 'current': '1280x800', 'modes': ['1280x1024', '1280x800', '1600x1000']}])

    def test_prefer_1280(self):
        self.assertEqual(start.choose_mode({'modes': ['1600x1000', '1280x800'], 'current': '1600x1000'}), '1280x800')

    def test_keep_supported_current_fallback(self):
        self.assertEqual(start.choose_mode({'modes': ['1440x900', '1600x1000'], 'current': '1600x1000'}), '1600x1000')

    def test_no_custom_mode(self):
        self.assertIsNone(start.choose_mode({'modes': ['1280x720'], 'current': '1280x720'}))

    def test_nearest_fallback(self):
        self.assertEqual(start.choose_mode({'modes': ['1920x1200', '1440x900'], 'current': None}), '1440x900')

    @patch.dict(os.environ, {}, clear=True)
    @patch.object(start.subprocess, 'run')
    def test_headless_does_not_touch_display(self, run):
        self.assertFalse(start.display_defaults())
        run.assert_not_called()

    @patch.dict(os.environ, {'DISPLAY': ':0'})
    @patch.object(start.shutil, 'which', return_value='/usr/bin/xrandr')
    @patch.object(start.subprocess, 'check_output', return_value=XRANDR)
    @patch.object(start.subprocess, 'run')
    def test_idempotent_display(self, run, query, which):
        self.assertTrue(start.display_defaults())
        run.assert_not_called()
        self.assertEqual(query.call_count, 2)

    @patch.dict(os.environ, {'DISPLAY': ':0'})
    @patch.object(start.shutil, 'which', return_value='/usr/bin/xrandr')
    @patch.object(start.subprocess, 'check_output', return_value=XRANDR.replace('59.81*', '59.81'))
    @patch.object(start.subprocess, 'run')
    def test_failed_mode_verification_is_not_success(self, run, query, which):
        self.assertFalse(start.display_defaults())
        self.assertEqual(run.call_args.args[0], ['xrandr', '--output', 'DUMMY0', '--mode', '1280x800'])

    @patch.dict(os.environ, {'DISPLAY': ':0'})
    @patch.object(start.shutil, 'which', return_value='/usr/bin/xdg-open')
    @patch.object(start, 'healthy', return_value=True)
    @patch.object(start.subprocess, 'Popen')
    @patch.object(start.subprocess, 'run')
    def test_repeat_open_suppressed_but_explicit_restore_works(self, run, popen, health, which):
        with tempfile.TemporaryDirectory() as directory, patch.object(start, 'state_directory', return_value=Path(directory)):
            with patch('sys.argv', ['start', '--no-display']):
                self.assertEqual(start.main(), 0)
                self.assertEqual(start.main(), 0)
            self.assertEqual(run.call_count, 1)
            with patch('sys.argv', ['start', '--no-display', '--open']):
                self.assertEqual(start.main(), 0)
            self.assertEqual(run.call_count, 2)
            popen.assert_not_called()

    @patch.object(start, 'healthy', return_value=False)
    @patch.object(start.socket, 'create_connection')
    @patch.object(start.subprocess, 'Popen')
    def test_unhealthy_occupied_port_does_not_spawn(self, popen, connection, health):
        with tempfile.TemporaryDirectory() as directory, patch.object(start, 'state_directory', return_value=Path(directory)), patch('sys.argv', ['start', '--no-display', '--no-open']):
            self.assertEqual(start.main(), 1)
            popen.assert_not_called()

    def test_installer_needs_desktop_and_explicit_enable(self):
        result = subprocess.run(['bash', str(ROOT / 'local/install-desktop.sh'), '--enable'], env={**os.environ, 'DISPLAY': ''}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('intended Linux cloud desktop', result.stdout)

    def test_disable_is_reversible_and_preserves_unmanaged_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            entry = Path(directory) / 'autostart/dot-console.desktop'
            entry.parent.mkdir()
            entry.write_text('[Desktop Entry]\nHidden=false\nX-Dot-Console-Managed=true\n')
            env = {**os.environ, 'XDG_CONFIG_HOME': directory}
            subprocess.run(['bash', str(ROOT / 'local/install-desktop.sh'), '--disable'], env=env, check=True, capture_output=True)
            self.assertIn('Hidden=true', entry.read_text())
            entry.write_text('[Desktop Entry]\nHidden=false\n')
            subprocess.run(['bash', str(ROOT / 'local/install-desktop.sh'), '--disable'], env=env, check=True, capture_output=True)
            self.assertIn('Hidden=false', entry.read_text())


if __name__ == '__main__':
    unittest.main()
