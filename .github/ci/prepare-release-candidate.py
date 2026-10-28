#!/usr/bin/env python3
"""Prepare reviewed source metadata on a release branch; never tag or publish.

Validate the complete plan before writing. Only root npm versions change;
resolved dependency versions and integrity fields are preserved byte-for-byte.
"""
from __future__ import annotations
import argparse
import copy
from datetime import date
import json
from pathlib import Path
import re
import tempfile

VERSION = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$")
CATALOG = "backend/src/services/releases/catalog.ts"
DUTCH = "frontend/lib/i18n/release-copy.ts"
EDITABLE = {"README.md", "docs/install.md", "CHANGELOG.md", "backend/src/services/__tests__/releases.test.ts"}


def number(value: str) -> tuple[int, ...]:
    if not VERSION.fullmatch(value):
        raise ValueError("Expected a stable MAJOR.MINOR.PATCH version")
    return tuple(map(int, value.split(".")))


def manifest(text: str, target: str, lock: bool) -> str:
    old = json.loads(text)
    previous = old["version"]
    if number(target) < number(previous):
        raise ValueError("Refusing a version downgrade")
    expected = copy.deepcopy(old)
    expected["version"] = target
    if lock:
        if old.get("lockfileVersion") != 3 or old["packages"][""]["version"] != previous:
            raise ValueError("Lockfile root version mismatch")
        expected["packages"][""]["version"] = target
    result, count = re.subn(r'^  "version": "[^"]+",$', '  "version": "' + target + '",', text, count=1, flags=re.M)
    if count != 1:
        raise ValueError("Unexpected npm manifest formatting")
    if lock:
        result, count = re.subn(r'^      "version": "[^"]+",$', '      "version": "' + target + '",', result, count=1, flags=re.M)
        if count != 1:
            raise ValueError("Missing root lockfile version line")
    if json.loads(result) != expected:
        raise ValueError("Version preparation changed unexpected manifest fields")
    return result


def insert(text: str, anchor: str, block: str, sentinel: str) -> str:
    if sentinel in text:
        if block not in text:
            raise ValueError("Existing generated release differs; review it explicitly")
        return text
    if text.count(anchor) != 1:
        raise ValueError("Release insertion anchor is missing or ambiguous")
    return text.replace(anchor, anchor + block, 1)


def plan(root: Path, version: str, spec: dict, edits: list[dict] | None = None) -> dict[str, str]:
    number(version)
    release = spec["release"]
    dutch = spec["dutch"]
    if release["version"] != version:
        raise ValueError("Requested version and editorial data differ")
    date.fromisoformat(release["date"])
    if not release["title"] or not release["summary"] or not release["items"]:
        raise ValueError("Missing release copy")
    keys = [item["key"] for item in release["items"]]
    if len(set(keys)) != len(keys) or set(keys) != set(dutch["items"]):
        raise ValueError("English and Dutch item keys must be complete and unique")
    if release["title"] not in dutch["titles"] or release["summary"] not in dutch["summaries"]:
        raise ValueError("Missing translated release title or summary")
    for item in release["items"]:
        if item["kind"] != "note":
            raise ValueError("Automated preparation only accepts informational notes")
        for field in ("title", "summary", "body"):
            if not item[field] or not dutch["items"][item["key"]][field]:
                raise ValueError("Incomplete bilingual item")
        if "\n" in item["summary"]:
            raise ValueError("Item summaries must be one line")
        for link in item.get("links", []):
            if not re.match(r"^/(?:[a-z]|$)", link["href"]):
                raise ValueError("Release links must stay within the application")
    output = {}
    current = []
    for side in ("frontend", "backend"):
        for name in ("package.json", "package-lock.json"):
            path = f"{side}/{name}"
            text = (root / path).read_text(encoding="utf-8")
            current.append(json.loads(text)["version"])
            output[path] = manifest(text, version, name.endswith("-lock.json"))
    if len(set(current)) != 1:
        raise ValueError("Existing package versions must agree before preparation")
    marker = f"    // release-candidate:{version}\n"
    entry = "\n".join("    " + line for line in json.dumps(release, indent=4, ensure_ascii=True).splitlines()) + ",\n"
    output[CATALOG] = insert((root / CATALOG).read_text(encoding="utf-8"), "export const RELEASES: Release[] = [\n", marker + entry, marker)
    translated = json.dumps({version: dutch}, indent=4, ensure_ascii=True).splitlines()[1:-1]
    translated[-1] += ","
    output[DUTCH] = insert((root / DUTCH).read_text(encoding="utf-8"), "const dutch: Record<string, VersionCopy> = {\n", marker + "\n".join(translated) + "\n", marker)
    notes = spec["changelog"].strip()
    if len(notes) < 100 or re.search(r"^##? ", notes, re.M):
        raise ValueError("Changelog body must use third-level headings or plain text")
    heading = f"## OxygenGS fork v{version} \u2014 release preparation (unpublished)\n\n"
    source = (root / "CHANGELOG.md").read_text(encoding="utf-8")
    output["CHANGELOG.md"] = insert(source, "# Changelog \u2014 OxygenGS Kima Hub\n\n", heading + notes + "\n\n", heading)
    for edit in edits or []:
        path, before, after = edit["path"], edit["before"], edit["after"]
        if path not in EDITABLE or not before or not after:
            raise ValueError("Unapproved release text-edit target")
        text = output.get(path, (root / path).read_text(encoding="utf-8"))
        if after in text:
            output[path] = text
        elif text.count(before) == 1:
            output[path] = text.replace(before, after, 1)
        else:
            raise ValueError(f"Missing or ambiguous release edit in {path}")
    return output


def self_test() -> None:
    for invalid in ("v1.13.0", "01.13.0", "1.13.0-rc1", "../1.13.0"):
        try:
            number(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError("Invalid version accepted")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for side in ("frontend", "backend"):
            (root / side).mkdir()
            data = {"name": "fixture", "version": "1.12.1", "dependencies": {"unchanged": "1.12.1"}}
            (root / side / "package.json").write_text(json.dumps(data, indent=2) + "\n")
            lock = {"name": "fixture", "version": "1.12.1", "lockfileVersion": 3, "packages": {"": data, "node_modules/unchanged": {"version": "1.12.1", "integrity": "unchanged"}}}
            (root / side / "package-lock.json").write_text(json.dumps(lock, indent=2) + "\n")
        for path, text in ((CATALOG, "export const RELEASES: Release[] = [\n];\n"), (DUTCH, "const dutch: Record<string, VersionCopy> = {\n};\n"), ("CHANGELOG.md", "# Changelog \u2014 OxygenGS Kima Hub\n\n"), ("README.md", "Old stable guidance\n")):
            (root / path).parent.mkdir(parents=True, exist_ok=True)
            (root / path).write_text(text, encoding="utf-8")
        spec = {"release": {"version": "1.13.0", "title": "Release", "summary": "Summary", "date": "2026-10-28", "items": [{"kind": "note", "key": "one", "title": "Title", "summary": "Summary", "body": "Body", "links": [{"label": "Home", "href": "/"}]}]}, "dutch": {"titles": {"Release": "Versie"}, "summaries": {"Summary": "Samenvatting"}, "items": {"one": {"title": "Titel", "summary": "Samenvatting", "body": "Tekst"}}}, "changelog": "Verified source-level changes and safe-upgrade guidance for the release candidate. " * 2}
        edits = [{"path": "README.md", "before": "Old stable guidance", "after": "Current stable guidance"}]
        first = plan(root, "1.13.0", spec, edits)
        for path, text in first.items():
            (root / path).write_text(text, encoding="utf-8")
        assert plan(root, "1.13.0", spec, edits) == first
        lock = json.loads(first["frontend/package-lock.json"])
        assert lock["packages"]["node_modules/unchanged"]["version"] == "1.12.1"
        assert lock["packages"][""]["dependencies"] == {"unchanged": "1.12.1"}
        broken = copy.deepcopy(spec)
        broken["dutch"]["items"] = {}
        for candidate, candidate_edits in ((broken, []), (spec, [{"path": "../forbidden", "before": "a", "after": "b"}])):
            try:
                plan(root, "1.13.0", candidate, candidate_edits)
            except ValueError:
                pass
            else:
                raise AssertionError("Incomplete translations or unsafe edits accepted")
    print("Release candidate preparation self-tests: PASS")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("version", nargs="?")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.version:
        parser.error("version is required")
    number(args.version)
    root = Path(__file__).resolve().parents[2]
    spec = json.loads((root / f".github/releases/v{args.version}.json").read_text(encoding="utf-8"))
    edits_path = root / f".github/releases/v{args.version}.edits.json"
    edits = json.loads(edits_path.read_text(encoding="utf-8")) if edits_path.exists() else []
    output = plan(root, args.version, spec, edits)
    for path, text in output.items():
        (root / path).write_text(text, encoding="utf-8")
    print(f"Prepared v{args.version}: {len(output)} source files; no tag, image or deployment")


if __name__ == "__main__":
    main()
