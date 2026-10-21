#!/usr/bin/env sh
# Installs the standalone barge CLI into a user-owned directory without elevated
# permissions. Downloads the requested (or latest) release asset from the public
# releases repository, verifies its SHA-256 against that release's SHA256SUMS and
# smoke-runs it BEFORE anything in the install directory is touched, then replaces
# the binary atomically. Never edits shell profiles; prints the PATH line to add
# when the install directory is not already on PATH.
#
# The checksum manifest is fetched over HTTPS from the same release origin, so it
# protects against truncated or corrupted downloads — not against a compromised
# release origin.
#
# Test seams (not operator configuration): BARGE_INSTALL_BASE_URL overrides the
# release origin, BARGE_INSTALL_OS/BARGE_INSTALL_ARCH override platform detection,
# so failure paths run deterministically against a local fixture server.
set -eu

usage() {
  cat <<'EOF'
Usage: install.sh [--version X.Y.Z] [--dir PATH] [--base-url URL]

Downloads the barge CLI release for this platform (Linux/macOS; Windows users
download the .exe from the releases page manually), verifies its SHA-256
checksum, and installs it atomically into --dir (default: ~/.local/bin).
Re-run with a newer --version to update in place.
EOF
  exit "${1:-0}"
}

version=""
bin_dir="${HOME:-.}/.local/bin"
base_url="${BARGE_INSTALL_BASE_URL:-https://github.com/getbarge/barge/releases}"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ $# -ge 2 ] || { echo "install.sh: --version requires a value" >&2; exit 2; }; version="$2"; shift 2 ;;
    --dir) [ $# -ge 2 ] || { echo "install.sh: --dir requires a value" >&2; exit 2; }; bin_dir="$2"; shift 2 ;;
    --base-url) [ $# -ge 2 ] || { echo "install.sh: --base-url requires a value" >&2; exit 2; }; base_url="$2"; shift 2 ;;
    --help|-h) usage 0 ;;
    *) echo "install.sh: unknown argument: $1" >&2; usage 1 ;;
  esac
done

os="${BARGE_INSTALL_OS:-$(uname -s)}"
arch="${BARGE_INSTALL_ARCH:-$(uname -m)}"
case "$os" in
  Linux) os="linux" ;;
  Darwin) os="darwin" ;;
  *) echo "install.sh: this installer supports Linux and macOS only; on Windows, download the barge-<version>-windows-x64.exe asset from the releases page and add its directory to PATH" >&2; exit 1 ;;
esac
case "$arch" in
  x86_64|amd64) arch="x64" ;;
  arm64|aarch64) arch="arm64" ;;
  *) echo "install.sh: unsupported architecture '$arch' — supported: x86_64, arm64/aarch64" >&2; exit 1 ;;
esac

download_to() {
  # $1 = url, $2 = destination file. -f/-q make HTTP errors (404 etc.) exit non-zero.
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$2" "$1"
  else
    echo "install.sh: need curl or wget to download the release" >&2
    exit 1
  fi
}

tmp="$(mktemp -d)"
staged=""
cleanup() {
  rm -rf "$tmp"
  if [ -n "$staged" ]; then rm -f "$staged"; fi
}
trap cleanup EXIT

if [ -z "$version" ]; then
  if ! download_to "$base_url/latest/download/release.json" "$tmp/release.json"; then
    echo "install.sh: could not download $base_url/latest/download/release.json — no release has been published yet, or the network/URL is wrong" >&2
    exit 1
  fi
  # release.json is machine-generated with a stable shape; no jq dependency.
  version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$tmp/release.json" | head -n 1)"
fi
[ -n "$version" ] || { echo "install.sh: could not read a version from release.json" >&2; exit 1; }
version="${version#v}"
# The version names an asset and is interpolated into the checksum lookup below;
# anything outside release-identifier characters must fail with a precise message.
case "$version" in
  *[!A-Za-z0-9.-]*) echo "install.sh: invalid version '$version' — use release identifiers like 1.2.3" >&2; exit 2 ;;
esac

asset="barge-${version}-${os}-${arch}"
asset_url="$base_url/download/v${version}/${asset}"
sums_url="$base_url/download/v${version}/SHA256SUMS"

if ! download_to "$asset_url" "$tmp/$asset"; then
  echo "install.sh: could not download $asset_url — check the version (try without --version for the latest release)" >&2
  exit 1
fi
if ! download_to "$sums_url" "$tmp/SHA256SUMS"; then
  echo "install.sh: could not download $sums_url" >&2
  exit 1
fi

asset_sed="$(printf '%s' "$asset" | sed 's/[.]/[.]/g')"
expected="$(sed -n "s/^\([0-9a-fA-F]\{64\}\)[[:space:]]\{1,2\}${asset_sed}\$/\1/p" "$tmp/SHA256SUMS" | head -n 1)"
[ -n "$expected" ] || { echo "install.sh: no checksum published for $asset — refusing to install" >&2; exit 1; }

if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | cut -d' ' -f1)"
elif command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)"
else
  echo "install.sh: need sha256sum or shasum to verify the download" >&2
  exit 1
fi
if [ "$actual" != "$expected" ]; then
  echo "install.sh: checksum mismatch for $asset — refusing to install" >&2
  exit 1
fi

chmod 755 "$tmp/$asset"
if ! "$tmp/$asset" version >/dev/null 2>&1; then
  echo "install.sh: downloaded binary did not run on this platform — refusing to install" >&2
  exit 1
fi

mkdir -p "$bin_dir"
# Stage inside the destination directory so the final move stays on one filesystem
# and the rename over any existing binary is atomic.
staged="$bin_dir/.barge.$$.tmp"
cp "$tmp/$asset" "$staged"
chmod 755 "$staged"
mv -f "$staged" "$bin_dir/barge"
staged=""

installed="$bin_dir/barge"
echo "installed barge $version at $installed"
case ":$PATH:" in
  *":$bin_dir:"*) ;;
  *) echo "add it to PATH (not persisted by this script): export PATH=\"$bin_dir:\$PATH\"" ;;
esac
