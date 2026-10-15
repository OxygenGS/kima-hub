# Experimental v1.11 source integration (not releasable)

This branch is a disposable development baseline built from official upstream
v1.11.0 and fork feature PR #6. The 141 Git merge conflicts were initially
resolved in favor of upstream, with the fork's permission schema, authentication
middleware/route, fork Compose/README and ALL guarded release workflows restored.
The result is a one-parent source snapshot, not a Git merge-parent ancestry.

**DO NOT deploy, publish, create version tags, or merge into main.**

The new upstream download, discover and Soulseek routes still require manual
permission enforcement before testing with normal accounts. The upstream UI
still needs all fork-specific EN/NL localization, branding and accessibility
reconciliation. The backend and the frontend must both be tested beyond
TypeScript. Database upgrade + rollback needs the fully integrated AIO image.

Baseline fork commit: 02d2b320f3c36afcc879bbe5cfd43b17bbc18e48
Upstream tag: v1.11.0
Initial merge conflict count: 141
Initial Git merge exit code: 1 (expected to report conflicts)

Next: CI typecheck, protect music endpoints, re-add the language provider and
settings choices, then build a disposable image with both upgrade origins.
