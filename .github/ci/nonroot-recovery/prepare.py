#!/usr/bin/env python3
"""Extend exact existing rehearsals, or fingerprint an offline disposable volume.

No production paths/hosts are accepted by the CLI. Manifests/backups contain
synthetic test data only and must never be uploaded as workflow artifacts.
"""
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

RC3 = 'ghcr.io/oxygengs/kima-hub@sha256:7ff9b5a0f5d53466ddea71c028e8283ae9753c560ba6cde233445918085a8843'
SOURCES = {
    'upstream-v110': ('.github/ci/aio-real-image-rehearsal.sh', '807bfc42e3c806bdaf81ee4d2afddf8616d3dbef'),
    'upstream-v111': ('.github/ci/aio-v111-real-image-rehearsal.sh', '443f9460d8ad3f7e4c52a5ac6364a8a9c10de09a'),
    'rc3': ('.github/ci/aio-real-image-rehearsal.sh', '807bfc42e3c806bdaf81ee4d2afddf8616d3dbef'),
}


def manifest(root: Path) -> dict:
    """Fingerprint bytes, paths, links, numeric owners and basic POSIX modes.

    Ignore atime/ctime/mtime, inode numbers and filesystem-dependent directory
    link counts. This does not claim ACL/xattr or live PostgreSQL consistency.
    The caller must stop the source image and mount this tree read-only.
    """
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Manifest root must be a real directory')
    rows = {}

    def add(path):
        info = path.lstat()
        row = {'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid, 'gid': info.st_gid}
        if stat.S_ISLNK(info.st_mode):
            row.update(kind='symlink', target=os.readlink(path))
        elif stat.S_ISDIR(info.st_mode):
            row.update(kind='directory')
        elif stat.S_ISREG(info.st_mode):
            digest = hashlib.sha256()
            with path.open('rb') as handle:
                for chunk in iter(lambda: handle.read(1024 * 1024), b''):
                    digest.update(chunk)
            row.update(kind='file', size=info.st_size, links=info.st_nlink, sha256=digest.hexdigest())
        else:
            raise ValueError('Offline backup contains a special file: ' + str(path.relative_to(root)))
        rows[str(path.relative_to(root))] = row

    def fail(error):
        raise error

    add(root)
    for directory, dirs, files in os.walk(root, followlinks=False, onerror=fail):
        for name in sorted(dirs + files):
            add(Path(directory) / name)
    return {'schema': 1, 'entries': rows}


def check_manifest(root: Path, expected: dict) -> int:
    actual = manifest(root)
    if actual != expected:
        old = expected.get('entries', {})
        new = actual['entries']
        changed = [name for name in sorted(set(old) | set(new)) if old.get(name) != new.get(name)]
        raise ValueError('Offline snapshot mismatch: ' + ', '.join(changed[:12]))
    return len(actual['entries'])


def replace_one(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise ValueError('Rehearsal anchor count is not one: ' + old[:90])
    return text.replace(old, new, 1)


def prepare(source: str, arch: str, output: Path) -> None:
    if source not in SOURCES or arch not in ('amd64', 'arm64'):
        raise ValueError('Unknown source/platform')
    if source != 'rc3' and arch != 'amd64':
        raise ValueError('Upstream historical-image rehearsal is AMD64 only')
    filename, expected_blob = SOURCES[source]
    raw = Path(filename).read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if blob != expected_blob:
        raise ValueError('Existing rehearsal changed; review it before applying hooks')
    text = raw.decode('utf-8')
    track = 'ci-v111-old-track' if source == 'upstream-v111' else 'ci-real-old-track'
    text = replace_one(text, 'set -euo pipefail\n', 'set -euo pipefail\numask 077\n' +
        f'export NONROOT_RECOVERY_TRACK={track}\n' +
        'source .github/ci/nonroot-recovery/hooks.sh\n')
    # Install cleanup only after every collision check: never delete a resource
    # that this rehearsal did not create when preflight refuses reuse.
    text = replace_one(text, 'trap cleanup EXIT\n', '')
    text = replace_one(text, 'docker image inspect "$candidate_image" >/dev/null\n',
        'docker image inspect "$candidate_image" >/dev/null\ntrap cleanup EXIT\n')
    if source == 'rc3':
        text = replace_one(text, 'original_image="chevron7locked/kima:v1.10.0"', f'original_image="{RC3}"')
        text = replace_one(text,
            'if [ "$mode" = before ]; then test "$post" = 0; else test "$post" = 2; fi',
            'test "$post" = 2  # rc3 already has both fork permission columns')
    text = replace_one(text, 'docker pull --platform linux/amd64 "$original_image"',
        f'docker pull --platform linux/{arch} "$original_image"')
    text = replace_one(text, 'docker image inspect "$original_image" >/dev/null\n',
        'original_image="$(docker image inspect "$original_image" --format \'{{index .RepoDigests 0}}\')"\n' +
        f'test "$(docker image inspect "$original_image" --format \'{{{{.Architecture}}}}\')" = "{arch}"\n' +
        'echo "Historical source resolved for upgrade AND rollback: $original_image"\n')
    text = replace_one(text, 'local name="$1" data="$2" image="$3"\n',
        'local name="$1" data="$2" image="$3"\n' +
        '    local options=()\n' +
        '    if [ "$name" = "$upgraded" ]; then\n' +
        '        options=(-e DISABLE_CLAP=false -v "$music":/music:ro)\n' +
        '    elif [ "$name" = "$restored" ]; then\n' +
        '        options=(-e DISABLE_CLAP=true -v "$music":/music:ro)\n' +
        '    else\n' +
        '        options=(-e DISABLE_CLAP=true -v "$music":/music)\n' +
        '    fi\n')
    text = replace_one(text, '        -v "$music":/music \\\n        -e DISABLE_CLAP=true \\\n', '        "${options[@]}" \\\n')
    text = replace_one(text, 'check_records "$old" before\n',
        'check_records "$old" before\nnonroot_seed_old\nnonroot_stream "$old"\n')
    text = replace_one(text, 'docker rm "$old" >/dev/null\n',
        'docker rm "$old" >/dev/null\nnonroot_manifest create "$old_data"\n')
    # Reuse the pulled image only as a tar/Python utility. No service starts.
    if text.count('alpine:3.20') != 2:
        raise ValueError('Unexpected backup helper image count')
    text = text.replace('alpine:3.20', '"$candidate_image"')
    text = replace_one(text, 'test -s "$tmp/original-data.tar"\n',
        'test -s "$tmp/original-data.tar"\n(cd "$tmp" && sha256sum original-data.tar > original-data.sha256)\n')
    marker = 'echo "---- Start new fork image using a COPY of upstream\'s full /data ----"'
    text = replace_one(text, marker,
        'nonroot_manifest verify "$new_data"\nnonroot_manifest verify "$restore_data"\n' + marker)
    text = replace_one(text, 'wait_healthy "$upgraded"\n',
        'wait_healthy "$upgraded"\nnonroot_wait "$upgraded"\n')
    marker = 'echo "---- Restore original unchanged snapshot in actual upstream AIO image ----"'
    text = replace_one(text, marker, '''nonroot_check "$upgraded"
nonroot_database_hash="$(docker exec "$upgraded" sha256sum /data/secrets/database_password | cut -d' ' -f1)"
echo "---- Recreate nonroot candidate with its upgraded data and read-only music ----"
docker stop -t 60 "$upgraded" >/dev/null
docker rm "$upgraded" >/dev/null
start_image "$upgraded" "$new_data" "$candidate_image"
wait_healthy "$upgraded"
nonroot_wait "$upgraded"
check_records "$upgraded" after
bash .github/ci/check-aio-db-credential.sh "$upgraded"
nonroot_check "$upgraded"
test "$nonroot_database_hash" = "$(docker exec "$upgraded" sha256sum /data/secrets/database_password | cut -d' ' -f1)"
# Recheck both untouched trees AFTER the candidate has migrated and restarted.
nonroot_manifest verify "$old_data"
nonroot_manifest verify "$restore_data"
(cd "$tmp" && sha256sum -c original-data.sha256)
''' + marker)
    text = replace_one(text, 'check_records "$restored" before\n',
        'check_records "$restored" before\nnonroot_check_rollback "$restored"\n')
    output.write_text(text)
    print(f'Prepared exact-source {source}/{arch} cold-copy/nonroot/recreate/independent-rollback rehearsal')


def main() -> None:
    args = sys.argv[1:]
    if len(args) == 3 and args[0] == 'prepare':
        if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('GITHUB_REPOSITORY') != 'OxygenGS/kima-hub':
            raise ValueError('Only disposable repository CI is supported')
        output = Path(os.environ['RUNNER_TEMP']) / 'nonroot-rehearsal.sh'
        prepare(args[1], args[2], output)
    elif len(args) == 1 and args[0] in ('create', 'verify'):
        if os.environ.get('KIMA_RECOVERY_MANIFEST') != 'disposable-ci-only':
            raise ValueError('Manifest utility requires the isolated CI marker')
        root, record = Path('/source'), Path('/backup/original-manifest.json')
        if args[0] == 'create':
            data = manifest(root)
            # Never overwrite an existing evidence file.
            with record.open('x') as handle:
                json.dump(data, handle, sort_keys=True)
            print(f"Offline original data fingerprint recorded: {len(data['entries'])} entries")
        else:
            count = check_manifest(root, json.loads(record.read_text()))
            print(f'Offline copied data byte/owner/mode/link equality: PASS ({count} entries)')
    else:
        raise ValueError('Expected prepare SOURCE ARCH, create, or verify')


if __name__ == '__main__':
    main()
