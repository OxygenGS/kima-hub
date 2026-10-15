#!/usr/bin/env bash
# No push, no publish, no deployment: dry-run merging upstream v1.11.0 into
# the fork's feature baseline on a throwaway GitHub Actions checkout.
set -euo pipefail

mkdir -p audit
report="audit/upstream-v1.11-merge-report.md"
: > "$report"

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "This merge audit is intended for an isolated GitHub Actions checkout." >&2
  exit 1
fi

# The upstream tag is pinned. Do not fetch a floating 'main' reference.
tag="v1.11.0"
remote_ref="refs/remotes/upstream-compat/v1.11.0"
git fetch --no-tags https://github.com/Chevron7Locked/kima-hub.git "refs/tags/$tag:$remote_ref"

{
  echo "# Upstream v1.11.0 integration dry-run"
  echo
  echo "- Fork base SHA: \`$(git rev-parse HEAD)\`"
  echo "- Upstream tag: \`$tag\`"
  echo "- Upstream tag commit: \`$(git rev-parse "$remote_ref^{commit}")\`"
  echo "- Dry-run only: **no git push, no Docker publish, no production action**"
  echo
} >> "$report"

set +e
git -c user.name=integration-audit -c user.email=integration-audit@localhost \
  merge --no-commit --no-ff "$remote_ref" > audit/merge-log.txt 2>&1
merge_result=$?
set -e

git diff --name-only --diff-filter=U | sort > audit/conflicts.txt
count="$(wc -l < audit/conflicts.txt | tr -d ' ')"

if [ "$merge_result" -eq 0 ]; then
  echo "## Dry-run result: no textual merge conflicts" >> "$report"
else
  echo "## Dry-run result: merge requires manual reconciliation" >> "$report"
fi
{
  echo
  echo "Detected unresolved file conflicts: **$count**"
  echo
  echo "By area:"
  echo
  for area in frontend backend .github docs other; do
    case "$area" in
      other) hits="$(grep -Ev '^(frontend|backend|\.github|docs)/' audit/conflicts.txt | wc -l | tr -d ' ')" ;;
      *) hits="$(grep -Ec "^$area/" audit/conflicts.txt || true)" ;;
    esac
    echo "- $area: $hits"
  done
  echo
  echo "### Conflicting file paths"
  echo
  if [ "$count" -eq 0 ]; then
    echo "None found by git merge."
  else
    sed 's|^|- \`|; s|$|\`|' audit/conflicts.txt
  fi
  echo
  echo "### Merge diagnostic excerpt"
  echo
  echo '~~~text'
  tail -n 70 audit/merge-log.txt
  echo '~~~'
  echo
  echo "Even if there are **no textual conflicts**, schema/API behavior and"
  echo "English/Dutch UI translation parity still require integration tests."
} >> "$report"

cat "$report" | tee -a "$GITHUB_STEP_SUMMARY"
echo "Wrote $report ($count unresolved paths)."
git merge --abort >/dev/null 2>&1 || true
# Expected conflicts are not a CI infrastructure failure. All are reported.
