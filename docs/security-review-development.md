# Kima Hub — historical development security review

**Historical security review:** The findings below are from the October 2026 development phase. They are not evidence that findings are resolved or currently exploitable. See [SECURITY.md](../SECURITY.md) for current security information.

Scope: `feature/user-permissions`, initial static review on 2026-10-13. Not a penetration test or release approval. No production changes.

## Confirmed implementation observations

1. **Hardcoded internal database credential (review required).** Root `Dockerfile` startup initializes PostgreSQL role `kima` with the literal password `kima` (including legacy rename), writes `DATABASE_URL=postgresql://kima:kima@localhost:5432/kima` into `/app/backend/.env`, and passes the same URL to supervisor. Investigate actual PostgreSQL listen addresses and whether an untrusted process/container can connect before determining severity. Replace with per-installation credentials while preserving legacy `/data` upgrade compatibility.
2. **Hardcoded internal API secret (review required).** Root `Dockerfile` writes `INTERNAL_API_SECRET=kima-internal-aio` into backend environment. Trace consumers, trust boundary, and whether this token authorizes internal routes or background jobs; provision random persistent secret if security-sensitive.
3. **Root process exposure (review required).** Docker supervisor starts as root; PostgreSQL and Redis use dedicated users, but frontend/backend programs omit `user=` and therefore inherit root under supervisor. Review ability to drop privileges after safe one-time initialization, volume permissions and dependency exposure.
4. **CI security coverage gap.** `.github/workflows/security.yml`: Trivy dependency/secret scan runs on PRs targeting `main`, but Trivy config findings are report-only and Playwright security E2E runs weekly/on demand, not on every PR. Verify that these security jobs actually ran on the development PR and explicitly run them before release sign-off.
5. **Positive controls observed.** Middleware rejects refresh tokens as general auth, restricts stream-scoped tokens to stream paths, derives role from the current user record (cached up to 30 seconds), and checks music permissions against the database. The isolated AIO test compose binds host port 3130 to `127.0.0.1` by default. Persistent session/encryption secrets are generated with cryptographic randomness and newly created files receive mode 600.

## Required follow-up validation

- Enumerate all administration and download/request APIs, including aliases, import endpoints and job creation; verify regular-user denial server-side.
- Test privilege changes, account disabling, API-key revocation, token-version invalidation and cache edge cases.
- Assess stream-ticket leakage in URL logs/referrers and revoke behavior.
- Verify DB/Redis/backend bind addresses and effective ports, including direct Docker `-p` deployments.
- Inspect `INTERNAL_API_SECRET` consumers, scope and bypass opportunities.
- Scan actual assembled release image and verify startup file permissions, container capabilities and writable paths.
- Run explicit security CI and disposable negative tests; retain links to logs and findings.

## Gate

Security review remains OPEN. No merge, registry publication, tag or deployment to any real installation is authorized by this review.
