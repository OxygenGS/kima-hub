#!/usr/bin/env python3
"""Verify that a completed native preflight tested exactly the approved source."""
import argparse
import copy
import json
from pathlib import Path

EXPECTED_JOBS = {
    "Verify release candidate source",
    "Native amd64 build and security scan (no push)",
    "Native arm64 build and security scan (no push)",
}


def check(run: dict, jobs: dict, sha: str, repo: str) -> None:
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        raise ValueError("Native preflight must be fully successful")
    if run.get("head_sha") != sha or run.get("head_branch") != "main":
        raise ValueError("Native preflight did not test this exact main commit")
    if run.get("repository", {}).get("full_name") != repo or run.get("event") != "workflow_dispatch":
        raise ValueError("Preflight must be a manual run in the same repository")
    if run.get("path") != ".github/workflows/v112-native-preflight.yml":
        raise ValueError("Unexpected preflight workflow")
    items = jobs.get("jobs", [])
    if jobs.get("total_count") != len(items) or len(items) != len(EXPECTED_JOBS):
        raise ValueError("Incomplete or unexpected preflight jobs")
    if {job.get("name") for job in items} != EXPECTED_JOBS:
        raise ValueError("Missing required native architecture job")
    if any(job.get("status") != "completed" or job.get("conclusion") != "success" for job in items):
        raise ValueError("Skipped, failed or incomplete preflight job")


def self_test() -> None:
    run = {"status": "completed", "conclusion": "success", "head_sha": "abc", "head_branch": "main", "repository": {"full_name": "example/repo"}, "event": "workflow_dispatch", "path": ".github/workflows/v112-native-preflight.yml"}
    jobs = {"total_count": 3, "jobs": [{"name": name, "status": "completed", "conclusion": "success"} for name in EXPECTED_JOBS]}
    check(run, jobs, "abc", "example/repo")
    variants = []
    for key, value in (("head_sha", "different"), ("conclusion", "failure"), ("event", "pull_request"), ("path", "other.yml"), ("head_branch", "other")):
        changed = copy.deepcopy(run)
        changed[key] = value
        variants.append((changed, jobs))
    changed = copy.deepcopy(jobs)
    changed["jobs"][0]["conclusion"] = "skipped"
    variants.append((run, changed))
    changed = copy.deepcopy(jobs)
    changed["jobs"].pop()
    variants.append((run, changed))
    for candidate, candidate_jobs in variants:
        try:
            check(candidate, candidate_jobs, "abc", "example/repo")
        except ValueError:
            continue
        raise AssertionError("Unsafe preflight accepted")
    print("Approved preflight guard self-tests: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--run", type=Path)
    parser.add_argument("--jobs", type=Path)
    parser.add_argument("--sha")
    parser.add_argument("--repo")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif not all((args.run, args.jobs, args.sha, args.repo)):
        parser.error("--run, --jobs, --sha and --repo are required")
    else:
        check(json.loads(args.run.read_text()), json.loads(args.jobs.read_text()), args.sha, args.repo)
        print("Native preflight matches exact approved source: PASS")
