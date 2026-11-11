# Downtify — isolated live release acceptance

This guide is for **release maintainers**, not ordinary Kima users.
The application is installable on any compatible Docker host; it must
not rely on a specific NAS, DAS, Proxmox container, network or legacy
import script. Users pair Downtify inside **Settings → Integrations**.

**Release gate:** source CI alone is insufficient. A live pre-release canary confirmed Downtify → Lidarr → Kima single-track import and playback in both applications on 11 November 2026. Each different installation must still verify its own source identity, mount mapping, storage permissions, exclusive import writer and backup/restore strategy before enabling imports. This guide also covers isolated negative-case and failure-recovery acceptance for maintainers.

## 1. Disposable staging

Use a **separate non-production Docker host or VM**. The normal Compose
file has fixed container and port names; never launch a candidate beside
an active production Compose stack on the same Docker daemon.

Create an empty, dedicated application-data volume and an empty music
directory backed by a proven test filesystem. Independently verify its
real mount and atomic no-replace hardlink support. An existing writable
directory alone does not prove that a removable/network volume is
mounted. Keep and verify an independent cold backup for rollback.

Checkout the exact release-candidate head SHA, then build an isolated local candidate image. For example, ONLY on the disposable staging host:

~~~bash
git checkout feat/downtify-lidarr-v2
CANDIDATE="$(git rev-parse HEAD)"
docker build -t "ghcr.io/oxygengs/kima-hub:staging-$CANDIDATE" .

# Point MUSIC_PATH at an existing, verified, disposable music volume.
MUSIC_PATH=/absolute/path/to/isolated-test-music \
VERSION="staging-$CANDIDATE" \
docker compose -f docker-compose.prod.yml up -d --pull never
~~~

Use a separate, compatible real Downtify API v1 with a test account and
a device token. Never post its token, private URL, source recording or
host path in a GitHub issue, PR, CI log or release artifact.

## 2. Read-only source protocol and hash probe

The Python standard-library probe checks Downtify server identity,
authenticated owner/device, queue and full mobile library feed. It
may optionally read an owner's single completed original recording
directly into an in-memory SHA-256 hash. It uses only HTTP GET and
never writes media, enables an importer, runs a scan or touches Kima.

Configure credentials **privately** in the staging terminal:

~~~bash
export DOWNTIFY_STAGING_URL='https://your-test-downtify.example'
export DOWNTIFY_STAGING_SERVER_ID='<32-character id>'
export DOWNTIFY_STAGING_USER_ID='<paired numeric account id>'
export DOWNTIFY_STAGING_USERNAME='<paired username>'
read -r -s -p 'Staging device token: ' DOWNTIFY_STAGING_DEVICE_TOKEN
export DOWNTIFY_STAGING_DEVICE_TOKEN

python3 scripts/downtify_staging_probe.py
~~~

Once there is an actual completed Spotify job owned by this account,
set its id privately and check the entire original audio transfer:

~~~bash
export DOWNTIFY_STAGING_SPOTIFY_ID='<22-character track id>'
python3 scripts/downtify_staging_probe.py --full-audio
~~~

The token is never accepted as a command-line parameter and never
printed. HTTP redirects and proxies are not followed. Plain HTTP is
refused unless the operator explicitly uses `--allow-http` on a
trusted, isolated staging network. Never send tokens over an
untrusted plaintext network.

Output states:
- `source_identity_verified`: pinned server, owner/device, queue and
  full library shape checked, but **no sample audio**.
- `source_job_verified`: one owner-bound completed job and unique
  library match, but **no audio transfer**.
- `source_full_audio_read`: the expected complete original byte count
  was consumed and a SHA-256 computed, **not** independently proven
  acoustic identity or a Kima receipt.
- `failed`: only a sanitized error code, no token, path or URL.

Every result contains `release_approved: false`. Keep source SHA-256
and any test recording identifiers private.

## 3. Genuine Kima acceptance

In the isolated Kima Settings, pair the same real Downtify device and
run the in-app four-part setup check. Do not enable automatic import
until the test music mount and recovery backup are established.

After activation and completion of the initial baseline, initiate
**one new test recording**, not a historical download. Verify:

- [ ] Correct pinned server, device account, owner-bound completed
      Spotify job and unique post-baseline library addition.
- [ ] Exact original byte length and SHA-256 match the safely
      published file, with correct container, decode, duration and
      embedded ISRC (if present), else independently corroborated
      exact Spotify title, full credited artist and duration.
- [ ] The target file is not overwritten; the remote source remains.
- [ ] The Kima scanner returns an exact indexed track and physical
      file hash receipt. The track appears on its artist page and
      plays in the web player and OpenSubsonic clients.
- [ ] Repeated import cycle and container restart do not duplicate
      files; the status counters reflect the real ledger state.
- [ ] Missing/swapped **test** music volume rejects writes, and
      restoring the original mount/marker restores normal operation.
- [ ] Wrong owner, ambiguous queue job, bad metadata, truncated
      audio, conflicting ISRC and missing scanner receipt fail closed.
- [ ] Original application data can be independently cold-restored.
      Upgrading/downgrading a Docker tag is not database rollback.
- [ ] **Migration scenario only:** the previous importer is proved
      stopped and prevented from restarting; fresh installs need none.

## 4. Go/no-go record

Record privately the immutable candidate commit/digest, architecture,
generic filesystem type, real Downtify API revision, anonymized
track evidence, source vs published hash verdict, scanner receipt
and independently verified backup restore. Review residual dependency
advisories and unsupported filesystem capabilities.

Go only if the **current exact candidate** passes all four workflows
(including browser Security E2E), plus the real staged import/scan/
playback, no-replace/mount and backup evidence. Otherwise PR #217
remains draft and the stable image stays unchanged.

The source protocol probe cannot by itself authorize publication.
