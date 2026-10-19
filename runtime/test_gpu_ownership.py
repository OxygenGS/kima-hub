import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('nonroot', Path(__file__).with_name('nonroot_services.py'))
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)

class GpuOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.backend = SimpleNamespace(pw_uid=1101, pw_gid=1101)
        self.audio = SimpleNamespace(pw_uid=1102, pw_gid=1102)
        self.shared = 1103
        patcher = patch.object(n, 'GPU_ROOT', self.root)
        patcher.start()
        self.addCleanup(patcher.stop)

    def policy(self, name, directory=False, mode=0o644):
        p = self.root / name
        if directory:
            p.mkdir()
        else:
            p.write_text('fixture')
            p.chmod(mode)
        return n.ownership(str(self.root), p, self.backend, self.audio, self.shared)

    def test_gpu_root_is_root_owned_sticky_setgid(self):
        self.assertEqual(n.ownership(str(self.root), self.root, self.backend, self.audio, self.shared),
                         (0, self.shared, 0o3770))

    def test_backend_controls_its_projection(self):
        self.assertEqual(self.policy('enabled.json'), (1101, self.shared, 0o640))
        self.assertEqual(self.policy('enabled.json.tmp'), (1101, self.shared, 0o640))

    def test_audio_controls_state(self):
        self.assertEqual(self.policy('state.json'), (1102, self.shared, 0o640))

    def test_gpu_subdirectories_are_audio_owned_setgid(self):
        self.assertEqual(self.policy('site', directory=True), (1102, self.shared, 0o2750))

    def test_owner_execute_retained_without_special_bits(self):
        self.assertEqual(self.policy('runtime-tool', mode=0o6755), (1102, self.shared, 0o740))

    def test_projection_directory_rejected(self):
        with self.assertRaises(RuntimeError): self.policy('enabled.json', directory=True)

    def test_non_gpu_cache_remains_private_to_backend(self):
        p = self.root / 'cache'
        p.mkdir()
        self.assertEqual(n.ownership('/data/cache', p, self.backend, self.audio, self.shared),
                         (1101, 1101, 0o750))

if __name__ == '__main__': unittest.main()
