#!/usr/bin/env bash
# Test-runner FFmpeg provisioning only. Never used in the production image.
# Avoids slow/non-deterministic runner apt mirrors. The 0.6.0 platform wheel
# bundles a standalone FFmpeg executable; pin the official PyPI wheel SHA256.
set -euo pipefail

if test -x /usr/bin/ffmpeg; then
  timeout -k 5s 15s /usr/bin/ffmpeg -hide_banner -version | head -n 1
  exit 0
fi

case "$(uname -m)" in
  x86_64)
    platform=x86_64
    sha256=c7e46fcec401dd990405049d2e2f475e2b397779df2519b544b8aab515195282
    ;;
  aarch64)
    platform=aarch64
    sha256=1d47bebd83d2c5fc770720d211855f208af8a596c82d17730aa51e815cdee6dc
    ;;
  *)
    echo "::error::Unsupported FFmpeg test-runner architecture" >&2
    exit 1
    ;;
esac

wheel="imageio_ffmpeg-0.6.0-py3-none-manylinux2014_"$platform".whl"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "::notice::Fetching SHA256-pinned FFmpeg test binary from PyPI (no apt mirror)"
# Download only; never install or execute the Python package itself.
# Installation from PyPI and checksumming are deliberately separate so only
# the exact approved binary wheel is extracted and executed.
timeout -k 10s 300s python3 -m pip download \
  --disable-pip-version-check --no-cache-dir --no-deps --only-binary=:all: \
  --retries 2 --timeout 30 --dest "$work" 'imageio-ffmpeg==0.6.0'

test -f "$work/$wheel"
printf '%s  %s\n' "$sha256" "$work/$wheel" | sha256sum --check --status || {
  echo "::error::FFmpeg wheel SHA256 differs from approved PyPI release" >&2
  exit 1
}

mkdir "$work/extracted"
python3 -m zipfile -e "$work/$wheel" "$work/extracted"
binary="$(find "$work/extracted/imageio_ffmpeg/binaries" -maxdepth 1 \
  -type f -name 'ffmpeg-*' -print -quit)"
test -n "$binary" && test -s "$binary"
sudo install -m 0755 "$binary" /usr/bin/ffmpeg

# Keep the real-audio canary enabled; do not replace its executable with a mock.
timeout -k 5s 15s /usr/bin/ffmpeg -hide_banner -version | head -n 1
