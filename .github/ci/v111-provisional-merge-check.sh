#!/usr/bin/env bash
# Preview only. No commits, pushes, tags, image publication or production access.
# Conflicted paths stay on fork's version until reviewed, preserving auth/i18n.
set -euo pipefail
test "$GITHUB_ACTIONS" = "true"
test -n "$GITHUB_STEP_SUMMARY"
mkdir -p audit
baseline="$(git rev-parse HEAD)"
ref="refs/remotes/upstream-v111-preview/v1.11.0"
git fetch --no-tags https://github.com/Chevron7Locked/kima-hub.git "refs/tags/v1.11.0:$ref"
set +e
git -c user.name=ci-upstream-preview -c user.email=ci-preview@localhost \
  merge --no-commit --no-ff "$ref" > audit/provisional-merge-log.txt 2>&1
merge_status=$?
set -e
git diff --name-only --diff-filter=U > audit/provisional-conflicts.txt
number="$(wc -l < audit/provisional-conflicts.txt | tr -d ' ')"
while IFS= read -r file; do
  test -z "$file" && continue
  git checkout --ours -- "$file"
  git add -- "$file"
done < audit/provisional-conflicts.txt
test -z "$(git diff --name-only --diff-filter=U)"
git add -A
git diff --cached --name-only > audit/provisional-changed-paths.txt

{
  echo "# Hypothetical v1.11 source merge diagnostics"
  echo
  echo "- Fork checkout: $baseline"
  echo "- Official upstream tag: v1.11.0"
  echo "- Conflicts provisionally kept at fork versions: **$number**"
  echo "- Changed paths in ephemeral Git index: **$(wc -l < audit/provisional-changed-paths.txt | tr -d ' ')**"
  echo "- Merge status: $merge_status (expected to be nonzero if conflicted)"
  echo "- NOT an approved integration or deployment."
  echo
} > audit/provisional-report.md

run_check() {
  local label="$1" log="$2"
  shift 2
  echo "Checking $label in disposable CI checkout"
  set +e
  "$@" > "$log" 2>&1
  local status=$?
  set -e
  local count
  count="$(grep -c 'error TS' "$log" || true)"
  {
    echo "- $label: exit $status; TypeScript errors: **$count**"
    echo
    echo "First 18 errors:"
    echo '~~~text'
    grep 'error TS' "$log" | head -n 18 || true
    echo '~~~'
    echo
  } >> audit/provisional-report.md
  echo "$label exit=$status errors=$count"
}

run_check "frontend dependency install" audit/provisional-frontend-npm.txt \
  npm --prefix frontend ci --no-audit --no-fund
if test -d frontend/node_modules; then
  run_check "frontend typecheck" audit/provisional-frontend-ts.txt \
    npm --prefix frontend run typecheck
fi
run_check "backend dependency install" audit/provisional-backend-npm.txt \
  npm --prefix backend ci --no-audit --no-fund
if test -d backend/node_modules; then
  run_check "backend prisma generate" audit/provisional-prisma.txt \
    env DATABASE_URL=postgresql://test:test@localhost:5432/not_used \
    backend/node_modules/.bin/prisma generate --schema backend/prisma/schema.prisma
  run_check "backend typecheck" audit/provisional-backend-ts.txt \
    npm --prefix backend run typecheck
fi
cat audit/provisional-report.md | tee -a "$GITHUB_STEP_SUMMARY"
echo "This checkout is ephemeral. No repository ref has been changed."
git merge --abort >/dev/null 2>&1 || true
git reset --hard "$baseline" >/dev/null
