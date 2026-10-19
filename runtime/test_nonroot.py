import importlib.util
from pathlib import Path
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('nonroot', Path(__file__).with_name('nonroot_services.py'))
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


    def test_denied_music_stops_before_cache_changes(self):
        with patch.object(n.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'test')):
            with patch.object(n, 'tree_paths') as tree:
                with self.assertRaises(subprocess.CalledProcessError): n.configure()
                tree.assert_not_called()

    def test_requires_root(self):
        with patch.object(n.os, 'geteuid', return_value=1000):
            with self.assertRaises(RuntimeError): n.main()

    def test_exact_service_identities(self):
        self.assertEqual(set(n.USERS), {'backend', 'audio-analyzer', 'audio-analyzer-clap'})
        self.assertNotEqual(n.USERS['backend'], n.USERS['audio-analyzer'])
        self.assertEqual(n.USERS['audio-analyzer'], n.USERS['audio-analyzer-clap'])

if __name__ == '__main__': unittest.main()
