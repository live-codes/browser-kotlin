# FINDINGS — Kotlin in the browser

This is the technical record for `live-codes/browser-kotlin`: two in-browser Kotlin
demos, the real-K2 npm package built from them, what was measured, what was
verified, what is still blocked, and exactly what the LiveCodes integration
needs.

Status: the demos and `@live-codes/kotlin-wasm@0.1.0` are code-complete and
tested. The package is **not published**. Publishing is blocked only by the
redistribution terms of the GraalVM image assets. No LiveCodes changes have been
made yet.

---

## 1. Scope and deliverables

| Deliverable | Path | State |
| --- | --- | --- |
| minikotlin demo | [`index.html`](index.html), [`runner.js`](runner.js) | working |
| real-K2 demo | [`real.html`](real.html) | working |
| npm package | [`packages/kotlin-wasm`](packages/kotlin-wasm) | working, unpublished |
| static server | [`serve.mjs`](serve.mjs) | working |
| minikotlin smoke test | [`test/smoke.mjs`](test/smoke.mjs) | passing |
| package tests | `packages/kotlin-wasm/test/*.test.js` | 18/18 passing (Wasm + JS) |
| toolchain build/upgrade | [`packages/kotlin-wasm/scripts`](packages/kotlin-wasm/scripts), [`TOOLCHAIN.md`](packages/kotlin-wasm/TOOLCHAIN.md) | working |
| technical record | this file | — |

Repository: <https://github.com/live-codes/browser-kotlin> (remote configured,
nothing pushed).

Key commits:

| Commit | What |
| --- | --- |
| `fdcf729` | minikotlin proof of concept |
| `328f93a` | real-K2 demo and vendored assets |
| `1cb3e7b` | gzip the real assets |
| `0e11902` | `@live-codes/kotlin-wasm` package |
| `dcc0c06` | LF/binary `.gitattributes` |
| `3b0a6db` | `createCompiler(options)` and stdin prelude |
| `7bc1ba0` | Apache-2.0 license iteration |
| `f296025` | repository URL metadata |
| `3c3aca1` | `bin` fix and `toolchain.lock.json` |
| `5e0a13b` | MIT license iteration (later reverted to Apache-2.0) |

---

## 2. Repository layout

```
browser-kotlin/
  index.html                 minikotlin demo
  runner.js                  minikotlin module worker
  real.html                  real-K2 demo
  serve.mjs                  static server, application/wasm, CORS
  README.md
  FINDINGS.md                this file
  .gitattributes             LF for text, binary for wasm/gz/bin
  package.json               root PoC scripts
  vendor/minikotlin/         minikotlin compiler + host runtimes
  packages/kotlin-wasm/      @live-codes/kotlin-wasm
    assets/                  compiler image, wrapper, gz parts, manifest
    bin/copy-assets.mjs      verifies and copies assets
    dist/kotlin-wasm.global.js  committed IIFE build (14.5 KB)
    src/                     browser/Node engines, API, stdin prelude
    scripts/                 build IIFE, toolchain build/vendor, receipts, js-target
    test/                    18 Node tests
    example/                 ESM and classic-worker browser checks
    toolchain.lock.json      upstream commits and every asset hash
    TOOLCHAIN.md             build/upgrade process
    LICENSE                  Apache-2.0 for this package's code
    NOTICE                   Kotlin / GraalVM attribution
    THIRD-PARTY-NOTICES.md   Kotlin / GraalVM attribution and caveat
    licenses/                Oracle GraalVM GFTC, NOTICE and license manual
```

---

## 3. Part 1 — minikotlin demo

### 3.1 What it is

[minikotlin](https://minikotlin.run) is a from-scratch Kotlin→WasmGC compiler
written in C and compiled to WebAssembly with Emscripten. The vendored build
reports `mkc_version() == "0.1.0"`.

Assets (`vendor/minikotlin/`):

| File | Bytes | Purpose |
| --- | ---: | --- |
| `minikotlin.wasm` | 1,906,628 | the compiler |
| `minikotlin.js` | 65,951 | Emscripten loader |
| `engine/host-imports.mjs` | 42,267 | every `env.__*` import a program expects |
| `engine/js-runtime.mjs` | 30,449 | JS interop implementation |
| `engine/math-runtime.mjs` + `kotlin_math_rt.wasm` | 1,601 + 28,776 | `kotlin.math` |
| `engine/char-runtime.mjs` + `kotlin_char_rt.wasm` | 3,078 + 76,009 | Char classification |

### 3.2 Execution path

`index.html` starts `runner.js` as a module Worker. The worker fetches
`minikotlin.js`, appends `export default createMinikotlin`, imports it from a
Blob URL, and drives the raw C API:

```
mkc_compile_buffer(source, filename) → wasm bytes + diagnostics
  ↓
WebAssembly.instantiate(wasm, { env })
  ↓
__mk_init() → main()
  ↓
env.__println / __print → postMessage → output pane
```

Why a Blob import: the Emscripten file is a classic script that assigns a global
(`createMinikotlin`); a Worker has no `<script>` tag. Appending one export keeps
the vendored file untouched.

### 3.3 What works

Verified in Chromium:

| Program | Result |
| --- | --- |
| data class + list + string templates + loop | correct, ~11 KB wasm |
| `open`/`override` inheritance | correct |
| sealed classes + `when` | correct |
| collections (`sorted`/`filter`/`map`/`sum`/`max`) | correct |
| null safety (`toIntOrNull`, `?.let`, `?:`) | correct |
| `runBlocking` + `launch` + `delay` | `start / fast lane / slow lane / done` |
| unresolved identifier | diagnostics |
| `while (true) {}` | stopped at 15 s, worker replaced, next run works |

Compile is ~5–20 ms warm; the first run includes the 1.9 MB compiler load. The
program wasm is ~11 KB for hello.

### 3.4 Limits

- A language subset, not the official compiler.
- No stdin, no multi-file UI, no full stdlib.
- Compile is synchronous; an infinite program is only stopped by terminating
  the worker (15 s watchdog).
- No licence is published on `minikotlin.run` (checked 2026-10-21). The assets
  are vendored for evaluation only.
- Some diagnostics report line/column 0,0 (unresolved names).

---

## 4. Part 2 — the real Kotlin K2 compiler

### 4.1 Building it from source

The real K2 compiler is a JVM application. The only browser-runnable form found
is the **GraalVM Web Image** build from
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`compiler-host`): the published Kotlin compiler jars are compiled ahead of time
with Oracle GraalVM Web Image (`native-image --tool:svm-wasm`).

The first pass bootstrapped from a prebuilt image because this 16 GB machine had
no Oracle GraalVM and no local build pipeline. The committed assets are now
built from the pinned upstream source with the scripts in
`packages/kotlin-wasm/scripts/`; the prebuilt image is no longer shipped. The
full build/upgrade procedure is in
[`packages/kotlin-wasm/TOOLCHAIN.md`](packages/kotlin-wasm/TOOLCHAIN.md).

#### Toolchain and environment

| Part | Version |
| --- | --- |
| Oracle GraalVM | **25.0.4+7.1**, Web Image, built inside WSL2 |
| Binaryen | **133** (`wasm-as`; 108 rejects WasmGC with `unknown heaptype kind`) |
| OS | Ubuntu 24.04 on WSL2, 12 cores, 12 GB RAM + 4 GB swap |
| Gradle | 9.7.1 wrapper; Kotlin **2.5.0-dev-9169** |
| Heap | `native-image -J-Xmx8g`, Gradle `-Xmx1024m`, 2 workers |
| compiler host | `alex28sh/wasm-code-editor@02a8916077b1ea697808f258dee5a5406c887774` |
| built | `2026-10-23T05:46:56Z` |

The upstream README asks for Oracle GraalVM 25.1+ and gives `native-image` 24–28
GB heap. 25.0.4 also ships the Web Image tool; it only needs
`--sun-misc-unsafe-memory-access=allow` forwarded to the builder JVM as
`-J--sun-misc-unsafe-memory-access=allow`. Only the compiler image and stdlib
are built; the 75 MB Analysis API image is deliberately omitted.

#### What the scripts do

`fetch-toolchain.sh` downloads Oracle GraalVM and Binaryen into `.toolchain/`
(`--accept-license` required). `build-toolchain.sh`:

1. clones the pinned upstream commit and writes `local.properties` with
   `graalvm.home`;
2. replaces `-J-Xmx24g` with `-J-Xmx$HEAP` (default `8g`);
3. rewrites the bare unsafe-memory flag to the `-J` form;
4. sets `org.gradle.jvmargs`, disables parallel projects and runs Kotlin
   compilation in-process;
5. runs only `:compiler-host:stdlibArchive :compiler-host:webImage`;
6. assembles `compilerDist/` (generated worker + glue, `.js.wasm`, stdlib) and
   writes `build-info.json`.

`node scripts/toolchain.mjs vendor --compiler-dist ...` then gzips/splits the
image, updates `assets/`, `kotlin-assets.json`, `toolchain.lock.json`,
`COMPILER_VERSION` and the receipts.

#### Memory findings

The final image stage is the constraint on a 16 GB machine:

- **6 GB heap / 7.6 GB WSL** reached `[8/8] Creating image` but was OOM-killed;
- **8 GB heap / 9.7 GB WSL** produced a valid 70 MB `.wasm`, but the
  `native-image` parent was killed while `wasm-as` parsed the 2.3 GB `.wat`, so
  the generated loader was never written;
- **8 GB heap / 12 GB WSL + 4 GB swap** succeeded (`BUILD SUCCESSFUL`). Stage 8
  writes a 2.3 GB `.wat`; `wasm-as` peaks around 3.5 GB alongside the 8 GB
  builder heap, so ~12 GB of VM memory is required.

#### Result

| Part | Source build |
| --- | --- |
| compiler image | 72,602,076 B raw, 28,503,583 B gz in two parts |
| stdlib | 12,005,328 B raw, 3,811,357 B gz |
| generated host + glue | 97,501 B (`kotlin-compiler-image.js`) |
| manifest | 467 B |
| package tests | 18/18 pass on Node 24 with `--experimental-wasm-exnref` (Wasm and JS) |

The image SHA-256 is `90ed9c9b12d3c5cbcde987d6f8a3b2e8cc8b51840e0f5767af0cbc79f31c6d91`;
the stdlib is unchanged from the prebuilt bootstrap
(`1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21`). Every
compressed part and the generated host are pinned in `toolchain.lock.json`.

### 4.2 Assets and transport

The compiler and stdlib are vendored **gzipped**; the Analysis API is
deliberately omitted.

| Asset | Compressed | Inflated |
| --- | ---: | ---: |
| compiler image | 28,503,583 B, split into `.gz.0` 14,251,792 + `.gz.1` 14,251,791 | 72,602,076 B |
| Wasm stdlib | 3,811,357 B (`kotlin-stdlib-wasm-js.bin.gz`) | 12,005,328 B |
| generated host | 97,501 B (`kotlin-compiler-image.js`) | — |
| wrapper | 4,020 B (`kotlin-compiler-worker.js`) | — |
| manifest | 467 B (`kotlin-assets.json`) | — |
| **total** | **32,416,928 B (30.9 MiB)** | **84,607,404 B (80.7 MiB)** |

The compiler gzip is split so **every file is under jsDelivr's 20 MB per-file
cap**. The stdlib keeps its upstream SHA-256; the image hash is from this build:

```
90ed9c9b12d3c5cbcde987d6f8a3b2e8cc8b51840e0f5767af0cbc79f31c6d91
  72,602,076 B  compiler image (source build)

1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21
  12,005,328 B  stdlib archive
```

`assets/kotlin-assets.json` records the part names, compressed size and the
inflated size/hash. `toolchain.lock.json` additionally pins every compressed
part, the generated host, the wrapper, the manifest and the upstream commits.
`npm run assets` fails if any of these disagree.

### 4.3 Decompression wrapper

The generated GraalVM worker requests:

- `self.location.href + ".wasm"` — the compiler image;
- `./kotlin-stdlib-wasm-js.bin` — the stdlib.

Both requests are intercepted by a small classic-worker wrapper
(`assets/kotlin-compiler-worker.js`) **before** it imports the generated image.
The wrapper:

1. reads `kotlin-assets.json`;
2. fetches the compiler parts (sequentially, posting `asset-progress` messages);
3. concatenates them into a `Blob`;
4. checks the gzip magic (`1f 8b`);
5. returns a `Response` whose body is
   `blob.stream().pipeThrough(new DecompressionStream('gzip'))`;
6. does the same for the stdlib;
7. then `importScripts('./kotlin-compiler-image.js')`.

The generated image is untouched. If a host serves a `.gz` with
`Content-Encoding: gzip`, the wrapper sees the inflated bytes (no gzip magic)
and returns them as-is rather than double-decompressing.

### 4.4 Compiler protocol

The generated image publishes `globalThis.kotlinCompilerHost` and answers
messages:

```js
worker.postMessage({ id, operation: 'compile', text: source, argument: '' });
// → { id, answer: '{"ok":true,"milliseconds":...,"diagnostics":[...],"files":[...]}' }
```

`files` are base64:

- `main.wasm`
- `main.mjs`
- `main.import-object.mjs`
- `main.js-builtins.mjs`

`diagnostics` are `{ severity: 'ERROR'|'WARNING', message, from, to }` with
character offsets into the source. The compiler takes **one** source string.

### 4.5 Browser execution

`real.html` and the package's browser engine both run the generated program in
a **nested module Worker**:

1. decode the four files;
2. create Blob URLs for `main.wasm`, `main.js-builtins.mjs`,
   `main.import-object.mjs`, `main.mjs`;
3. rewrite the generated relative imports to those Blob URLs, and rewrite
   `new URL('./main.wasm', import.meta.url).href` to the wasm Blob URL;
4. import `main.mjs` in the program worker;
5. override `console.log/info/debug` → stdout with newline,
   `console.warn/error` → stderr with newline, and define `globalThis.write` for
   `print`;
6. terminate the program worker on a timeout (15 s in the package).

Output is line-oriented in the same way the upstream editor treats it, but the
package does better: the generated import object is

```js
'kotlin.io.printImpl'  : (message) => typeof write !== 'undefined' ? write(message) : console.log(message),
'kotlin.io.printlnImpl': (message) => console.log(message),
```

so defining `write` preserves the exact `print`/`println` distinction:
`print("a"); print("b"); println("c")` → `abc\n`, not `a\nb\nc\n`.

### 4.6 Node execution

Node cannot use the browser worker glue directly. `src/node/compiler-worker.mjs`
runs in a worker thread and:

1. reads `kotlin-assets.json`, concatenates and gunzips the compiler parts into
   a temp `compiler.wasm`;
2. reads `kotlin-compiler-image.js`, rewrites its final
   `GraalVM.run(load_cmd_args(),config)` to set
   `config.wasm_path = <temp wasm>`, writes a temp `.cjs` and `require`s it;
3. resets `process.argv` so the image sees no arguments;
4. waits for `globalThis.kotlinCompilerHost`;
5. gunzips the stdlib, base64-encodes it and calls
   `host.call('init', base64, '')`;
6. on `run`, calls `host.call('compile', source, '')`;
7. writes the four generated files to a temp run directory and imports
   `main.mjs` — Node's generated module reads `main.wasm` itself with
   `fs.readFileSync(import.meta.resolve('./main.wasm'))`;
8. captures `console.*` and `write`, then deletes the hook and the run
   directory.

Node requires **`--experimental-wasm-exnref`** (the compiler image uses
exception handling) and Node 22+. The worker inherits the parent's `execArgv`.
The package's `assertNode()` checks both.

Timeouts:

- compile: 180 s, then the record is stopped and recreated;
- program: 15 s default, enforced by the parent terminating the worker thread;
- a terminated record is recreated lazily on the next run.

### 4.7 Stdin

Kotlin/Wasm's stdlib has **no console input**:

- `readLine()` is unresolved;
- `readlnOrNull()` compiles but reads nothing (returns `null`);
- `readln()` compiles but throws
  `kotlin.UnsupportedOperationException: readln is not supported in Kotlin/Wasm`.

The package implements line-based stdin with a generated prelude:

```kotlin
@JsFun("() => globalThis.__liveCodesKotlinWasmReadLine()")
external fun __liveCodesKotlinWasmStdin(): String?

fun readlnOrNull(): String? = __liveCodesKotlinWasmStdin()
fun readLine(): String? = __liveCodesKotlinWasmStdin()
fun readln(): String = readlnOrNull() ?: throw NoSuchElementException("EOF")
```

- `prepareSource()` inserts the prelude after the leading `package`/`import`
  block (so imports stay first and the prelude stays in the same package).
- It is injected when input is non-empty **or** the source references
  `readln`/`readlnOrNull`/`readLine`.
- The program worker defines
  `globalThis.__liveCodesKotlinWasmReadLine` before importing `main.mjs`; the
  Node worker does the same from `inputLines`.
- Input is split on `\r\n`, `\n` or `\r`; a trailing newline does not add an
  empty line.
- `readlnOrNull()`/`readLine()` return `null` at EOF; `readln()` throws
  `NoSuchElementException("EOF")`.
- No-argument user definitions of those functions are detected and left alone.
- Diagnostics offsets from the modified source are mapped back to the caller's
  source by subtracting the prelude length; errors still point at the user's
  line/column.

It is **not interactive**: all input is available up front. `System.in` and
binary streams are not available.

### 4.8 Diagnostics

`compile` diagnostics are offsets. `formatDiagnostics()` turns them into
`Main.kt:line:column: error|warning: message`. On a successful compile the
package returns `errors: []` (warnings are dropped, matching the clang/dl
packages). Runtime failures and timeouts are also placed in `errors`,
`stderr` and `output`, with `exitCode: 1`; a compile failure has
`exitCode: null` and `runMs: null`.

### 4.9 Measured performance

On this machine (Windows, Chrome 156 headless, Node 24.4.1):

| | Browser | Node |
| --- | ---: | ---: |
| first compile after load | ~2.6–3.8 s | ~10–17 s |
| later compiles | ~1.1–1.9 s | ~1.5–7 s |
| program run | ~8–40 ms | ~20–80 ms |
| generated wasm (hello) | 64.2 KB | — |
| generated wasm (rich Pmf example) | 149.6 KB | — |

The first Node compile pays the image's JIT warm-up; `warm()` exists to move
that cost off the first user run. The browser `createCompiler()` already
compiles an empty program once, so the first user run is warm.

### 4.10 Limits of the real compiler

- Single file, standard library only; no Gradle, no other libraries.
- No stdin from the stdlib; the package's prelude is line-based and
  pre-supplied.
- No Analysis API image is shipped, so no semantic completion/inline analysis.
- Kotlin version is a **dev build** (`2.5.0-dev-9169`), not a stable release.
- The image is built by the scripts in `packages/kotlin-wasm/scripts/`; see
  [`packages/kotlin-wasm/TOOLCHAIN.md`](packages/kotlin-wasm/TOOLCHAIN.md). It is
  tied to the Oracle GraalVM/Binaryen versions in the lock.
- Oracle GraalVM terms still govern the generated image; see §11.

### 4.11 JS target — the second backend

K2 also ships a Kotlin/JS backend. The second target uses it without changing
the Wasm path:

- `scripts/js-target/JsCompilerHost.kt` calls `K2JSCompiler` with the
  `kotlin-stdlib-js` klib.
- Like the Wasm host, it is a **two-pass** build: first produce a klib
  (`-ir-output-dir <klib> -nopack source`), then produce JavaScript
  (`-ir-output-dir <js> -Xinclude=<klib> -Xir-produce-js -module-kind es
  -Xir-dce`). Passing `-Xir-produce-js` without `-Xinclude` fails with
  “not possible to produce a KLIB … and compile … JavaScript”.
- The output is one self-contained **`main.mjs`** (17,417 bytes for the hello
  sample). It contains the Kotlin/JS stdlib and polyfills; there is no wasm and
  no import object. A browser compile measured ~1.24 s, run ~6.4 ms; Node compiles
  took ~3.5 s, run ~69 ms.
- Kotlin/JS chooses its output stream at runtime: `isNode ?
  NodeJsOutput(process.stdout) : BufferedOutputToConsoleLog()`. The package
  captures `process.stdout`/`stderr` in the Node worker and overrides `console`
  in the browser program worker, so both produce the expected output.

The JS target is a second GraalVM image, built by `:compiler-host:jsJvmScenario`
and `:compiler-host:jsWebImage` (the JS agent metadata is recorded by the
scenario):

| Part | Size |
| --- | ---: |
| JS compiler image | 74,999,356 B raw / 29,322,529 B gz, split into 14,661,265 + 14,661,264 |
| Kotlin/JS stdlib archive | 10,493,338 B raw / 3,304,275 B gz |
| generated host | 97,505 B |
| wrapper | 4,020 B |
| manifest | 462 B |
| **total** | **32,728,791 B (31.2 MiB) gz / 85,492,694 B (81.5 MiB) inflated** |

The JS compiler image still needs WasmGC and exception handling; only the
emitted program is JavaScript. Build it with `TARGET=js
scripts/build-toolchain.sh`, vendor with `toolchain.mjs vendor --target js`, and
use `createCompiler({ target: 'js' })`.

The package exposes the JS output directly:

```js
const compiler = await createCompiler({ target: 'js' });
const compiled = await compiler.compile(source);
compiled.files[0] // { name: 'main.mjs', content: '…', encoding: 'utf8' }
```

`run()` compiles and executes the module in a worker; `compile()` is the path
for a host (LiveCodes) that wants to send the JavaScript to a result page and run
it there. JS stdin is not implemented; `capabilities.stdin` is false for this
target.

---

## 5. Part 3 — `@live-codes/kotlin-wasm`

### 5.1 API

Kotlin is the only language, so there is **no language argument**:

```js
import { createCompiler } from '@live-codes/kotlin-wasm';

const compiler = await createCompiler(); // Node: packaged assets
// Browser: await createCompiler({ baseUrl });
const result = await compiler.run(code, input);
compiler.dispose();
```

Options: `target` (`wasm` default, or `js`), `baseUrl` (required in a browser;
optional in Node), `onProgress`, `fileName`. `runOptions`: `timeoutMs` (program,
default 15000), `compileTimeoutMs` (default 180000), `fileName`.

`compile(code, { fileName, timeoutMs })` returns the emitted files without
running:

```ts
{
  ok: boolean;
  target: 'wasm' | 'js';
  compilerVersion: string;
  fileName: string;
  compileMs: number;
  errors: string[];
  files: { name: string; content: string; encoding: 'utf8' | 'base64' }[];
}
```

The JS target returns `main.mjs` as UTF-8 text; the Wasm target returns
`main.wasm` plus its JS glue as base64.

`run()` result:

```ts
{
  stdout: string;
  stderr: string;
  output: string;          // stdout + stderr in write order
  errors: string[];        // compiler diagnostics / runtime or timeout reason
  exitCode: number | null; // 0, 1, or null when compilation failed
  compileMs: number;
  runMs: number | null;
}
```

Also exported: `LANGUAGE_IDS = ['kotlin']`, `COMPILER_VERSION` (`2.5.0-dev-9169`),
`KotlinWasmError`, `KotlinUnsupportedError`. `capabilities` on a compiler is
`{ language, compiler, target, stdin, wasmGc, programWasmGc, analysis }`.
`stdin` is true only for the Wasm target; `programWasmGc` follows the target
while `wasmGc` remains true because the compiler image is Wasm.

The API accepts `input` as `string`, `Uint8Array` or `ArrayBuffer` for the Wasm
target. The JS target does not implement stdin yet.

### 5.2 Entries

| Entry | Path | Use |
| --- | --- | --- |
| Browser ESM | `src/index.js` | bundlers, module workers |
| Node | `src/index.node.js` | `node --experimental-wasm-exnref` |
| IIFE | `dist/kotlin-wasm.global.js` (14.5 KB minified) | classic workers, `importScripts` |
| CLI | `bin/copy-assets.mjs` | copy/verify assets |

The IIFE is committed; `prepack` rebuilds it with esbuild.

### 5.3 Browser engine

`src/browser.js`:

- Shared **record per `baseUrl`**, with refcount, progress sinks and a shared
  warm-up promise.
- Fetches the wrapper and image scripts, rewrites their paths, and starts the
  compiler from **Blob URLs**. A classic Worker must be same-origin, while the
  assets are commonly on jsDelivr; Blob URL workers solve that.
  - wrapper manifest URL → absolute `kotlin-assets.json`;
  - `importScripts('./kotlin-compiler-image.js')` → Blob image URL;
  - image startup → `config.wasm_path` = absolute compiler image URL;
  - image stdlib URL → absolute stdlib URL.
- The wrapper's `asset-progress` messages drive `onProgress`; a warm-up compile
  drives readiness.
- Each run compiles through the compiler worker. For `wasm`, it starts a fresh
  module program worker with the four generated files as Blob URLs. For `js`, it
  imports the single `main.mjs` Blob in a module worker; there is no wasm import
  object. `compile()` skips the program worker and returns the files.
- The target-specific base URL is the assets root; for `js` the engine appends
  `js/` before fetching the wrapper/manifest/image.
- Compile requests use a 180 s timeout; program runs use 15 s and terminate only
  the program worker, leaving the compiler warm.
- `dispose()` releases the record; the last reference terminates the compiler
  worker and revokes the Blob URLs.

Cross-origin assets were tested by serving the package on port 8002 and the page
on port 8001; the compiler loaded and ran.

### 5.4 Node engine

`src/node.js`:

- Packaged assets are used when `baseUrl` is omitted; a hosted `baseUrl` is
  downloaded to a temp directory.
- One worker thread per asset directory, shared by compilers, with a run queue.
- `createCompiler()` waits for the worker's `ready` (image + stdlib loaded);
  `warm()` compiles an empty program.
- `run` sends source + input lines; the worker compiles and runs in the same
  thread. The parent enforces compile/run timeouts and terminates/recreates the
  worker on program timeout.
- `assertNode()` requires Node >= 22 and the `--experimental-wasm-exnref` flag.

### 5.5 Asset receipts and copying

- `src/asset-receipts.js` is generated by `scripts/asset-receipts.mjs`.
- `npm run assets` verifies:
  - every asset matches its receipt;
  - the gzip parts concatenate to the manifest's compressed size;
  - inflating matches the pinned raw size + SHA-256 for the compiler and stdlib;
  - `toolchain.lock.json` agrees with the manifest, parts, host, wrapper and
    manifest hashes.
- `kotlin-wasm-copy-assets` verifies the receipts **before** copying, then
  writes `asset-receipts.json` beside the copied assets.
- No asset exceeds 20 MB (jsDelivr's per-file cap).

### 5.6 Tests and verification

Package tests (Node, `npm test`, 18/18: Wasm and JS):

1. every Wasm and JS asset matches its receipt;
2. every file is under 20 MB;
3. parts inflate to the pinned compiler and stdlib;
4. language/version/capabilities;
5. `createCompiler('kotlin')` is rejected (options only);
6. hello + exact `print`/`println`;
7. data classes + collections;
8. located type-error diagnostic;
9. runtime exception → exit 1;
10. stdin: `readln`, `readlnOrNull`, `readLine`;
11. stdin: CRLF and trailing newline;
12. stdin: `readln()` at EOF;
13. stdin: diagnostics map back to caller line with an import + prelude;
14. runaway program timeout and recovery.

Browser checks:

- ESM example (`example/index.html`) with stdin;
- classic-worker IIFE example (`example/iife.html`) with stdin;
- assets on a second origin;
- the root `real.html` demo.

Packaging checks:

- `npm pack --dry-run --ignore-scripts`: clean, 46 files, 65.1 MB, public
  access, `LICENSE` + `NOTICE` + `THIRD-PARTY-NOTICES.md` + `licenses/`, no
  warnings; the tarball contains both `assets/` and `assets/js/`;
- the packed tarball was installed into a clean project; the Node API ran with
  stdin and `npx kotlin-wasm-copy-assets --print-path` resolved the installed
  assets;
- a fresh clone ran the 14 tests and the IIFE example without a build step.

Not tested: Firefox, Safari, Node 22 specifically (Node 24.4.1 was used), or a
real LiveCodes sandbox.

### 5.7 Publish readiness

`npm view @live-codes/kotlin-wasm` returns E404, so `0.1.0` is available to a
publisher with `@live-codes` access.

One npm warning was found and fixed: `npm pkg fix` changed the bin target from
`./bin/copy-assets.mjs` to `bin/copy-assets.mjs`; the dry-run is now clean.

Remaining before `npm publish`:

1. **Clear the asset redistribution terms** (§11) — the only blocker.
2. Push the repo, create the GitHub repo and tag `v0.1.0`.
3. `npm login` with `@live-codes` scope access + 2FA.
4. Ensure devDependencies (esbuild) are installed, because `prepack` rebuilds
   `dist/`.
5. Run `npm publish` from `packages/kotlin-wasm`.

Optional: CI (test + pack), TypeScript declarations, `unpkg`/`jsdelivr` fields,
and publishing with `--provenance` from CI.

---

## 6. Verification summary

| Check | Result |
| --- | --- |
| minikotlin Node smoke test | pass |
| minikotlin browser examples | pass |
| real-K2 browser demo, all examples | pass |
| real-K2 diagnostics | pass, correct line/column |
| real-K2 infinite loop | 15 s timeout; compiler survives |
| package Node tests | 18/18 (Wasm + JS) |
| package ESM browser example + stdin | pass |
| package JS target example (compile + run) | pass |
| package IIFE classic worker + stdin | pass |
| cross-origin assets (two ports, CORS) | pass |
| fresh clone package tests | 18/18 (Wasm + JS) |
| packed tarball install + API + CLI | pass |
| `npm pack --dry-run` | 46 files, 65.1 MB, both targets, no warnings |

---

## 7. Publish and LiveCodes integration

### 7.1 Publish checklist

- [ ] Asset licensing/redistribution confirmed (the blocker).
- [ ] Push `main` to `live-codes/browser-kotlin`; create the repo if needed.
- [ ] `npm login` with the `@live-codes` scope and 2FA.
- [ ] `cd packages/kotlin-wasm && npm publish`.
- [ ] Tag `v0.1.0` and push the tag.
- [ ] Verify `https://cdn.jsdelivr.net/npm/@live-codes/kotlin-wasm@0.1.0/`
      contains `dist/` and `assets/` (all parts under 20 MB).

### 7.2 LiveCodes integration plan

LiveCodes uses the same CDN-vendor pattern as `@live-codes/dlang-wasm` and
`@live-codes/clang-wasm`; it does not need the package as an npm dependency.

1. `src/livecodes/vendors.ts`:

   ```ts
   export const kotlinWasmBaseUrl = /* @__PURE__ */ getUrl(
     '@live-codes/kotlin-wasm@0.1.0/',
   );
   ```

2. `src/livecodes/languages/kotlin-wasm/`:
   - `lang-kotlin-wasm.ts`:
     - `name: 'kotlin-wasm'`
     - `title: 'Kotlin (Wasm)'`
     - `compiler.factory: () => async (code) => code`
     - `compiler.scripts: ({ baseUrl }) => [baseUrl + '{{hash:lang-kotlin-wasm-script.js}}']`
     - `compiler.scriptType: 'text/kotlin-wasm'`
     - `compiler.compiledCodeLanguage: 'kotlin-wasm'`
     - `compiler.liveReload: true`
     - `extensions: ['kt']`
     - `editor: 'script'`
      - `largeDownload: true` (~32 MB first load per target)
     - editor support:
       - Monaco: `monacoLanguagesBaseUrl + 'kotlin.js'`, language `kotlin`
         (`@live-codes/monaco-languages@0.3.14/dist/kotlin.js` exists);
       - CodeMirror: `codemirrorLegacy((await import(codeMirrorBaseUrl +
         'codemirror-lang-clike.js')).kotlin)`; the legacy `clike` mode exports
         a `kotlin` mode, and the LiveCodes build re-exports it;
       - CodeJar: `{ language: 'kotlin' }`.
   - `lang-kotlin-wasm-script.ts`:
     ```js
     importScripts(kotlinWasmBaseUrl + 'dist/kotlin-wasm.global.js');
     let compilerPromise;
     const getCompiler = () => (compilerPromise ??=
       self.kotlinWasm.createCompiler({ baseUrl: kotlinWasmBaseUrl + 'assets/' }));
     // on { id, code, input }:
     const result = await (await getCompiler()).run(code, input);
     postMessage({ id, result: {
       output: result.output,
       errors: result.errors || [],
       exitCode: result.exitCode,
     }});
     // post { type: 'ready' } after getCompiler(), { type: 'error' } on failure
     ```
     Use `createWorkerRunner`/`runCompiler` like `d-wasm`, with a generous
     `timeoutMs` (D uses 120 s).

     For the **JS target**, the compiler worker uses
     `createCompiler({ target: 'js', baseUrl })`, calls `compile(code)`, and
     posts the returned `files` (`main.mjs` with `encoding: 'utf8'`) to the
     result page. The result page creates a Blob URL and imports/executes the
     module itself; no Wasm import object is involved. The compiler image still
     needs WasmGC, so the worker environment is unchanged. JS stdin is not
     supported.
   - `index.ts`: re-export the spec.
3. Register `kotlinWasm` in `src/livecodes/languages/languages.ts` (import +
   language array) near `dWasm`.
4. Add `src/livecodes/languages/kotlin-wasm/__tests__/lang-kotlin-wasm.spec.ts`
   covering name/title/scriptType/extensions/`largeDownload`/editor support.
5. Add `docs/docs/languages/kotlin-wasm.mdx`.
6. Add a `vendor-licenses.md` entry:
   - `@live-codes/kotlin-wasm`: Apache-2.0;
   - Kotlin compiler + stdlib: Apache-2.0;
   - GraalVM Web Image: GraalVM Free Terms and Conditions (GFTC) / GPLv2 +
     Classpath Exception; the GFTC and Oracle notice are in `licenses/`.
7. Verify in the LiveCodes sandbox:
   - nested Blob workers (compiler + program) under the result iframe CSP
     (`worker-src blob:`);
   - `connect-src` allows the jsDelivr assets;
   - WasmGC + `DecompressionStream`;
   - stdin line semantics;
   - loading/`largeDownload` and the 15 s program timeout.

### 7.3 Integration risks

- **Nested workers/CSP** is the main risk. The package starts a nested classic
  worker (compiler) and a nested module worker (program) from Blob URLs. The
  LiveCodes sandbox must allow `worker-src blob:`. If it does not, the package
  needs a host-provided worker launch path or the compiler/program must move into
  the existing sandbox worker.
- **Asset licensing** remains a publish prerequisite; LiveCodes referencing the
  CDN does not resolve the npm package's redistribution rights.
- **No Analysis API**: no semantic completion/lint. Editor highlighting works via
  Monaco/CodeMirror; compiler diagnostics are shown after Run.
- **~32 MB first load per target**: `largeDownload: true` and lazy loading are
  required. The Wasm target is ~32.4 MB gz; the JS target ~32.7 MB gz. The
  result page only needs the JS target for JS modules; the compiler worker still
  loads the compiler image.
- **JS target output**: use `compiler.compile(code)` in the compiler worker and
  send the returned `main.mjs` text to the result page; it can import it as a
  module without Wasm. The compiler image still needs WasmGC; only the emitted
  program is JavaScript. JS stdin is not implemented.
- **Dev compiler**: `2.5.0-dev-9169` is not a stable Kotlin release; upgrading
  means rebuilding both GraalVM images (`TARGET=wasm` and `TARGET=js`).

---

## 8. Alternatives considered

| Route | Result |
| --- | --- |
| **Real K2 via GraalVM Web Image** (this package) | Genuine Kotlin, works; Wasm and JS targets; ~32 MB gz compiler per target; built from source; licensing to clear |
| **minikotlin** (this repo's other demo) | ~1.9 MB, instant, but a subset; no published licence |
| **TeaVM + Kotlin class files** | Kotlin class files run 8/8 on the TeaVM back end (see `../browser-jvm/FINDINGS.md`), but no browser compiler emits JVM class files |
| **Doppio JVM in JS** | `kotlinc` compiles took ~7–20 minutes and often did not finish; abandoned by `@live-codes/java-wasm` |
| **Scala/other wasm packages** | Separate packages per toolchain; `@live-codes/scala-wasm` is the house pattern for a wasm compiler distribution |

The decision: keep minikotlin as the tiny subset demo; use the real K2 images
for the package, because they are actual Kotlin and the payload can be shipped
gzipped/split. Keep both Wasm and JS targets: the Wasm program is small and
uses WasmGC; the JS target gives a standalone module that a result page can run
without a Wasm import object.

---

## 9. Open questions / honest unknowns

- **Asset licensing.** Both generated images carry GraalVM runtime terms.
  Building them from source gives provenance, not redistribution rights; Oracle's
  terms need clearance before publishing the npm package.
- **LiveCodes nested workers.** Not yet tested inside the LiveCodes result
  sandbox/CSP; this is the first integration experiment. The JS target adds no
  program wasm, but the compiler worker is still a nested Blob worker.
- **JS stdin.** Not implemented; `capabilities.stdin` is false for the JS target.
  The emitted JS program itself is ordinary JavaScript.
- **JS compiler image.** It is still a ~32.7 MB gz GraalVM image and needs
  WasmGC/exception handling; only the emitted program avoids WasmGC.
- **Node 22** specifically, and **Firefox/Safari**, have not been tested. The JS
  target's Node and Chromium paths were tested here.
- **Browser asset integrity.** The wrapper trusts `baseUrl`; hashes are verified
  by `copy-assets`, the Node tests and `npm run assets`, but not at browser
  fetch time. A `crypto.subtle` check could be added, at the cost of hashing
  ~73 MB in the worker.
- **`@JsFun` prelude edge cases.** File-level annotations, explicit
  `import kotlin.io.readln`, or unusual package declarations are not specifically
  handled; standard playground snippets are.
- **Rebuild reproducibility.** Both images are rebuilt by
  `scripts/build-toolchain.sh` (`TARGET=wasm`/`TARGET=js`); the upstream commit,
  Kotlin/GraalVM/Binaryen versions, heap and every hash are pinned. A 12 GB WSL
  VM with `HEAP=8g` is the smallest configuration verified here.
- **Stable Kotlin.** The pinned compiler is a dev build; no stable K2/Wasm
  browser image was available.
- **No CI** yet for the package (tests/`npm pack`).
- **No TypeScript declarations** yet.

---

## 10. Reproduction and pins

### Run the demos

```sh
node serve.mjs
# http://localhost:8001/          minikotlin
# http://localhost:8001/real.html real K2 (Wasm)
# http://localhost:8001/packages/kotlin-wasm/example/js.html real K2 (JS)
```

### minikotlin test

```sh
npm test
```

### Package

```sh
cd packages/kotlin-wasm
npm install --include=dev      # esbuild is a devDependency
npm run assets                 # verify toolchain.lock.json and regenerate receipts
npm run build:iife             # rebuild dist/
npm test                       # 18/18, Node with --experimental-wasm-exnref
node ../../serve.mjs 8001
# http://localhost:8001/packages/kotlin-wasm/example/
# http://localhost:8001/packages/kotlin-wasm/example/js.html
# http://localhost:8001/packages/kotlin-wasm/example/iife.html
```

### Publish (after clearance)

```sh
cd packages/kotlin-wasm
npm publish
```

### Pins

- Kotlin `2.5.0-dev-9169`
- host `alex28sh/wasm-code-editor@02a8916077b1ea697808f258dee5a5406c887774`
- Wasm target compiled with Oracle GraalVM `25.0.4+7.1` and Binaryen `133`,
  heap `8g`, on `2026-10-23T05:46:56Z`
- JS target compiled with the same tools, heap `8g`, on
  `2026-10-23T07:23:57Z`
- Wasm compiler image raw `72,602,076 B`, SHA-256
  `90ed9c9b12d3c5cbcde987d6f8a3b2e8cc8b51840e0f5767af0cbc79f31c6d91`
- Kotlin/Wasm stdlib raw `12,005,328 B`, SHA-256
  `1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21`
- JS compiler image raw `74,999,356 B`, SHA-256
  `1b07b557851009dfef305c8797e1e5ea53f6f2dd5b9f89f6e24eb958a313f60e`
- Kotlin/JS stdlib raw `10,493,338 B`, SHA-256
  `ca8fdeef1f5707f605bd52878e79cc6705fa3bb811d08052a66d46902aa38083`
- every compressed part, the host, wrapper and manifest for both targets are
  hashed in `packages/kotlin-wasm/toolchain.lock.json`.

---

## 11. Licence and provenance

**This package's own code is Apache-2.0**, the same license as the Kotlin
compiler. `LICENSE` contains the Apache-2.0 text and a note that it does not
cover `assets/` and `assets/js/`; `NOTICE` and `licenses/` carry the Kotlin and
GraalVM attribution.

The assets are third-party:

- **Kotlin compiler (K2), Kotlin/Wasm and Kotlin/JS standard libraries:**
  Apache-2.0, developed by JetBrains s.r.o. and the Kotlin Programming Language
  contributors. Kotlin's third-party notices are at
  <https://github.com/JetBrains/kotlin/blob/master/license/README.md>.
- **GraalVM Web Image runtime:** both generated images embed GraalVM runtime
  code; the generated scripts carry GPLv2 + Classpath Exception headers, and
  the committed builds used Oracle GraalVM 25.0.4 under the GraalVM Free Terms
  and Conditions (GFTC). The GFTC, Oracle's `NOTICE.txt` and the distribution's
  license-information manual are reproduced in `licenses/`.

Consequence: the compiler/toolchain assets remain subject to their third-party
terms; the GFTC is included for the image. Building from source improves
provenance but does not grant redistribution rights beyond those terms; review
them before publishing. The package's Apache-2.0 license does not grant rights
to the GraalVM image.

`minikotlin` also publishes no licence on `minikotlin.run`; its vendored copy in
`vendor/minikotlin/` is evaluation-only as well.

`assets/kotlin-compiler-image.js`/`.wasm` and `assets/js/kotlin-compiler-image.js`
/`.wasm` are built from the pinned upstream source by
`scripts/build-toolchain.sh`. Only transport wrappers were added: gzip,
splitting into two parts, a manifest, a `DecompressionStream` wrapper and, at
runtime, a `wasm_path`/stdlib URL rewrite for Blob workers. The generated images
are otherwise untouched.
