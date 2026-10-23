#!/usr/bin/env bash
# Downloads the build-only toolchain into .toolchain/:
#   Oracle GraalVM (Web Image) and Binaryen (wasm-as).
#
#   bash scripts/fetch-toolchain.sh --accept-license
#
# Oracle GraalVM is distributed under Oracle's licence; --accept-license is
# required. Binaryen is Apache-2.0. Run this in Linux, macOS or WSL; native
# Windows builds additionally need Visual Studio 2022 Build Tools (see
# TOOLCHAIN.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${WORK_DIR:-$ROOT/.toolchain}"
GRAALVM_RELEASE="${GRAALVM_RELEASE:-25}"
BINARYEN_VERSION="${BINARYEN_VERSION:-133}"
ACCEPT=0
for arg in "$@"; do
  if [ "$arg" = "--accept-license" ]; then ACCEPT=1; fi
done
if [ "$ACCEPT" -ne 1 ]; then
  echo "This downloads Oracle GraalVM under Oracle's licence." >&2
  echo "Re-run with --accept-license to continue." >&2
  exit 1
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)
    GRAALVM_FILE="graalvm-jdk-${GRAALVM_RELEASE}_linux-x64_bin.tar.gz"
    BINARYEN_FILE="binaryen-version_${BINARYEN_VERSION}-x86_64-linux.tar.gz"
    ;;
  Linux-aarch64)
    GRAALVM_FILE="graalvm-jdk-${GRAALVM_RELEASE}_linux-aarch64_bin.tar.gz"
    BINARYEN_FILE="binaryen-version_${BINARYEN_VERSION}-aarch64-linux.tar.gz"
    ;;
  Darwin-x86_64)
    GRAALVM_FILE="graalvm-jdk-${GRAALVM_RELEASE}_macos-x64_bin.tar.gz"
    BINARYEN_FILE="binaryen-version_${BINARYEN_VERSION}-x86_64-macos.tar.gz"
    ;;
  Darwin-arm64)
    GRAALVM_FILE="graalvm-jdk-${GRAALVM_RELEASE}_macos-aarch64_bin.tar.gz"
    BINARYEN_FILE="binaryen-version_${BINARYEN_VERSION}-arm64-macos.tar.gz"
    ;;
  *)
    echo "Unsupported platform $(uname -s) $(uname -m); use Linux, macOS or WSL." >&2
    exit 1
    ;;
esac

GRAALVM_URL="${GRAALVM_URL:-https://download.oracle.com/graalvm/${GRAALVM_RELEASE}/latest/${GRAALVM_FILE}}"
BINARYEN_URL="${BINARYEN_URL:-https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/${BINARYEN_FILE}}"

mkdir -p "$WORK/graalvm" "$WORK/binaryen" "$WORK/downloads"

GRAALVM_HOME="$(find "$WORK/graalvm" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -n 1 || true)"
if [ -z "$GRAALVM_HOME" ] || [ ! -x "$GRAALVM_HOME/bin/native-image" ]; then
  echo "downloading Oracle GraalVM: $GRAALVM_URL"
  curl -L --retry 8 --retry-all-errors --retry-delay 3 \
    -o "$WORK/downloads/$GRAALVM_FILE" "$GRAALVM_URL"
  tar -xzf "$WORK/downloads/$GRAALVM_FILE" -C "$WORK/graalvm"
  GRAALVM_HOME="$(find "$WORK/graalvm" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
fi

BINARYEN_HOME="$(find "$WORK/binaryen" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -n 1 || true)"
if [ -z "$BINARYEN_HOME" ] || [ ! -x "$BINARYEN_HOME/bin/wasm-as" ]; then
  echo "downloading Binaryen: $BINARYEN_URL"
  curl -L --retry 8 --retry-all-errors --retry-delay 3 \
    -o "$WORK/downloads/$BINARYEN_FILE" "$BINARYEN_URL"
  curl -L --retry 4 --retry-all-errors \
    -o "$WORK/downloads/$BINARYEN_FILE.sha256" "$BINARYEN_URL.sha256"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$WORK/downloads" && sha256sum -c "$BINARYEN_FILE.sha256")
  else
    (cd "$WORK/downloads" && shasum -a 256 -c "$BINARYEN_FILE.sha256")
  fi
  tar -xzf "$WORK/downloads/$BINARYEN_FILE" -C "$WORK/binaryen"
  BINARYEN_HOME="$(find "$WORK/binaryen" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
fi

if [ ! -x "$BINARYEN_HOME/bin/wasm-as" ]; then
  echo "Binaryen extraction did not produce bin/wasm-as." >&2
  exit 1
fi

echo
echo "export GRAALVM_HOME=\"$GRAALVM_HOME\""
echo "export BINARYEN_HOME=\"$BINARYEN_HOME\""
echo "export PATH=\"$BINARYEN_HOME/bin:$GRAALVM_HOME/bin:\$PATH\""
echo
"$GRAALVM_HOME/bin/native-image" --version | head -n 1
"$BINARYEN_HOME/bin/wasm-as" --version | head -n 1
