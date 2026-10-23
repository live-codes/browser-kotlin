# FINDINGS — Kotlin in the browser

This is the technical record for `live-codes/browser-kotlin`: two in-browser Kotlin
demos, the real-K2 npm package built from them, what was measured, what was
verified, what is still blocked, and exactly what the LiveCodes integration
needs.

Status: the demos and `@live-codes/kotlin-wasm@0.1.0` are code-complete and
tested. The package is **not published**. Publishing is blocked only by the
redistribution terms of the vendored GraalVM image. No LiveCodes changes have
been made yet.

---

## 1. Scope and deliverables

| Deliverable | Path | State |
| --- | --- | --- |
| minikotlin demo | [`index.html`](index.html), [`runner.js`](runner.js) | working |
| real-K2 demo | [`real.html`](real.html) | working |
| npm package | [`packages/kotlin-wasm`](packages/kotlin-wasm) | working, unpublished |
| static server | [`serve.mjs`](serve.mjs) | working |
| minikotlin smoke test | [`test/smoke.mjs`](test/smoke.mjs) | passing |
| package tests | `packages/kotlin-wasm/test/*.test.js` | 14/14 passing |
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
| `5e0a13b` | final **MIT** license, matching clang-wasm |

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
    dist/kotlin-wasm.global.js  committed IIFE build (11.5 KB)
    src/                     browser/Node engines, API, stdin prelude
    scripts/                 build IIFE, regenerate receipts
    test/                    14 Node tests
    example/                 ESM and classic-worker browser checks
    toolchain.lock.json      upstream commits and every asset hash
    LICENSE                  MIT for this package's code
    THIRD-PARTY-NOTICES.md   Kotlin / GraalVM attribution and caveat
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

### 4.1 Why a prebuilt image

The real K2 compiler is a JVM application. The only browser-runnable form found
is the **GraalVM Web Image** build from
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`compiler-host`): the published Kotlin compiler jars are compiled ahead of time
with Oracle GraalVM Web Image (`native-image --tool:svm-wasm`).

The upstream build requires:

- Oracle GraalVM **25.1+** (Community rejects `--tool:svm-wasm`);
- ~10 GB free RAM per image build; `native-image` is given 24–28 GB heap;
- the compiler and the Analysis API as **two** images (75 MB each), plus a 12 MB
  stdlib archive.

This machine has 16 GB total and no Oracle GraalVM, so the images were **not
rebuilt here**. The prebuilt compiler image and stdlib were copied from
[`space-enthusiast/kotlin-on-web-playground`](https://github.com/space-enthusiast/kotlin-on-web-playground),
which publishes the upstream build's output.

Pinned source commits:

| Part | Pin |
| --- | --- |
| compiler host | `alex28sh/wasm-code-editor@02a8916077b1ea697808f258dee5a5406c887774` |
| prebuilt image | `space-enthusiast/kotlin-on-web-playground@5e5a40d49b5d0ddbf8a869ff03f5ee1aca640131` |
| Kotlin version | `2.5.0-dev-9169` |
| fetched | 2026-10-21 |

### 4.2 Assets and transport

The compiler and stdlib are vendored **gzipped**; the Analysis API is
deliberately omitted.

| Asset | Compressed | Inflated |
| --- | ---: | ---: |
| compiler image | 25,826,360 B, split into `.gz.0` 13,000,000 + `.gz.1` 12,826,360 | 74,849,307 B |
| Wasm stdlib | 3,811,357 B (`kotlin-stdlib-wasm-js.bin.gz`) | 12,005,328 B |
| generated host | 112,773 B (`kotlin-compiler-image.js`) | — |
| wrapper | 4,020 B (`kotlin-compiler-worker.js`) | — |
| manifest | 467 B (`kotlin-assets.json`) | — |
| **total** | **29,754,977 B (28.4 MiB)** | **86,854,635 B (82.8 MiB)** |

The compiler gzip is split so **every file is under jsDelivr's 20 MB per-file
cap**. Both raw artifacts keep their upstream SHA-256:

```
e197bbe3e265505997231cc1b907ab33acdb507a88647308e7790cc7afdb2512
  74,849,307 B  compiler image

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
- The image is platform-specific to the GraalVM build; rebuilding needs Oracle
  GraalVM + the upstream patch pipeline.
- The upstream publishing repo has no licence file; see §11.

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

Options: `baseUrl` (required in a browser; optional in Node), `onProgress`,
`fileName`. `runOptions`: `timeoutMs` (program, default 15000),
`compileTimeoutMs` (default 180000), `fileName`.

Result:

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
`{ language, compiler, stdin: true, wasmGc: true, analysis: false }`.

The API accepts `input` as `string`, `Uint8Array` or `ArrayBuffer`.

### 5.2 Entries

| Entry | Path | Use |
| --- | --- | --- |
| Browser ESM | `src/index.js` | bundlers, module workers |
| Node | `src/index.node.js` | `node --experimental-wasm-exnref` |
| IIFE | `dist/kotlin-wasm.global.js` (11.5 KB minified) | classic workers, `importScripts` |
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
- Each run compiles through the compiler worker, then starts a fresh module
  program worker with the four generated files as Blob URLs.
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

Package tests (Node, `npm test`, 14/14):

1. every asset matches its receipt;
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

- `npm publish --dry-run --ignore-scripts`: clean, 27 files, 29.5 MB, public
  access, `LICENSE` + `THIRD-PARTY-NOTICES.md`, no `NOTICE`, no warnings;
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
| package Node tests | 14/14 |
| package ESM browser example + stdin | pass |
| package IIFE classic worker + stdin | pass |
| cross-origin assets (two ports, CORS) | pass |
| fresh clone package tests | 14/14 |
| packed tarball install + API + CLI | pass |
| `npm publish --dry-run` | no warnings, 27 files, 29.5 MB |

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
     - `largeDownload: true` (30 MB first load)
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
   - `index.ts`: re-export the spec.
3. Register `kotlinWasm` in `src/livecodes/languages/languages.ts` (import +
   language array) near `dWasm`.
4. Add `src/livecodes/languages/kotlin-wasm/__tests__/lang-kotlin-wasm.spec.ts`
   covering name/title/scriptType/extensions/`largeDownload`/editor support.
5. Add `docs/docs/languages/kotlin-wasm.mdx`.
6. Add a `vendor-licenses.md` entry:
   - `@live-codes/kotlin-wasm`: MIT;
   - Kotlin compiler + stdlib: Apache-2.0;
   - GraalVM Web Image: Oracle GraalVM terms / GPLv2 + Classpath Exception
     caveat.
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
- **30 MB first load**: `largeDownload: true` and lazy loading are required.
- **Dev compiler**: `2.5.0-dev-9169` is not a stable Kotlin release; upgrading
  means rebuilding the GraalVM image.

---

## 8. Alternatives considered

| Route | Result |
| --- | --- |
| **Real K2 via GraalVM Web Image** (this package) | Genuine Kotlin, works; ~30 MB gz / ~87 MB inflated; prebuilt artifacts and licensing to clear |
| **minikotlin** (this repo's other demo) | ~1.9 MB, instant, but a subset; no published licence |
| **TeaVM + Kotlin class files** | Kotlin class files run 8/8 on the TeaVM back end (see `../browser-jvm/FINDINGS.md`), but no browser compiler emits JVM class files |
| **Doppio JVM in JS** | `kotlinc` compiles took ~7–20 minutes and often did not finish; abandoned by `@live-codes/java-wasm` |
| **Scala/other wasm packages** | Separate packages per toolchain; `@live-codes/scala-wasm` is the house pattern for a wasm compiler distribution |

The decision: keep minikotlin as the tiny subset demo; use the real K2 image
for the package, because it is actual Kotlin and the payload can be shipped
gzipped/split.

---

## 9. Open questions / honest unknowns

- **Asset licensing.** The generated image carries GraalVM runtime terms and the
  prebuilt repo has no licence file. Written clearance is required before
  publishing the npm package.
- **LiveCodes nested workers.** Not yet tested inside the LiveCodes result
  sandbox/CSP; this is the first integration experiment.
- **Node 22** specifically, and **Firefox/Safari**, have not been tested.
- **Browser asset integrity.** The wrapper trusts `baseUrl`; hashes are verified
  by `copy-assets`, the Node tests and `npm run assets`, but not at browser
  fetch time. A `crypto.subtle` check could be added, at the cost of hashing
  75 MB in the worker.
- **`@JsFun` prelude edge cases.** File-level annotations, explicit
  `import kotlin.io.readln`, or unusual package declarations are not specifically
  handled; standard playground snippets are.
- **Rebuild reproducibility.** The image was not rebuilt locally (no Oracle
  GraalVM, 16 GB RAM). The upstream commits and hashes are pinned, but the build
  pipeline is external.
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
# http://localhost:8001/real.html real K2
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
npm test                       # 14/14, Node with --experimental-wasm-exnref
node ../../serve.mjs 8001
# http://localhost:8001/packages/kotlin-wasm/example/
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
- prebuilt `space-enthusiast/kotlin-on-web-playground@5e5a40d49b5d0ddbf8a869ff03f5ee1aca640131`
- compiler image raw `74,849,307 B`, SHA-256
  `e197bbe3e265505997231cc1b907ab33acdb507a88647308e7790cc7afdb2512`
- stdlib raw `12,005,328 B`, SHA-256
  `1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21`
- every compressed part, the host, wrapper and manifest are hashed in
  `packages/kotlin-wasm/toolchain.lock.json`.

---

## 11. Licence and provenance

**This package's own code is MIT**, following the other LiveCodes wasm packages.
`LICENSE` contains the MIT text and a note that MIT does not cover `assets/`.

The assets are third-party:

- **Kotlin compiler (K2) and Kotlin/Wasm standard library:** Apache-2.0,
  developed by JetBrains s.r.o. and the Kotlin Programming Language contributors.
  Kotlin's third-party notices are at
  <https://github.com/JetBrains/kotlin/blob/master/license/README.md>.
- **GraalVM Web Image runtime:** the generated image embeds GraalVM runtime
  code; the generated script carries GPLv2 + Classpath Exception headers, and
  the upstream build used Oracle GraalVM 25i4 under Oracle's GraalVM Free Terms
  and Conditions.
- **Prebuilt publishing repo:** `space-enthusiast/kotlin-on-web-playground` has
  no licence file.

Consequence: the compiler/stdlib assets are vendored for **evaluation only**
until the redistribution terms are confirmed with the upstream authors and
GraalVM compliance is settled. Publishing the npm package is blocked on that
decision; the package's MIT licence does not grant rights to those assets.

`minikotlin` also publishes no licence on `minikotlin.run`; its vendored copy in
`vendor/minikotlin/` is evaluation-only as well.

`assets/kotlin-compiler-image.js` and the `.wasm` parts were copied unchanged
from the upstream prebuilt image. Only transport wrappers were added: gzip,
splitting into two parts, a manifest, a `DecompressionStream` wrapper and, at
runtime, a `wasm_path`/stdlib URL rewrite for Blob workers. The generated image
is otherwise untouched.
