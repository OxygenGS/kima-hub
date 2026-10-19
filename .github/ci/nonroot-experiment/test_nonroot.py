import importlib.util
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('nonroot', Path(__file__).with_name('nonroot.py'))
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

class GuardTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)

    def test_missing_directory_is_allowed(self):
        self.assertEqual(n.tree_paths(self.root / 'new'), [self.root / 'new'])

    def test_plain_cache_is_allowed(self):
        (self.root / 'file').write_text('cache')
        self.assertEqual(len(n.tree_paths(self.root)), 2)

    def test_symlink_file_rejected(self):
        (self.root / 'link').symlink_to('/etc/passwd')
        with self.assertRaises(RuntimeError): n.tree_paths(self.root)

    def test_symlink_parent_rejected(self):
        (self.root / 'link').symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(RuntimeError): n.check_path(self.root / 'link' / 'new')

    def test_dangling_symlink_rejected(self):
        (self.root / 'link').symlink_to(self.root / 'absent')
        with self.assertRaises(RuntimeError): n.tree_paths(self.root)

    def test_hardlink_rejected(self):
        (self.root / 'file').write_text('cache')
        os.link(self.root / 'file', self.root / 'other')
        with self.assertRaises(RuntimeError): n.tree_paths(self.root)

    def test_fifo_rejected(self):
        os.mkfifo(self.root / 'fifo')
        with self.assertRaises(RuntimeError): n.tree_paths(self.root)

    def test_regular_file_cannot_be_cache_root(self):
        (self.root / 'file').write_text('cache')
        with self.assertRaises(RuntimeError): n.tree_paths(self.root / 'file')

    def test_patch_once(self):
        p = self.root / 'start.sh'
        p.write_text('echo "Starting Kima..."\nexec supervisor\n')
        with patch.object(n, 'Path', lambda _: p): n.patch_start()
        self.assertEqual(p.read_text().count(n.HOOK), 1)
        with patch.object(n, 'Path', lambda _: p):
            with self.assertRaises(RuntimeError): n.patch_start()

    def test_wrong_startup_rejected(self):
        p = self.root / 'start.sh'
        for value in ('unknown', 'echo "Starting Kima..."\n' * 2):
            p.write_text(value)
            with patch.object(n, 'Path', lambda _: p):
                with self.assertRaises(RuntimeError): n.patch_start()
            self.assertEqual(p.read_text(), value)

    def test_denied_music_stops_before_cache_changes(self):
        with patch.object(n.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'test')):
            with patch.object(n, 'tree_paths') as tree:
                with self.assertRaises(subprocess.CalledProcessError): n.configure()
                tree.assert_not_called()

    def test_explicit_opt_in_required(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError): n.main()

if __name__ == '__main__': unittest.main()
