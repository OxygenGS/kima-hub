import copy
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('recovery_prepare', Path(__file__).with_name('prepare.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'data'
        self.root.mkdir()
        (self.root / 'nested').mkdir()
        (self.root / 'nested' / 'value').write_bytes(b'synthetic snapshot')
        self.original = m.manifest(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_identical(self):
        self.assertEqual(m.check_manifest(self.root, self.original), 3)

    def test_bytes_changed(self):
        (self.root / 'nested' / 'value').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            m.check_manifest(self.root, self.original)

    def test_added_file(self):
        (self.root / 'extra').touch()
        with self.assertRaises(ValueError):
            m.check_manifest(self.root, self.original)

    def test_missing_file(self):
        (self.root / 'nested' / 'value').unlink()
        with self.assertRaises(ValueError):
            m.check_manifest(self.root, self.original)

    def test_mode_changed(self):
        (self.root / 'nested' / 'value').chmod(0o400)
        with self.assertRaises(ValueError):
            m.check_manifest(self.root, self.original)

    def test_wrong_owner_manifest(self):
        changed = copy.deepcopy(self.original)
        changed['entries']['nested/value']['uid'] += 1
        with self.assertRaises(ValueError):
            m.check_manifest(self.root, changed)

    def test_symlink_not_followed(self):
        (self.root / 'link').symlink_to('/path-that-does-not-exist')
        result = m.manifest(self.root)['entries']['link']
        self.assertEqual(result['kind'], 'symlink')
        self.assertEqual(result['target'], '/path-that-does-not-exist')

    def test_hardlink_preserved_in_fingerprint(self):
        os.link(self.root / 'nested' / 'value', self.root / 'hardlink')
        self.assertEqual(m.manifest(self.root)['entries']['hardlink']['links'], 2)

    def test_special_file_rejected(self):
        os.mkfifo(self.root / 'pipe')
        with self.assertRaises(ValueError):
            m.manifest(self.root)

    def test_symlink_root_rejected(self):
        link = Path(self.tmp.name) / 'root-link'
        link.symlink_to(self.root)
        with self.assertRaises(ValueError):
            m.manifest(link)

    def test_missing_anchor(self):
        with self.assertRaises(ValueError):
            m.replace_one('a', 'b', 'c')

    def test_duplicate_anchor(self):
        with self.assertRaises(ValueError):
            m.replace_one('a a', 'a', 'c')

    def test_one_anchor(self):
        self.assertEqual(m.replace_one('a b', 'b', 'c'), 'a c')

    def test_prepare_rejects_unknown_source(self):
        with self.assertRaises(ValueError):
            m.prepare('production', 'amd64', Path(self.tmp.name) / 'out')

    def test_prepare_rejects_unsupported_upstream_arm(self):
        with self.assertRaises(ValueError):
            m.prepare('upstream-v110', 'arm64', Path(self.tmp.name) / 'out')

    def test_prepare_rejects_modified_rehearsal(self):
        with patch.object(Path, 'read_bytes', return_value=b'changed source'):
            with self.assertRaisesRegex(ValueError, 'Existing rehearsal changed'):
                m.prepare('rc3', 'amd64', Path(self.tmp.name) / 'out')


if __name__ == '__main__':
    unittest.main()
