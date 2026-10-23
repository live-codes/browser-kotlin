# Building the real Kotlin compiler image

This package does not need a prebuilt compiler image. The scripts in this
directory build the compiler host from
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor),
using Oracle GraalVM Web Image, and vendor the result into `assets/`.

There are two targets:

- **`wasm`** (default): the Kotlin/Wasm compiler backend and the Wasm stdlib.
- **`js`**: the Kotlin/JS backend and the Kotlin/JS stdlib. The emitted program
  is a standalone `main.mjs`; the compiler itself is still a GraalVM image.

The Analysis API image is deliberately **not** built. This package compiles and
runs Kotlin; inline completion/diagnostics from the Analysis API are out of
scope. That halves the build and avoids the 28 GB-heap image.

## What is built

| Output | Source | Used as |
| --- | --- | --- |
| `kotlin-compiler.js` | `:compiler-host:webImage` | `assets/kotlin-compiler-image.js` |
| `kotlin-compiler.js.wasm` | `:compiler-host:webImage` | gzipped and split into `assets/kotlin-compiler-worker.js.wasm.gz.*` |
| `kotlin-stdlib-wasm-js.bin` | `:compiler-host:stdlibArchive` | `assets/kotlin-stdlib-wasm-js.bin.gz` |
| `kotlin-compiler-js.js` | `:compiler-host:jsWebImage` | `assets/js/kotlin-compiler-image.js` |
| `kotlin-compiler-js.js.wasm` | `:compiler-host:jsWebImage` | gzipped and split into `assets/js/kotlin-compiler-worker.js.wasm.gz.*` |
| `kotlin-stdlib-js.bin` | `:compiler-host:jsStdlibArchive` | `assets/js/kotlin-stdlib-js.bin.gz` |

`webImage` depends on `patchJars`, `argumentsMetadata` and `jvmScenario`;
`jsWebImage` depends on the same plus `jsJvmScenario` and `jsStdlibArchive`.
Those tasks run automatically. The compiler worker is assembled as:

```text
kotlin-compiler.js + compiler-host/src/main/js/worker-glue.js
  -> kotlin-compiler-worker.js (staging; vendored as kotlin-compiler-image.js)
```

The package's wrapper keeps the upstream worker in `kotlin-compiler-image.js`
and gives the actual worker the wrapper's name, so the generated loader's
`self.location.href + ".wasm"` request is intercepted and decompressed.

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Oracle GraalVM | 25.0.4+ | Web Image (`native-image --tool:svm-wasm`). GraalVM Community does not include it. Tested with 25.0.4+7.1. |
| Binaryen | 133+ | `wasm-as` must support WasmGC. Ubuntu 24.04's Binaryen 108 fails with `unknown heaptype kind`. |
| Node.js | 22+ | Vendoring, receipts and tests. The build itself does not require Node. |
| Git | any recent | The build clones the pinned upstream commit. |
| RAM | 12 GB+ | The upstream default is `-J-Xmx24g`; this package defaults to `HEAP=8g`. 6 GB runs out of memory while creating the image, and 8 GB in a 9.7 GB VM got through the wasm but was killed during assembly. 12 GB WSL with 8 GB heap produced the committed image. |
| Disk | 3 GB free | Gradle caches, Kotlin compiler jars, image and `.wat` output. |

Linux or WSL is recommended. On native Windows, GraalVM Native Image first looks
for Visual Studio 2022 Build Tools 17.6+ (`vswhere.exe`, MSVC); the upstream
`graalvmTool` helper also expects extensionless commands, so native Windows is
not validated here. WSL avoids both issues.

## Quick start (Linux / WSL)

From `packages/kotlin-wasm`:

```sh
bash scripts/fetch-toolchain.sh --accept-license

# Wasm target (default)
HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 bash scripts/build-toolchain.sh
node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist

# JS target
TARGET=js HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 bash scripts/build-toolchain.sh
node scripts/toolchain.mjs vendor --target js --compiler-dist .toolchain/js-compilerDist

npm test
```

On Windows/WSL, add this to `%USERPROFILE%\.wslconfig` and run `wsl --shutdown`
before building:

```ini
[wsl2]
memory=12GB
```

The build script warns when WSL has less than 11 GiB.

`fetch-toolchain.sh` downloads Oracle GraalVM and Binaryen into `.toolchain/`
and prints the `GRAALVM_HOME` / `BINARYEN_HOME` / `PATH` exports. If they are
already installed, set the variables instead:

```sh
export GRAALVM_HOME=/path/to/graalvm
export BINARYEN_HOME=/path/to/binaryen
```

If the checkout is on `/mnt/d` and you want the build on the Linux filesystem:

```sh
WORK_DIR="$HOME/kotlin-wasm-build" \
DIST_DIR="/mnt/d/DevWork/live-codes/browser-kotlin/packages/kotlin-wasm/.toolchain/compilerDist" \
HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 \
bash scripts/build-toolchain.sh

# JS target, with the output on the Windows filesystem for vendoring
TARGET=js WORK_DIR="$HOME/kotlin-wasm-build" \
DIST_DIR="/mnt/d/DevWork/live-codes/browser-kotlin/packages/kotlin-wasm/.toolchain/js-compilerDist" \
HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 \
bash scripts/build-toolchain.sh
```

The build script prints the staging directory. For the Wasm target it runs the
upstream `image-test.cjs` if Node is available; the JS target is covered by
`npm test` and `example/js.html` after vendoring.

## What the build script changes

The upstream checkout is disposable and is reset before every build. The script:

1. Clones the pinned `UPSTREAM_COMMIT` and writes `local.properties` with
   `graalvm.home`.
2. Replaces the compiler image heap `-J-Xmx24g` with `-J-Xmx$HEAP`.
   The Analysis API's `28g` line is left alone because that image is not built.
3. Rewrites `--sun-misc-unsafe-memory-access=allow` to
   `-J--sun-misc-unsafe-memory-access=allow`. GraalVM 25.0.4 treats the bare
   flag as a main class; forwarding it to the builder JVM works on 25.0.4 and
   later.
4. Sets `org.gradle.jvmargs=-Xmx$GRADLE_HEAP`, disables parallel project
   execution and runs Kotlin compilation in-process to keep the memory ceiling.
5. Optionally replaces the `kotlin = "..."` version in
   `gradle/libs.versions.toml` when `KOTLIN_VERSION` is set.
6. For `TARGET=js`, copies `scripts/js-target/JsCompilerHost.kt`,
   `JsJvmScenario.kt` and `WebMainJs.java` into the checkout, and appends
   `scripts/js-target/js-target.gradle.kts`. That adds the JS stdlib, scenario
   and `jsWebImage` tasks.
7. Runs the target's Gradle tasks:

   ```sh
   # wasm
   bash gradlew --no-daemon --max-workers="$GRADLE_WORKERS" --console=plain \
     :compiler-host:stdlibArchive :compiler-host:webImage

   # js
   bash gradlew --no-daemon --max-workers="$GRADLE_WORKERS" --console=plain \
     -PjsImage.heap="$HEAP" :compiler-host:jsWebImage
   ```

8. Assembles `.toolchain/compilerDist` (Wasm) or
   `.toolchain/js-compilerDist` (JS) and writes `build-info.json` with the
   Kotlin version, upstream repository/commit, GraalVM and Binaryen versions,
   task list, heap and UTC build timestamp.

For the JS target, the image is still a GraalVM Web Image; the emitted program
is JavaScript. The JS compiler image is ~75 MB raw / ~29.3 MB gz, and the JS
stdlib archive is ~10.5 MB raw / ~3.3 MB gz.

Do not use `:compiler-host:compilerDist` for this package: it depends on both
`webImage` and the 75 MB `analysisImage`, and would need the 28 GB-heap build.

## Vendoring

```sh
node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
node scripts/toolchain.mjs vendor --target js --compiler-dist .toolchain/js-compilerDist
node scripts/toolchain.mjs check
npm test
```

`vendor`:

- writes `assets/kotlin-compiler-image.js` (generated worker + glue),
- gzips the image and splits it into parts under jsDelivr's 20 MB limit,
- gzips the stdlib,
- rewrites `assets/kotlin-assets.json`,
- rewrites `toolchain.lock.json` (adds `compiler.build`, removes `prebuilt`,
  records every part's SHA-256),
- updates `COMPILER_VERSION` in `src/language.js`,
- regenerates `src/asset-receipts.js` and validates the result.

With `--target js`, the same steps write `assets/js/`, the JS stdlib and a
`javascript` block in `toolchain.lock.json`. The JS compiler image is a
GraalVM image too; only the emitted program is JavaScript.

You can vendor an upstream `:compiler-host:compilerDist` with
`--compiler-dist <dir>`, or let the script assemble from a build directory:

```sh
node scripts/toolchain.mjs vendor \
  --build-dir .toolchain/wasm-code-editor/compiler-host/build \
  --compiler-version 2.5.0-dev-9169
```

## Upgrading Kotlin

1. Pick a Kotlin version that the upstream host can compile against. The
   current build uses `2.5.0-dev-9169` from
   `https://packages.jetbrains.team/maven/p/kt/bootstrap`. A stable release may
   need a different repository or upstream changes.
2. Build with the version override:

   ```sh
   KOTLIN_VERSION=2.6.0 HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 \
     bash scripts/build-toolchain.sh
   KOTLIN_VERSION=2.6.0 TARGET=js HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 \
     bash scripts/build-toolchain.sh
   ```

   If the Kotlin compiler's internals changed, update the upstream host first
   and pass its new commit:

   ```sh
   UPSTREAM_COMMIT=<new-commit> KOTLIN_VERSION=2.6.0 ... bash scripts/build-toolchain.sh
   ```

   The script fails loudly if the upstream heap or unsafe-memory lines changed,
   so the patches cannot silently drift.
3. Vendor both results and run the full suite:

   ```sh
   node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
   node scripts/toolchain.mjs vendor --target js --compiler-dist .toolchain/js-compilerDist
   npm test
   node ../../serve.mjs 8001   # browser smoke tests (example/ and example/js.html)
   ```

4. Commit `assets/`, `assets/js/`, `src/language.js`, `src/asset-receipts.js` and
   `toolchain.lock.json` together. Update `FINDINGS.md`, `README.md`,
   `assets/README.md` and `THIRD-PARTY-NOTICES.md` if the version, sizes or
   provenance changed.

### Upgrade checklist

- [ ] chosen Kotlin version / upstream commit
- [ ] `scripts/build-toolchain.sh` completed for `wasm`
- [ ] `TARGET=js scripts/build-toolchain.sh` completed
- [ ] upstream image smoke test or package tests passed
- [ ] `scripts/toolchain.mjs vendor` completed for both targets
- [ ] `scripts/toolchain.mjs check` passes
- [ ] `npm test` passes (Wasm and JS)
- [ ] browser examples compile and run (`example/` and `example/js.html`)
- [ ] `toolchain.lock.json` and `src/asset-receipts.js` are committed
- [ ] docs/notices updated if required

## Provenance

`toolchain.lock.json` is the single source of truth. A source build records:

```json
"compiler": {
  "version": "2.5.0-dev-9169",
  "host": { "repository": "...", "commit": "..." },
  "build": {
    "repository": "...",
    "commit": "...",
    "graalvm": "native-image 25.0.4 ...",
    "binaryen": "wasm-as version 133 ...",
    "tasks": [":compiler-host:stdlibArchive", ":compiler-host:webImage"],
    "heap": "8g",
    "built": "2026-..."
  }
},
"javascript": {
  "version": "2.5.0-dev-9169",
  "host": { "repository": "...", "commit": "..." },
  "build": {
    "tasks": [":compiler-host:jsJvmScenario", ":compiler-host:jsWebImage"],
    "heap": "8g",
    "built": "2026-..."
  },
  "assets": { "...": "same shape as compiler.assets" }
}
```

The assets are still committed so a clone can run without building. Only the
toolchain downloads and upstream checkout are ignored by git (`.toolchain/`).

## Licensing

Building the image yourself improves provenance but does not change the
licences:

- This package's own code is Apache-2.0, the same license as the Kotlin compiler.
- The Kotlin compiler, the Kotlin/Wasm stdlib and the Kotlin/JS stdlib are
  Apache-2.0.
- Both generated images and loaders (Wasm and JS targets) embed GraalVM runtime
  code and are governed by the GraalVM Free Terms and Conditions (GFTC). The
  GFTC, Oracle's NOTICE and the distribution's license-information manual are
  reproduced in [`licenses/`](licenses/). Review those terms before
  redistributing the committed assets.
- Binaryen is Apache-2.0 and is a build-time tool; it is not shipped.

See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md), [`LICENSE`](LICENSE),
[`NOTICE`](NOTICE) and [`licenses/`](licenses/).

## Troubleshooting

**`wasm-as` not found** — install Binaryen and put `bin/` on `PATH`, or run
`scripts/fetch-toolchain.sh --accept-license`.

**`unknown heaptype kind` from `wasm-as`** — Binaryen is too old. Use 133+.

**`--sun-misc-unsafe-memory-access=allow is not a valid mainclass`** — GraalVM
25.0.4's Native Image does not accept the bare flag. The build script rewrites
it to `-J--sun-misc-unsafe-memory-access=allow`.

**`vswhere.exe` / Visual Studio** — native Windows Native Image needs Visual
Studio 2022 Build Tools 17.6+. Use WSL if you do not want to install it.

**Out of memory / killed** — raise `HEAP` and the WSL memory limit, close other
workloads, or build on a machine with 16 GB+ free. The committed build used
`HEAP=8g` in a 12 GB WSL VM (4 GB swap); 6 GB OOMs in the final image stage.
The upstream defaults are 24 GB for the compiler image and 28 GB for the
Analysis API image.

**`Filename too long` on Windows** — clone with
`git -c core.longpaths=true clone ...`, or build in WSL.

**Node test fails with a Wasm exception-handling error** — the compiler image
(for both targets) needs `--experimental-wasm-exnref`; `npm test` already passes
it.

**The JS target emits a klib instead of JavaScript** — the Kotlin/JS compiler
needs the two-pass build: a klib, then `-Xinclude=<klib> -Xir-produce-js
-module-kind es`. The `JsCompilerHost.kt` in `scripts/js-target/` does this; do
not pass `-Xir-produce-js` without `-Xinclude`.
