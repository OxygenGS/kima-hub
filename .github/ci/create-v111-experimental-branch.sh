#!/usr/bin/env bash
# One-shot experimental v1.11 code integration on a NEW feature branch only.
# NEVER overwrite the tested PR #5/#6 heads, main, tags or container releases.
set -euo pipefail
test "$GITHUB_ACTIONS" = "true"
test "$GITHUB_REPOSITORY" = "OxygenGS/kima-hub"
target="feature/upstream-v111-implementation"
if git ls-remote --exit-code --heads origin "$target" >/dev/null 2>&1; then
  echo "Experimental integration branch already exists; refusing to rewrite it."
  exit 0
fi
base="$(git rev-parse HEAD)"
git switch -c "$target"
upstream="refs/remotes/chillverse-v111/v1.11.0"
git fetch --no-tags https://github.com/Chevron7Locked/kima-hub.git \
  "refs/tags/v1.11.0:$upstream"
set +e
git -c user.name=chillverse-integration -c user.email=ci-integration@localhost \
  merge --no-ff --no-commit "$upstream" > /tmp/v111-merge.log 2>&1
status=$?
set -e
git diff --name-only --diff-filter=U > /tmp/v111-conflicts.txt
count="$(wc -l < /tmp/v111-conflicts.txt | tr -d ' ')"
forbid_main="main"
test "$target" != "$forbid_main"
while IFS= read -r file; do
  test -z "$file" && continue
  if ! git ls-files --stage -- "$file" | grep -q '^[^[:space:]]\+ [0-9a-f]\+ 3[[:space:]]'; then
    git rm -f -- "$file" >/dev/null
  else
    git checkout --theirs -- "$file"
    git add -- "$file"
  fi
done < /tmp/v111-conflicts.txt
test -z "$(git diff --name-only --diff-filter=U)"

# Restore the reviewed fork's high-stakes foundations. The newer upstream UI
# and routes must be reviewed and re-integrated; do not make security promises
# about them until role-based tests pass on THIS experiment.
git checkout "$base" -- \
  backend/prisma/schema.prisma \
  backend/src/middleware/auth.ts \
  backend/src/routes/auth.ts \
  .github/workflows/docker-publish.yml \
  .github/workflows/prerelease.yml \
  .github/workflows/pr-checks.yml
test -f frontend/lib/i18n/translations.ts
test -f frontend/lib/i18n/language-context.tsx
grep -q 'canRequestAlbums' backend/prisma/schema.prisma
grep -q 'canDownloadTracks' backend/prisma/schema.prisma
grep -q 'model BrandingSettings' backend/prisma/schema.prisma
grep -q 'requireMusicPermission' backend/src/middleware/auth.ts

cat > docs/v111-experimental-implementation.md <<EOF
# Experimental v1.11 source integration (not releasable)

This branch is a disposable development baseline built from official upstream
v1.11.0 and fork feature PR #6. The 141 Git merge conflicts were initially
resolved in favor of upstream, with the fork's permission schema, authentication
middleware/route and guarded release workflows restored afterward.

**DO NOT deploy, publish, create version tags, or merge into main.**

The new upstream download, discover and Soulseek routes still require manual
permission enforcement before testing with normal accounts. The upstream UI
still needs all fork-specific EN/NL localization, branding and accessibility
reconciliation. The backend and the frontend must both be tested beyond
TypeScript. Database upgrade + rollback needs the fully integrated AIO image.

Baseline fork commit: $base
Upstream tag: v1.11.0
Initial merge conflict count: $count
Initial Git merge exit code: $status (expected to report conflicts)

Next: CI typecheck, protect music endpoints, re-add the language provider and
settings choices, then build a disposable image with both upgrade origins.
EOF

git add -A
test -z "$(git diff --name-only --diff-filter=U)"
git -c user.name=chillverse-integration -c user.email=ci-integration@localhost \
  commit -m "wip(upstream): experimental v1.11 code baseline with fork security foundations"
echo "About to create ONLY refs/heads/$target (never force push)."
git push origin "HEAD:refs/heads/$target"
echo "Experimental branch created. All production and stable refs untouched."
