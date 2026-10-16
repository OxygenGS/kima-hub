#!/usr/bin/env python3
"""Evaluate a Trivy AIO image JSON report (no vulnerability suppression).

HIGH/CRITICAL findings with an explicitly published fixed version block the
experimental AIO CI. Findings without a fixed version remain visible and
require a separate manual release decision; CI success is not security approval.
"""
from __future__ import annotations

import collections
import json
import os
from pathlib import Path
import sys


def evaluate(report: dict) -> dict:
    if not isinstance(report, dict) or not isinstance(report.get("Results"), list):
        raise ValueError("Missing/invalid Trivy Results: fail closed")
    results = report["Results"]
    findings = [
        (str(result.get("Target", "")), vuln)
        for result in results
        if isinstance(result, dict)
        for vuln in (result.get("Vulnerabilities") or [])
        if isinstance(vuln, dict) and vuln.get("Severity") in {"HIGH", "CRITICAL"}
    ]
    # Version strings are emitted by Trivy; an empty string is not a fix.
    fixable = [(target, vuln) for target, vuln in findings if str(vuln.get("FixedVersion") or "").strip()]
    severity = collections.Counter(vuln["Severity"] for _, vuln in findings)
    critical = [
        (str(vuln.get("VulnerabilityID", "?")), str(vuln.get("PkgName", "?")),
         str(vuln.get("Status", "?")), str(vuln.get("FixedVersion") or "none reported"))
        for _, vuln in findings if vuln["Severity"] == "CRITICAL"
    ]
    return {"total": len(findings), "high": severity["HIGH"], "critical": severity["CRITICAL"],
            "fixable": fixable, "critical_entries": critical}


def self_test() -> None:
    clean = evaluate({"Results": [{"Target": "test", "Vulnerabilities": []}]})
    assert clean["total"] == 0 and not clean["fixable"]
    only_unfixed = evaluate({"Results": [{"Target": "test", "Vulnerabilities": [
        {"Severity": "CRITICAL", "VulnerabilityID": "TEST-A", "PkgName": "example", "FixedVersion": ""}
    ]}]})
    assert only_unfixed["critical"] == 1 and not only_unfixed["fixable"]
    fixed = evaluate({"Results": [{"Target": "test", "Vulnerabilities": [
        {"Severity": "HIGH", "VulnerabilityID": "TEST-B", "PkgName": "example", "FixedVersion": "9.9"}
    ]}]})
    assert len(fixed["fixable"]) == 1
    try:
        evaluate({"unexpected": []})
    except ValueError:
        pass
    else:
        raise AssertionError("Truncated or invalid report must fail closed")
    print("Trivy report evaluator self-tests: PASS")


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        self_test()
        return 0
    if len(sys.argv) != 3 or sys.argv[2] not in {"amd64", "arm64"}:
        print("Usage: evaluate-image-vulnerabilities.py REPORT.json amd64|arm64", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        stats = evaluate(data)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"::error::Cannot evaluate assembled image vulnerability report: {exc}")
        return 1
    arch = sys.argv[2]
    lines = [
        f"### {arch} assembled AIO image vulnerability review",
        f"- HIGH: **{stats['high']}**; CRITICAL: **{stats['critical']}**",
        f"- HIGH/CRITICAL with an explicitly reported patched version: **{len(stats['fixable'])}**",
        "- Findings lacking a listed fix are **not accepted as safe**. A separate human security review "
        "of the actual release image is mandatory before publication.",
    ]
    if stats["critical_entries"]:
        lines.append("- CRITICAL findings (advisory, package, vendor status, listed fix):")
        for advisory, package, status, fix in sorted(set(stats["critical_entries"])):
            # Values originate in a scanner report, never treat them as GitHub Actions commands.
            lines.append(f"  - {advisory}: {package} (status: {status}; fix: {fix})")
    message = "\n".join(lines) + "\n"
    print(message)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as handle:
            handle.write(message)
    if stats["fixable"]:
        for _, vuln in stats["fixable"][:30]:
            print("BLOCKING fixable vulnerability: "
                  f"{vuln.get('VulnerabilityID', '?')} in {vuln.get('PkgName', '?')}: "
                  f"{vuln.get('InstalledVersion', '?')} -> {vuln.get('FixedVersion', '?')}")
        if len(stats["fixable"]) > 30:
            print(f"... and {len(stats['fixable']) - 30} more")
        print("::error::Fixable HIGH/CRITICAL vulnerabilities found in assembled AIO image")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
