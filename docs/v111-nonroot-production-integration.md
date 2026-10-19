# v1.11 production-source non-root service port — requires native CI

Ported selectively from the separately tested experiment at `84fbfb55d662bdaecbff36faf124bee732a4a81e`, based on the latest candidate `bc7aeb1f471fcc9c072935d41f2d4500e4ed97a3`. Source branch: `feature/v111-nonroot-production-integration`.

The **real** image Dockerfile now creates separate `kimabackend` and `kimaaudio` identities and a restricted `kimaruntime` group. The root bootstrap prepares already inspected cache/GPU state paths and protected credentials, then Supervisor launches Node, Essentia and CLAP via the Python privilege-dropping launcher. The actual processes must have no root UID/GID, zero effective/permitted capabilities and `NoNewPrivs=1`. The original UPF model bytes and notice remain untouched.

The reproducible tokenizer cache is copied from the root home to a root-owned, world-readable, immutable application path. Existing `/music` permissions are **not changed**: inaccessible music mounts fail at startup rather than receiving broad chmod. Startup refuses symlinked, hardlinked and special files in the paths it prepares; check/change is **not** atomic against a concurrent hostile writer. Use a verified offline backup and exclusively mounted prepared volumes for upgrades. On existing libraries, review their UID/GID and ACLs before enabling this release.

The native AIO smoke now audits actual backend/analyzer identities, secret file and Supervisor socket access, GPU backend state projection and restart. The existing independent old-image rollback routines continue to use original snapshots, never the migrated copy.

**Not covered by this source port alone:** actual CUDA hardware, arbitrary ACL/xattrs/NFS setups, all import/download library-write workflows, production backups or user-device/a11y tests. Root bootstrap and root Supervisor remain. This code is not license or CVE approval. No stable tag, image or private installation change is authorized by a source commit.
