#!/usr/bin/env python3
"""AIO supervised-service privilege separation. Bootstrap and Supervisor retain root.\n\nOnly deploy to inspected, exclusively mounted volumes; no concurrent hostile writer\nmay change filesystem entries during startup ownership preparation.\n"""
import configparser
import ctypes
import grp
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys

CONF = Path('/etc/supervisor/conf.d/kima.conf')
USERS = {'backend': 'kimabackend', 'audio-analyzer': 'kimaaudio', 'audio-analyzer-clap': 'kimaaudio'}
CACHES = ('/data/cache', '/app/backend/cache', '/app/backend/logs', '/data/gpu-onnx')
GPU_ROOT = Path('/data/gpu-onnx')
GPU_CONTROL = {'enabled.json', 'enabled.json.tmp'}
SHARED_GROUP = 'kimaruntime'


def check_path(path):
    """Reject links/special files; not an atomic hostile-volume defense."""
    path = Path(path)
    for parent in (*reversed(path.parents), path):
        if parent.is_symlink():
            raise RuntimeError(f'Refusing symlink: {parent}')
    if path.exists():
        mode = path.stat()
        if not (stat.S_ISDIR(mode.st_mode) or stat.S_ISREG(mode.st_mode)):
            raise RuntimeError(f'Refusing special file: {path}')
        if stat.S_ISREG(mode.st_mode) and mode.st_nlink != 1:
            raise RuntimeError(f'Refusing multiply-linked file: {path}')


def tree_paths(root):
    check_path(root)
    paths = [Path(root)]
    if Path(root).exists():
        if not Path(root).is_dir():
            raise RuntimeError(f'Expected cache directory: {root}')
        for base, dirs, files in os.walk(root, followlinks=False):
            for name in dirs + files:
                p = Path(base) / name
                check_path(p)
                paths.append(p)
    return paths


def ownership(root, path, backend, audio, shared_gid):
    """GPU IPC is shared, but backend controls and audio state stay distinct."""
    if Path(root) != GPU_ROOT:
        return backend.pw_uid, backend.pw_gid, 0o750 if path.is_dir() else 0o640
    if path == GPU_ROOT:
        # Root ownership + sticky bit prevents either service replacing the
        # other's existing entry; setgid makes new entries group-readable.
        return 0, shared_gid, 0o3770
    first = path.relative_to(GPU_ROOT).parts[0]
    owner = backend if first in GPU_CONTROL else audio
    if first in GPU_CONTROL and not path.is_file():
        raise RuntimeError('GPU control must be a regular file')
    mode = 0o2750 if path.is_dir() else 0o640 | (path.stat().st_mode & 0o100)
    return owner.pw_uid, shared_gid, mode



def prepare_soulseek_import(music_root, backend_uid, backend_gid):
    """Prepare ONLY a dedicated Soulseek leaf; never chown an existing music tree.

    An existing leaf owned by someone else is deliberately not taken over.
    A read-only/unmapped host bind mount is warned about, not a startup failure.
    """
    root = Path(music_root)
    singles = root / 'Singles'
    target = singles / 'Kima Downloads'
    try:
        for parent in (root, singles, target):
            check_path(parent)
            if parent.exists() and not parent.is_dir():
                raise RuntimeError('Expected directory: ' + str(parent))
        if not singles.exists():
            singles.mkdir(mode=0o755)
            singles.chmod(0o755)  # Only a newly created parent.
        if target.exists():
            # No existing folder owner, content or permissions are modified.
            if target.stat().st_uid != backend_uid:
                print('WARNING: Existing Soulseek import folder is not owned by the backend; '
                      'grant that folder writable access explicitly, without changing /music recursively')
                return None
            return target

        target.mkdir(mode=0o755)
        try:
            os.chown(target, backend_uid, backend_gid, follow_symlinks=False)
            os.chmod(target, 0o755)
        except OSError:
            # Never leave behind a root-owned empty target that blocks subsequent
            # attempts when a mapped/readonly bind mount rejects chown.
            target.rmdir()
            raise
        return target
    except (OSError, RuntimeError) as exc:
        print('WARNING: Soulseek import folder could not be prepared; downloads will '
              'require explicit write permissions on /music/Singles/Kima Downloads: '
              + str(exc))
        return None

def configure():
    # Only independently prepared, exclusively mounted volumes are supported.
    # Only the dedicated Soulseek import leaf may be created under /music.
    # Existing music files, parents, secrets, database and models are never chowned.
    for user in sorted(set(USERS.values())):
        for path in ('/music', '/app/models', '/app/audio-analyzer', '/app/audio-analyzer-clap'):
            for flag in ('-r', '-x'):
                subprocess.run(['gosu', user, 'test', flag, path], check=True)
    inventory = {root: tree_paths(root) for root in CACHES}
    parser = configparser.RawConfigParser()
    parser.read(CONF)
    for service in USERS:
        section = 'program:' + service
        if not parser.has_section(section):
            raise RuntimeError('Missing supervised service: ' + service)
        parser.set(section, 'command', '/usr/bin/python3 /app/nonroot-services.py launch ' + service)
    backend = pwd.getpwnam('kimabackend')
    audio = pwd.getpwnam('kimaaudio')
    shared_gid = grp.getgrnam(SHARED_GROUP).gr_gid
    if shared_gid == 0 or 0 in (backend.pw_uid, backend.pw_gid, audio.pw_uid, audio.pw_gid):
        raise RuntimeError('Refusing root service identities/groups')
    import_dir = prepare_soulseek_import('/music', backend.pw_uid, backend.pw_gid)
    if import_dir is not None:
        if subprocess.run(['gosu', 'kimabackend', 'test', '-w', str(import_dir)], check=False).returncode != 0:
            print('WARNING: Soulseek import folder is not writable by the non-root backend; '
                  'check host bind-mount permissions')
    for root, paths in inventory.items():
        Path(root).mkdir(parents=True, exist_ok=True)
        for path in paths:
            check_path(path)
            uid, gid, mode = ownership(root, path, backend, audio, shared_gid)
            os.chown(path, uid, gid, follow_symlinks=False)
            os.chmod(path, mode)
    with CONF.open('w') as handle:
        parser.write(handle)
    print('AIO service identities: nonroot backend/audio, limited shared GPU IPC; only dedicated Soulseek import may be writable')


def launch(service):
    if service not in USERS:
        raise RuntimeError('Unknown service')
    subprocess.run(['/app/wait-for-db.sh', '120'], check=True)
    env = dict(os.environ)
    if service == 'backend':
        # Parse the root-generated env as data, never shell-source it. Backend
        # needs these credentials in memory, not filesystem access to secrets.
        for line in Path('/app/backend/.env').read_text().splitlines():
            if not line or line.startswith('#'):
                continue
            key, value = line.split('=', 1)
            if not key.replace('_', '').isalnum():
                raise RuntimeError('Unexpected environment key')
            env[key] = value
        directory = '/app/backend'
        command = ['/usr/local/bin/node', 'dist/index.js']
    else:
        for key in ('SESSION_SECRET', 'SETTINGS_ENCRYPTION_KEY', 'ADMIN_RESET_PASSWORD', 'DB_PASSWORD'):
            env.pop(key, None)
        directory = '/app/' + service
        env['KIMA_GPU_FOR'] = 'analysis' if service == 'audio-analyzer' else 'soundVectors'
        command = ['/app/audio-analyzer-clap/gpu_env.sh', 'python3', 'analyzer.py']
    env.pop('DB_PASSWORD', None)
    account = pwd.getpwnam(USERS[service])
    shared_gid = grp.getgrnam(SHARED_GROUP).gr_gid
    if 0 in (account.pw_uid, account.pw_gid, shared_gid):
        raise RuntimeError('Refusing privileged service account/group')
    env.update(HOME=account.pw_dir, USER=account.pw_name, LOGNAME=account.pw_name,
               NUMBA_CACHE_DIR=account.pw_dir + '/.cache/numba',
               PYTHONDONTWRITEBYTECODE='1')
    os.chdir(directory)
    os.setgroups([shared_gid])
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.restype = ctypes.c_int
    libc.prctl.argtypes = [ctypes.c_int] + [ctypes.c_ulong] * 4
    if libc.prctl(38, 1, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), 'PR_SET_NO_NEW_PRIVS failed')
    os.umask(0o027)
    os.execvpe(command[0], command, env)


def audit():
    shared_gid = grp.getgrnam(SHARED_GROUP).gr_gid
    for service, user in USERS.items():
        pid = subprocess.check_output(['supervisorctl', '-c', '/etc/supervisor/supervisord.conf', 'pid', service], text=True).strip()
        if not pid.isdecimal() or int(pid) <= 1:
            raise RuntimeError('Service absent: ' + service)
        status = dict(line.split(':', 1) for line in Path('/proc/' + pid + '/status').read_text().splitlines())
        account = pwd.getpwnam(user)
        assert account.pw_uid != 0 and set(map(int, status['Uid'].split())) == {account.pw_uid}, service
        assert set(map(int, status['Gid'].split())) == {account.pw_gid}, service
        assert set(map(int, status['Groups'].split())) == {shared_gid} and shared_gid != 0, service
        assert int(status['CapEff'].strip(), 16) == 0, service
        assert int(status['CapPrm'].strip(), 16) == 0, service
        assert status['NoNewPrivs'].strip() == '1', service
        for secret in ('/data/secrets/database_password', '/data/secrets/session_secret', '/data/secrets/encryption_key', '/app/backend/.env'):
            result = subprocess.run(['gosu', user, 'test', '-r', secret])
            assert result.returncode == 1, service + ' can read ' + secret
        result = subprocess.run(['gosu', user, 'supervisorctl', '-c', '/etc/supervisor/supervisord.conf', 'status'], capture_output=True)
        assert result.returncode != 0, service + ' can control Supervisor'
        print(f'{service}: UID {account.pw_uid}, zero effective/permitted capabilities, no-new-privileges, secrets/socket denied: PASS')
    # This is written by the actual Node backend on boot, not a test fixture.
    projection = GPU_ROOT / 'enabled.json'
    assert projection.stat().st_uid == pwd.getpwnam('kimabackend').pw_uid
    assert isinstance(json.loads(projection.read_text())['enabled'], bool)
    for user in sorted(set(USERS.values())):
        subprocess.run(['gosu', user, 'test', '-r', str(projection)], check=True)
    print('Actual backend GPU projection exists and both identities can read it: PASS')


def main():
    if os.geteuid() != 0:
        raise RuntimeError('AIO service preparation and audits require container root')
    if sys.argv[1:] == ['configure']:
        configure()
    elif sys.argv[1:] == ['audit']:
        audit()
    elif len(sys.argv) == 3 and sys.argv[1] == 'launch':
        launch(sys.argv[2])
    else:
        raise RuntimeError('Expected configure, launch SERVICE or audit')


if __name__ == '__main__':
    main()
