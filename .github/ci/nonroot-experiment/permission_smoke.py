#!/usr/bin/env python3
"""Actual-UID GPU IPC tests in a disposable overlay, no GPU/download/network."""
import importlib.util
import os
from pathlib import Path
import pwd
import stat
import subprocess

if os.geteuid() != 0 or os.environ.get('KIMA_NONROOT_EXPERIMENT') != '1':
    raise RuntimeError('Only the explicitly marked disposable image is supported')
spec = importlib.util.spec_from_file_location('nonroot', '/app/nonroot-experiment.py')
n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(n)


def run_as(user, code):
    subprocess.run(['gosu', user, 'python3', '-c', code], check=True)


def exchange():
    # Node uses write-temp + rename. Repeat to prove existing file replacement.
    run_as('kimabackend', '''
import json, os
from pathlib import Path
os.umask(0o027)
p = Path('/data/gpu-onnx/enabled.json')
for i in range(2):
    tmp = p.with_name(p.name + '.tmp')
    tmp.write_text(json.dumps({'enabled': False, 'soundVectors': False, 'analysis': False}))
    tmp.replace(p)
''')
    # Use the real analyzer implementation, not a test reimplementation.
    run_as('kimaaudio', '''
import os, sys
os.umask(0o027)
sys.path.insert(0, '/app/audio-analyzer-clap')
import gpu_runtime
assert gpu_runtime.read_enabled() is False
for i in range(2):
    gpu_runtime.update_state(status='idle', detail='CI permission exchange')
''')
    run_as('kimabackend', '''
import json
from pathlib import Path
assert json.loads(Path('/data/gpu-onnx/state.json').read_text())['status'] == 'idle'
''')
    for user, target in (('kimabackend', 'state.json'), ('kimaaudio', 'enabled.json')):
        run_as(user, f'''
from pathlib import Path
p = Path('/data/gpu-onnx/{target}')
for operation in (lambda: p.open('w'), lambda: p.unlink()):
    try:
        operation()
    except PermissionError:
        pass
    else:
        raise AssertionError('Unexpected permission to modify another service file')
''')


n.configure()
exchange()
run_as('kimaaudio', '''
import os
from pathlib import Path
os.umask(0o027)
p = Path('/data/gpu-onnx/site/bin/ci-tool')
p.parent.mkdir(parents=True)
p.write_text('#!/bin/sh\\nexit 0\\n')
p.chmod(0o750)
''')
n.configure()  # Existing state and executable data survive ownership preparation.
exchange()
root = Path('/data/gpu-onnx').stat()
assert root.st_uid == 0 and stat.S_IMODE(root.st_mode) == 0o3770
assert Path('/data/gpu-onnx/enabled.json').stat().st_uid == pwd.getpwnam('kimabackend').pw_uid
assert Path('/data/gpu-onnx/state.json').stat().st_uid == pwd.getpwnam('kimaaudio').pw_uid
run_as('kimaaudio', "import os; assert os.access('/data/gpu-onnx/site/bin/ci-tool', os.X_OK)")
print('Two-UID GPU IPC: atomic rewrite, reciprocal reads, denied cross-file writes/unlinks, restart preparation and executable preservation: PASS')
print('No CUDA runtime installed or GPU inference tested by this check')
