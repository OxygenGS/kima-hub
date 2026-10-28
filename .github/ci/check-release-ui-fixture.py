#!/usr/bin/env python3
"""Check release fixture INSERT columns before building AIO images.

This is a narrow source/schema contract, not a SQL engine or a migration test.
releaseUiFixture.test.ts executes the same INSERTs against migrated PostgreSQL.
"""
import argparse
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
TABLES = ("Artist", "Album", "OwnedAlbum", "Track")
SCALARS = {"String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes"}


def fixture_inserts(source: str) -> list[str]:
    blocks = re.findall(r"<<SQL\n(.*?)^SQL$", source, re.M | re.S)
    if len(blocks) != 1:
        raise ValueError("Expected exactly one release fixture SQL heredoc")
    sql = re.sub(r"^\s*--[^\n]*", "", blocks[0], flags=re.M)
    statements = [part.strip() for part in sql.split(";") if part.strip()]
    if not statements or statements[0] != "BEGIN" or statements[-1] != "COMMIT":
        raise ValueError("Release fixture must be an explicit transaction")
    return statements[1:-1]


def check(source: str, schema: str) -> None:
    models = dict(re.findall(r"^model\s+(\w+)\s*\{\n(.*?)^\}", schema, re.M | re.S))
    inserts = fixture_inserts(source)
    if len(inserts) != len(TABLES):
        raise ValueError("Expected four release fixture INSERT statements")
    for expected, statement in zip(TABLES, inserts):
        match = re.match(r'INSERT\s+INTO\s+"(\w+)"\s*\(([^)]+)\)\s+VALUES\b', statement)
        if not match or match[1] != expected:
            raise ValueError(f"Expected an INSERT into {expected}")
        columns = [item.strip() for item in match[2].split(",")]
        if any(not re.fullmatch(r'"\w+"', column) for column in columns):
            raise ValueError(f"Unexpected column syntax in {expected}")
        columns = [column[1:-1] for column in columns]
        if len(set(columns)) != len(columns):
            raise ValueError(f"Duplicate INSERT column in {expected}")
        if expected not in models:
            raise ValueError(f"Missing Prisma model {expected}")
        body = models[expected]
        table_map = re.search(r'@@map\("([^"]+)"\)', body)
        if table_map and table_map[1] != expected:
            raise ValueError(f"Fixture table differs from mapped model {expected}")
        stored = set()
        for line in body.splitlines():
            field = re.match(r"\s*(\w+)\s+(\w+)(?:\?|\[\])?(?=\s|$)(.*)", line)
            if field and field[2] in SCALARS:
                mapped = re.search(r'@map\("([^"]+)"\)', field[3])
                stored.add(mapped[1] if mapped else field[1])
        unknown = set(columns) - stored
        if unknown:
            raise ValueError(f"Unknown stored columns in {expected}: {', '.join(sorted(unknown))}")
        if expected == "OwnedAlbum" and set(columns) != {"artistId", "rgMbid", "source"}:
            raise ValueError("OwnedAlbum fixture must include its composite key and source")


def self_test(source: str, schema: str) -> None:
    check(source, schema)
    owned = 'INSERT INTO "OwnedAlbum" ("artistId","rgMbid","source")'
    if owned not in source:
        raise ValueError("Self-test fixture anchor changed; review the regression cases")
    mutations = {
        "obsolete id": source.replace(owned, owned.replace('"source"', '"id"')),
        "obsolete albumId": source.replace(owned, owned.replace('"source"', '"albumId"')),
        "obsolete updatedAt": source.replace(owned, owned.replace('"source"', '"updatedAt"')),
        "relation is not a column": source.replace(owned, owned.replace('"source"', '"artist"')),
        "missing ownership source": source.replace(owned, owned.replace(',"source"', '')),
        "duplicate column": source.replace(owned, owned.replace('"source"', '"artistId"')),
        "wrong table": source.replace('INSERT INTO "OwnedAlbum"', 'INSERT INTO "UnknownAlbum"'),
        "missing transaction": source.replace("BEGIN;", ""),
        "missing commit": source.replace("COMMIT;", ""),
        "extra statement": source.replace("COMMIT;", "DELETE FROM \"Artist\";\nCOMMIT;"),
        "unknown track column": source.replace('"fileSize"', '"nonexistentFileSize"'),
    }
    for name, mutated in mutations.items():
        if mutated == source:
            raise ValueError(f"Regression case did not mutate the fixture: {name}")
        try:
            check(mutated, schema)
        except ValueError:
            continue
        raise ValueError(f"Regression was not rejected: {name}")
    print(f"Release fixture guard: valid source and {len(mutations)} invalid mutations checked")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        source = (ROOT / ".github/ci/seed-release-ui.sh").read_text(encoding="utf-8")
        schema = (ROOT / "backend/prisma/schema.prisma").read_text(encoding="utf-8")
        check(source, schema)
        if args.self_test:
            self_test(source, schema)
    except (OSError, ValueError) as error:
        print(f"RELEASE FIXTURE CHECK FAILED: {error}", file=sys.stderr)
        return 1
    print("Release fixture INSERT columns match the current Prisma schema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
