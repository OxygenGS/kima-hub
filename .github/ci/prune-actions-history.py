#!/usr/bin/env python3
"""One-time cleanup of historic PR runs. Never touch releases or current work."""
import collections
import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

repo = os.environ["GH_REPOSITORY"]
token = os.environ["GH_TOKEN"]
dry_run = os.environ.get("DRY_RUN", "true").lower() != "false"
min_age = int(os.environ.get("MIN_AGE_HOURS", "48"))
max_delete = min(250, int(os.environ.get("MAX_DELETE", "250")))
cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=min_age)
target_branches = {"feature/interface-language-switcher", "feature/upstream-v111-implementation"}
headers = {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

def call(method, path):
    req = urllib.request.Request("https://api.github.com" + path, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.load(response) if method == "GET" else None

runs = []
page = 1
while True:
    batch = call("GET", f"/repos/{repo}/actions/runs?per_page=100&page={page}")["workflow_runs"]
    runs.extend(batch)
    if len(batch) < 100:
        break
    page += 1

eligible = []
for run in runs:
    created = dt.datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
    if (run["status"] == "completed" and run["event"] == "pull_request"
        and run.get("head_branch") in target_branches and created < cutoff):
        eligible.append(run)
eligible.sort(key=lambda run: run["created_at"])
# Preserve the newest two runs of each workflow on each old branch.
by_group = collections.defaultdict(list)
for run in eligible:
    by_group[(run["head_branch"], run["name"])].append(run)
protected_ids = {x["id"] for group in by_group.values() for x in group[-2:]}
candidates = [r for r in eligible if r["id"] not in protected_ids]
# Cancelled, superseded PR runs first; successful/failed evidence only after that.
candidates.sort(key=lambda r: (r.get("conclusion") != "cancelled", r["created_at"]))
selected = candidates[:max_delete]
print(json.dumps({"total": len(runs), "eligible": len(eligible),
                  "protected": len(protected_ids), "candidates": len(candidates),
                  "selected": len(selected), "dry_run": dry_run,
                  "by_conclusion": dict(collections.Counter(x.get("conclusion") for x in selected))}))
for r in selected:
    print(f"{'WOULD_DELETE' if dry_run else 'DELETE'} {r['id']} {r['head_branch']} {r['name']} {r['conclusion']}")
    if not dry_run:
        try:
            call("DELETE", f"/repos/{repo}/actions/runs/{r['id']}")
        except urllib.error.HTTPError as exc:
            print(f"Deletion stopped: HTTP {exc.code} for run {r['id']}")
            raise
        time.sleep(0.4)
