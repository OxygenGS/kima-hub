# Kima Hub — historical development security review

**Historical security review:** The findings below are from the October 2026 development phase. They are not evidence that findings are resolved or currently exploitable. See [SECURITY.md](../SECURITY.md) for current security information.

Scope: `feature/user-permissions`, initial static review on 2026-10-13. Not a penetration test or release approval. No production changes.

## Confirmed implementation observations

1. **Hardcoded internal database credential (review required).** Root `Dockerfile` startup initializes PostgreSQL role `kima` with the literal password `kima` (including legacy rename), writes `DATABASE_URL=postgresql://kima:kima@localhost:5432/kima` into `/app/backend/.env`, and passes the same URL to supervisor. Investigate actual PostgreSQL listen addresses and whether an untrusted process/container can connect before determining severity. Replace with per-installation credentials while preserving legacy `/data` upgrade compatibility.
2. **Hardcoded internal API secret (review required).** Root `Dockerfile` writes `INTERNAL_API_SECRET=kima-internal-aio` into backend environment. Trace consumers, trust boundary, and whether this token authorizes internal routes or background jobs; provision random persistent secret if security-sensitive.
3. **Root process exposure (review required).** Docker supervisor starts as root; PostgreSQL and Redis use dedicated users, but frontend/backend programs omit `user=` and therefore inherit root under supervisor. Review ability to drop privileges after safe one-time initialization, volume permissions and dependency exposure.
4. **CI security coverage gap.** `.github/workflows/security.yml`: Trivy dependency/secret scan runs on PRs targeting `main`, but Trivy config findings are report-only and Playwright security E2E runs weekly/on demand, not on every PR. Verify that these security jobs actually ran on the development PR and explicitly run them before release sign-off.
5. **Positive controls observed.** Middleware rejects refresh tokens as general auth, restricts stream-scoped tokens to stream paths, derives role from the current user record (cached up to 30 seconds), and checks music permissions against the database. The isolated AIO test compose binds host port 3130 to `127.0.0.1` by default. Persistent session/encryption secrets are generated with cryptographic randomness and newly created files receive mode 600.

## Follow-up static inspection — 16 October 2026, v1.11 draft

Inspected the current combined Draft #7 root `Dockerfile` and `.github/workflows/security.yml`. This is **source-only evidence**, not a runtime penetration test, a complete repository secret search, or a release sign-off.

- **PostgreSQL network boundary:** Fresh AIO initialization appends `listen_addresses='localhost'` and SCRAM localhost rules (`Dockerfile`, around lines 554–563). This limits the *newly initialized* PostgreSQL listener, but **existing persistent `/data/postgres/postgresql.conf` is not rewritten by this conditional block**. Inspect the effective listener and `pg_hba.conf` in both fresh and upgraded disposable containers; do not declare database exposure resolved from source alone.
- **Credential boundary:** The `kima` role retains a fixed internal password and multiple local database URLs in AIO startup/supervisor configuration (`Dockerfile`, around lines 471–484, 575–596, 681–716). This is a **confirmed design concern**, though remote exploitability is not established. Any change must preserve upgrades and test both original upstream v1.10/v1.11 recovery.
- **Backend listening address and Compose boundary:** `backend/src/index.ts` binds the backend API to `0.0.0.0` on configured port 3006. The current fork `docker-compose.prod.yml` and `docker-compose.server.yml` publish only container port 3030 for Kima, not 3006, so their documented host mapping does not directly expose the backend. But the process can be reached on container networks by peers allowed by Docker networking, and direct `docker run -p 3006:3006` or custom Compose settings could expose it. Recheck authentication/authorization for all routes and inspect actual Docker network membership, firewall rules and effective runtime binds before release. Do not describe 3006 as localhost-only.
- **Execution identities:** Supervisor is configured as root; PostgreSQL and Redis explicitly set their own users, but backend, frontend and both analyzers have no `user=` directive (`Dockerfile`, around lines 406–485). Treat unprivileged app execution as open hardening work, not a proven direct exploit.
- **Internal API secret finding needs revalidation:** The historical claim that the Dockerfile *writes* `INTERNAL_API_SECRET=kima-internal-aio` was **not confirmed in the inspected v1.11 Dockerfile**. Do not continue presenting that specific claim as a current fact; examine backend consumers, effective runtime environment and other files before classifying it.
- **Security workflow coverage:** `security.yml` triggers the dependency/secret scan for PRs targeting `main`, but the stacked PR #7 targets #6. The image-based security E2E is explicitly disabled on PR events and runs only weekly/manual. Passing the v1.11 implementation workflow **does not demonstrate this separate security workflow passed on the exact head**. Keep explicit security execution and human findings review open.

**Decision:** Security gate OPEN. No merge/tag/push or real-installation change is authorized by this inspection.

## AIO backend bind hardening — 16 October 2026

- `backend/src/index.ts` now honors the existing validated `config.host` (`HOST` environment variable), rather than hardcoding `0.0.0.0`.
- The AIO `Dockerfile` startup-generated backend `.env` sets `HOST=127.0.0.1`, restricting the internal backend API to the same container where the frontend proxy runs. The documented public interface remains port 3030.
- Standalone backend deployments retain their existing default (`0.0.0.0`) unless operators explicitly set `HOST`, preserving their independent configurations. Any explicitly provided container environment `HOST` can override the `.env` value according to dotenv precedence; do not assume this protects custom configurations.
- This mitigates one network exposure, **not** the fixed database password, root-execution concern or all internal endpoint authorization risks. Both native AIO builds, browser tests, permission tests, upgrade/rollback and fresh-image runtime must be green on the final commit before treating it as verified.

## PostgreSQL credential and HBA hardening — combined Draft #7, awaiting final-head CI

The current development branch now carries the following **unreleased, not-yet-accepted changes**:

- The AIO generates a separate 64-hex-character PostgreSQL password and persists it under `/data/secrets/database_password`, mode 600, alongside the existing session/encryption secrets. An ordinary restart reuses it.
- When an original upstream AIO `/data` volume is upgraded in a disposable test, the local `kima` PostgreSQL role receives that stored password before Prisma migrations begin. New installations also receive the generated password. The previous fixed `kima` password must not remain accepted.
- The startup-generated backend `.env`, migration environment and inherited supervisor worker environment use the same dynamic database URL. No fixed database password should remain in AIO runtime URLs.
- The AIO prepends managed `pg_hba.conf` rules: peer authentication on Unix sockets, SCRAM on IPv4/IPv6 loopback and reject rules for non-loopback TCP. Earlier rules are retained below the managed preface; this is intended to cover legacy upstream trust rules without allowing them to take precedence. Verify effective auth against both upstream versions and recheck nonstandard customized installations separately.
- Disposable AIO CI now asserts that the generated password authenticates, the old fixed password is rejected, the role stores a SCRAM verifier, the secret file is permission-restricted and persists after restart. Both original upstream v1.10.0 and v1.11.0 full-volume copy upgrades exercise these assertions before independent rollback.
- The stacked `upstream-v111-implementation-checks.yml` workflow now includes a fail-closed Trivy dependency/committed-secret scan for fixable HIGH/CRITICAL findings. Build jobs depend on the result. Image-vulnerability review, process privilege hardening and full security E2E remain separate acceptance gates.

**CI status:** The changed AIO image, HBA behavior, test scripts and Trivy job require a new complete workflow result before claiming they work. Green CI would not be equivalent to permission for publication, nor cover human review of existing external database clients. Do not install the development image on a real instance.

## Required follow-up validation

- Enumerate all administration and download/request APIs, including aliases, import endpoints and job creation; verify regular-user denial server-side.
- Test privilege changes, account disabling, API-key revocation, token-version invalidation and cache edge cases.
- Assess stream-ticket leakage in URL logs/referrers and revoke behavior.
- Verify DB/Redis/backend bind addresses and effective ports, including direct Docker `-p` deployments.
- Inspect `INTERNAL_API_SECRET` consumers, scope and bypass opportunities.
- Scan actual assembled release image and verify startup file permissions, container capabilities and writable paths.
- Run explicit security CI and disposable negative tests; retain links to logs and findings.

## Gate

Security review remains OPEN. No merge, release, registry publication or deployment to any real installation is authorized by this review. A separate release approval is required.
