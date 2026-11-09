#!/usr/bin/env bash
# Install exactly Trivy v0.74.0 without relying on setup-trivy's silent,
# single-shot download. Keep the image vulnerability/secret scans mandatory.
# The release archive's SHA-256 is pinned in source, not downloaded alongside it.
set -euo pipefail

case "$(uname -m)" in
  x86_64)
    asset="trivy_0.74.0_Linux-64bit.tar.gz"
    expected="2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a"
    asset_id="514339431"
    ;;
  aarch64|arm64)
    asset="trivy_0.74.0_Linux-ARM64.tar.gz"
    expected="b94ce1976bbf3c15b514b605ee88be7c6d94a29be2302847ff01cb794d47aad5"
    asset_id="514339429"
    ;;
  *)
    echo "Unsupported Trivy scanner architecture" >&2
    exit 1
    ;;
esac

scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
archive="$scratch/$asset"
url="https://github.com/aquasecurity/trivy/releases/download/v0.74.0/$asset"

check_archive() {
  test -s "$archive" && printf '%s  %s\n' "$expected" "$archive" |
    sha256sum -c - >/dev/null
}

# Release-asset CDN downloads have failed intermittently on native ARM64
# runners. Use bounded retries, an authenticated GitHub API fallback, and
# the same strict SHA check regardless of the download transport.
if ! curl --fail --location --silent --show-error \
    --retry 5 --retry-all-errors --retry-delay 3 \
    --connect-timeout 20 --max-time 180 \
    --output "$archive" "$url" || ! check_archive; then
  echo "Direct Trivy release download unavailable; trying GitHub API asset"
  rm -f -- "$archive"
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "GitHub Actions token missing for verified release-asset fallback" >&2
    exit 1
  fi
  curl --fail --location --silent --show-error \
    --retry 5 --retry-all-errors --retry-delay 3 \
    --connect-timeout 20 --max-time 180 \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/octet-stream" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    --output "$archive" \
    "https://api.github.com/repos/aquasecurity/trivy/releases/assets/$asset_id"
fi

if ! check_archive; then
  echo "Pinned Trivy release archive checksum does not match; refusing scanner install" >&2
  exit 1
fi

# Extract ONLY the expected scanner executable, never execute any archive
# content before checksum verification.
tar -xzf "$archive" -C "$scratch" trivy
test -f "$scratch/trivy"
install -d "$HOME/.local/bin"
install -m 0755 "$scratch/trivy" "$HOME/.local/bin/trivy"
printf '%s\n' "$HOME/.local/bin" >> "${GITHUB_PATH:-/dev/null}"
"$HOME/.local/bin/trivy" --version
