#!/usr/bin/env bash
# Builds the real Kotlin compiler image and stdlib from the upstream host.
# The Analysis API image is intentionally not built: this package only compiles.
#
# Linux/WSL:
#   bash scripts/build-toolchain.sh
#   HEAP=6g GRADLE_HEAP=1536m GRADLE_WORKERS=2 bash scripts/build-toolchain.sh
#
# Output: .toolchain/compilerDist (generated worker + wasm + stdlib + build-info).
# Then:   node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${WORK_DIR:-$ROOT/.toolchain}"
REPO="${UPSTREAM_REPO:-https://github.com/alex28sh/wasm-code-editor.git}"
COMMIT="${UPSTREAM_COMMIT:-02a8916077b1ea697808f258dee5a5406c887774}"
UPSTREAM_DIR="${UPSTREAM_DIR:-$WORK/wasm-code-editor}"
DIST="${DIST_DIR:-$WORK/compilerDist}"
HEAP="${HEAP:-8g}"
GRADLE_HEAP="${GRADLE_HEAP:-1024m}"
GRADLE_WORKERS="${GRADLE_WORKERS:-2}"
KOTLIN="${KOTLIN_VERSION:-}"

if [ -z "${GRAALVM_HOME:-}" ]; then
  GRAALVM_HOME="$(find "$WORK/graalvm" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -n 1 || true)"
fi
if [ -z "${GRAALVM_HOME:-}" ] || [ ! -x "$GRAALVM_HOME/bin/native-image" ]; then
  echo "Oracle GraalVM not found. Set GRAALVM_HOME or run scripts/fetch-toolchain.sh." >&2
  exit 1
fi

if [ -z "${BINARYEN_HOME:-}" ]; then
  BINARYEN_HOME="$(find "$WORK/binaryen" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -n 1 || true)"
fi
if [ -n "${BINARYEN_HOME:-}" ]; then
  PATH="$BINARYEN_HOME/bin:$PATH"
fi
export PATH="$GRAALVM_HOME/bin:$PATH"
if ! command -v wasm-as >/dev/null 2>&1; then
  echo "wasm-as not found. Install Binaryen (133 or newer) or run scripts/fetch-toolchain.sh." >&2
  exit 1
fi

export JAVA_HOME="$GRAALVM_HOME"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$WORK/gradle-home}"

if grep -qi microsoft /proc/version 2>/dev/null; then
  mem_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
  if [ "$mem_kb" -lt 11000000 ]; then
    echo "warning: WSL has $((mem_kb / 1024 / 1024)) GiB; the final image stage needs about 12 GiB." >&2
    echo "Set [wsl2] memory=12GB in %USERPROFILE%\\.wslconfig, run 'wsl --shutdown', and retry." >&2
  fi
fi

if [ ! -d "$UPSTREAM_DIR/.git" ]; then
  mkdir -p "$(dirname "$UPSTREAM_DIR")"
  git clone "$REPO" "$UPSTREAM_DIR"
fi
cd "$UPSTREAM_DIR"
git fetch --all --quiet
git checkout --force "$COMMIT"
git clean -fdx -e .gradle >/dev/null 2>&1 || true

if [ -z "$KOTLIN" ]; then
  KOTLIN="$(sed -n 's/^kotlin = "\(.*\)"/\1/p' gradle/libs.versions.toml | head -n 1)"
fi
if [ -z "$KOTLIN" ]; then
  echo "Could not determine the Kotlin version; set KOTLIN_VERSION." >&2
  exit 1
fi

sed -i.bak "s/\"-J-Xmx24g\"/\"-J-Xmx${HEAP}\"/" compiler-host/build.gradle.kts
rm -f compiler-host/build.gradle.kts.bak
if ! grep -q -- "\"-J-Xmx${HEAP}\"" compiler-host/build.gradle.kts; then
  echo "Could not patch the compiler image heap; upstream build.gradle.kts changed." >&2
  exit 1
fi

# GraalVM 25.0.4 treats the bare flag as a mainclass; forward it to the builder JVM.
if ! grep -q -- '-J--sun-misc-unsafe-memory-access=allow' compiler-host/build.gradle.kts; then
  sed -i.bak 's/--sun-misc-unsafe-memory-access=allow/-J--sun-misc-unsafe-memory-access=allow/' \
    compiler-host/build.gradle.kts
  rm -f compiler-host/build.gradle.kts.bak
fi

sed -i.bak "s/^kotlin = \".*\"/kotlin = \"${KOTLIN}\"/" gradle/libs.versions.toml
rm -f gradle/libs.versions.toml.bak
sed -i.bak "s/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx${GRADLE_HEAP}/" gradle.properties
rm -f gradle.properties.bak
sed -i.bak "s/^org.gradle.parallel=.*/org.gradle.parallel=false/" gradle.properties
rm -f gradle.properties.bak
grep -q '^kotlin.compiler.execution.strategy=' gradle.properties ||
  echo 'kotlin.compiler.execution.strategy=in-process' >> gradle.properties
printf 'graalvm.home=%s\n' "$GRAALVM_HOME" > local.properties

echo "Kotlin ${KOTLIN}"
"$GRAALVM_HOME/bin/native-image" --version | head -n 1
echo "wasm-as: $(wasm-as --version | head -n 1)"
echo "heap: ${HEAP}; Gradle heap: ${GRADLE_HEAP}; workers: ${GRADLE_WORKERS}"

bash gradlew --no-daemon --max-workers="$GRADLE_WORKERS" --console=plain \
  :compiler-host:stdlibArchive :compiler-host:webImage

WEB="$UPSTREAM_DIR/compiler-host/build/webImage"
STDLIB="$UPSTREAM_DIR/compiler-host/build/stdlib/kotlin-stdlib-wasm-js.bin"
GLUE="$UPSTREAM_DIR/compiler-host/src/main/js/worker-glue.js"
for file in "$WEB/kotlin-compiler.js" "$WEB/kotlin-compiler.js.wasm" "$STDLIB" "$GLUE"; do
  if [ ! -f "$file" ]; then
    echo "missing build output: $file" >&2
    exit 1
  fi
done

rm -rf "$DIST"
mkdir -p "$DIST"
cat "$WEB/kotlin-compiler.js" "$GLUE" > "$DIST/kotlin-compiler-worker.js"
cp "$WEB/kotlin-compiler.js.wasm" "$DIST/kotlin-compiler-worker.js.wasm"
cp "$STDLIB" "$DIST/kotlin-stdlib-wasm-js.bin"
# The upstream smoke test requires this file from a directory that may sit under
# a "type": "module" package.
printf '{"type":"commonjs"}\n' > "$DIST/package.json"

GRAALVM_VERSION="$("$GRAALVM_HOME/bin/native-image" --version 2>/dev/null | head -n 1)"
BINARYEN_VERSION="$(wasm-as --version 2>/dev/null | head -n 1)"
BUILT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$DIST/build-info.json" <<EOF
{
  "compilerVersion": "${KOTLIN}",
  "upstream": {
    "repository": "${REPO}",
    "commit": "${COMMIT}"
  },
  "graalvm": "${GRAALVM_VERSION}",
  "binaryen": "${BINARYEN_VERSION}",
  "tasks": [
    ":compiler-host:stdlibArchive",
    ":compiler-host:webImage"
  ],
  "heap": "${HEAP}",
  "built": "${BUILT}"
}
EOF

if command -v node >/dev/null 2>&1; then
  echo "smoke testing the image under Node..."
  node --experimental-wasm-exnref \
    "$UPSTREAM_DIR/compiler-host/src/test/js/image-test.cjs" "$DIST"
else
  echo "node not found; skipping the image smoke test (run npm test after vendoring)"
fi

echo
echo "compilerDist: $DIST"
echo "vendor: node scripts/toolchain.mjs vendor --compiler-dist \"$DIST\""
