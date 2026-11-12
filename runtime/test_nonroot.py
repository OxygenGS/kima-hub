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


    def test_new_soulseek_import_only_chowns_new_leaf(self):
        music = self.root / 'music'
        music.mkdir()
        with patch.object(n.os, 'chown') as change_owner:
            result = n.prepare_soulseek_import(music, 1201, 1202)
        leaf = music / 'Singles' / 'Kima Downloads'
        self.assertEqual(result, leaf)
        self.assertTrue(leaf.is_dir())
        change_owner.assert_called_once_with(leaf, 1201, 1202, follow_symlinks=False)
        self.assertNotIn(music, [call.args[0] for call in change_owner.call_args_list])

    def test_existing_soulseek_import_is_not_reowned(self):
        leaf = self.root / 'Singles' / 'Kima Downloads'
        leaf.mkdir(parents=True)
        owner = leaf.stat().st_uid
        with patch.object(n.os, 'chown') as change_owner:
            self.assertEqual(n.prepare_soulseek_import(self.root, owner, 1202), leaf)
        change_owner.assert_not_called()

    def test_existing_foreign_soulseek_import_is_left_unchanged(self):
        leaf = self.root / 'Singles' / 'Kima Downloads'
        leaf.mkdir(parents=True)
        old_mode = leaf.stat().st_mode
        with patch.object(n.os, 'chown') as change_owner:
            self.assertIsNone(n.prepare_soulseek_import(self.root, leaf.stat().st_uid + 1, 1202))
        change_owner.assert_not_called()
        self.assertEqual(leaf.stat().st_mode, old_mode)

    def test_soulseek_import_rejects_symlinked_parent(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (self.root / 'Singles').symlink_to(outside, target_is_directory=True)
        with patch.object(n.os, 'chown') as change_owner:
            self.assertIsNone(n.prepare_soulseek_import(self.root, 1201, 1202))
        change_owner.assert_not_called()
        self.assertFalse((outside / 'Kima Downloads').exists())

    def test_soulseek_import_read_only_mount_does_not_block_boot(self):
        with patch.object(n.Path, 'mkdir', side_effect=PermissionError('readonly host mount')):
            self.assertIsNone(n.prepare_soulseek_import(self.root, 1201, 1202))

    def test_requires_root(self):
        with patch.object(n.os, 'geteuid', return_value=1000):
            with self.assertRaises(RuntimeError): n.main()

    def test_exact_service_identities(self):
        self.assertEqual(set(n.USERS), {'backend', 'audio-analyzer', 'audio-analyzer-clap'})
        self.assertNotEqual(n.USERS['backend'], n.USERS['audio-analyzer'])
        self.assertEqual(n.USERS['audio-analyzer'], n.USERS['audio-analyzer-clap'])

if __name__ == '__main__': unittest.main()
