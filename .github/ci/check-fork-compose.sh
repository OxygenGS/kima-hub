#!/usr/bin/env bash
# Validate fork AIO Compose examples without starting containers.
# The real AIO runtime/upgrade check runs separately in pr-checks.yml.
set -euo pipefail

for file in docker-compose.prod.yml docker-compose.server.yml; do
    echo "Checking $file for safe fork image, data mounts and kernel settings..."
    # Blank VERSION exercises the pinned stable fallback, not :latest.
    VERSION= docker compose -f "$file" config --format json | python3 -c '
import json, sys
c = json.load(sys.stdin)
svc = c["services"]["kima"]
image = svc["image"]
assert image == "ghcr.io/oxygengs/kima-hub:v1.10.0", image
volumes = svc["volumes"]
assert any(v.get("type") == "volume" and v.get("target") == "/data" and v.get("source") == "kima_data" for v in volumes), volumes
assert any(v.get("type") == "bind" and v.get("target") == "/music" for v in volumes), volumes
sysctls = svc.get("sysctls", {})
assert "vm.overcommit_memory" not in sysctls, sysctls
assert c["volumes"].get("kima_data"), c["volumes"]
print("Pinned stable configuration valid:", image)
'
    # A synthetic new tag proves Dockge/Compose can select a future version
    # without changing the persistent mount. No image is pulled or published.
    VERSION=v9.9.9 docker compose -f "$file" config --format json | python3 -c '
import json, sys
svc = json.load(sys.stdin)["services"]["kima"]
assert svc["image"] == "ghcr.io/oxygengs/kima-hub:v9.9.9", svc["image"]
assert any(v.get("target") == "/data" and v.get("source") == "kima_data" for v in svc["volumes"])
print("User-selected update version accepted")
'
done

# Consumer installation instructions must point to a published fork image.
for doc in docs/install.md docs/gpu.md; do
    if grep -Eq 'chevron7locked/kima(:|@)|ghcr[.]io/chevron7locked/kima' "$doc"; then
        echo "FORK DOCUMENT CHECK FAILED: upstream installation image in $doc" >&2
        exit 1
    fi
    # The install guide follows the currently published release; the GPU guide
    # may still show the older pinned stable image as a reference.
    if [[ "$doc" == "docs/install.md" ]]; then
        expected_image="ghcr.io/oxygengs/kima-hub:v1.12.1"
    else
        expected_image="ghcr.io/oxygengs/kima-hub:v1.10.0"
    fi
    grep -Fq "$expected_image" "$doc" || {
        echo "FORK DOCUMENT CHECK FAILED: expected fork image $expected_image missing in $doc" >&2
        exit 1
    }
done
# Keep private infrastructure IDs out of current public project documentation.
if grep -ERiq 'CT[[:space:]-]*10[15]([[:space:][:punct:]]|$)' docs/ README.md; then
    echo "DOCUMENT PRIVACY CHECK FAILED: private deployment identifier found" >&2
    exit 1
fi
echo "Fork installation documentation and generic deployment boundaries valid"
