# Kotlin in the browser — proof of concept

Two independent demos that compile and run Kotlin **entirely in the browser**,
with no server and no build step:

| Demo | Compiler | First load | Language |
| --- | --- | ---: | --- |
| [`index.html`](index.html) | [minikotlin](https://minikotlin.run) 0.1.0 — from-scratch C→Wasm compiler | ~2 MB | a tested Kotlin subset |
| [`real.html`](real.html) | **real Kotlin 2.5.0-dev-9169 (K2)** via GraalVM Web Image | ~30 MB gz (~87 MB inflated) | real Kotlin + stdlib |

Both emit **WasmGC**, instantiate it on the page, and stream `println` output.
Nothing is sent anywhere.

## Run it

```sh
node serve.mjs          # http://localhost:8001/
```

- <http://localhost:8001/> — minikotlin demo (tiny, fast)
- <http://localhost:8001/real.html> — real K2 compiler demo (large first load)

Press **Run** (or Ctrl/Cmd+Enter). A static server is required because browsers
block ES-module Workers and WebAssembly over `file://`; `serve.mjs` mainly adds
`Content-Type: application/wasm`. Nothing is compiled server-side.

The real compiler's image and stdlib are shipped gzipped: the compiler is split
into two sub-20 MB parts (13.0 MB + 12.8 MB) plus a 3.8 MB stdlib archive. A
small worker wrapper concatenates and inflates them with `DecompressionStream`
before the GraalVM loader uses them, so the browser transfers ~30 MB instead of
~87 MB.

```sh
npm test                # Node smoke test for the minikotlin demo
```

Every asset is committed, so a clone runs both demos and the smoke test without
a build step.

## npm package

[`packages/kotlin-wasm`](packages/kotlin-wasm) is **`@live-codes/kotlin-wasm`**:
the real K2 compiler behind a `createCompiler({ baseUrl })` API, in the
shape of [`@live-codes/clang-wasm`](https://github.com/live-codes/clang-wasm).
It has ESM and Node entries, an IIFE build for classic workers, a
`kotlin-wasm-copy-assets` CLI, asset receipts and tests. `real.html` uses the
same assets and worker wrapper.

## Measured

### minikotlin (`index.html`)

| Program | Result |
| --- | --- |
| Hello, values (data class, templates, loop) | correct, ~11 KB wasm |
| Classes & polymorphism (`open`/`override`) | correct |
| Sealed shapes & `when` | correct |
| Collections (`sorted`/`filter`/`map`/`sum`/`max`) | correct |
| Null safety (`toIntOrNull`, `?.let`, `?:`) | correct |
| Coroutines (two `launch` + `delay`) | `start / fast lane / slow lane / done` |
| Unresolved name | diagnostics listing the unresolved identifier |
| Infinite loop | stopped at 15 s, worker replaced, next run works |

Compile ~5–20 ms warm; the first run includes the 1.9 MB compiler load.

### Real K2 (`real.html`)

| Program | Result |
| --- | --- |
| Hello + `map` + string templates | correct, 64.2 KB wasm, ~1.2–3.8 s compile, ~25–40 ms run |
| Data class + `groupBy` / `maxBy` / `sortedBy` / `average` | correct |
| Sealed classes + `when` + `kotlin.math.PI` | correct |
| Generics + `associateWith` / `mapValues` / `sumOf` / `joinToString` | correct, 149.6 KB wasm |
| `kotlin.math` (`pow`, `roundToInt`, `fold`) | correct |
| Type error + unresolved reference | `2:20 error: Initializer type mismatch…`, `4:13 error: Unresolved reference…` |
| Infinite loop | stopped at 15 s; the compiler worker survives and the next run works |

First compile after load: ~3.8 s. Later compiles: ~1.2–1.9 s. Run: 20–40 ms.

## How it works

### 1. minikotlin

[minikotlin](https://minikotlin.run) is a Kotlin→WasmGC compiler written from
scratch in C and compiled to WebAssembly with Emscripten. `index.html` loads it
inside a module Worker, compiles the source, then instantiates the emitted
module with the host imports in `vendor/minikotlin/engine/`.

```
index.html                  editor, examples, Run, output, watchdog
runner.js                   module Worker: load compiler → compile → instantiate → run
vendor/minikotlin/          minikotlin.js + 1.9 MB wasm + engine runtimes
```

### 2. Real K2

The compiler is the **actual published Kotlin compiler**, ahead-of-time compiled
to a GraalVM Web Image by
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`native-image --tool:svm-wasm`). The image embeds a JVM runtime compiled to
wasm; no JVM is installed. The prebuilt image used here was published by
[`space-enthusiast/kotlin-on-web-playground`](https://github.com/space-enthusiast/kotlin-on-web-playground).

`real.html` starts the classic worker
`packages/kotlin-wasm/assets/kotlin-compiler-worker.js`.
That file is a small wrapper: it patches `fetch`, then imports the generated
GraalVM worker (`kotlin-compiler-image.js`). The compiler image and stdlib are
requested as `.gz`, piped through `DecompressionStream`, and only then handed to
the GraalVM loader. The generated worker then answers messages:

```js
worker.postMessage({ id, operation: 'compile', text: source, argument: '' });
// -> answer JSON: { ok, milliseconds, diagnostics, files }
```

`compile` returns `main.wasm`, `main.mjs`, `main.import-object.mjs` and
`main.js-builtins.mjs`. `real.html` rewrites the generated imports to Blob URLs
and imports `main.mjs` in a separate module Worker, overriding `console.*` so
Kotlin/Wasm's `println` is streamed to the output panel. The program worker is
terminated after 15 s; the compiler stays warm.

Only the compiler image is vendored — the 75 MB **Analysis API** image (used
upstream for completion and inline diagnostics) is deliberately omitted. This
demo shows compiler diagnostics, not an IDE.

See [`packages/kotlin-wasm/README.md`](packages/kotlin-wasm/README.md) for the
npm package API and [`packages/kotlin-wasm/assets/README.md`](packages/kotlin-wasm/assets/README.md)
for provenance and checksums.

## Caveats for LiveCodes

There are now two very different possible products:

1. **Real K2** is the credible Kotlin language path: actual Kotlin and stdlib,
   proper diagnostics, ~30 MB compressed first load (~87 MB inflated). Compile is
   ~1–2 s, which is usable for a Run button but not for per-keystroke analysis.
   The Analysis API can be added for completion/lint at the cost of another
   ~75 MB (compressible to roughly 25 MB).
2. **minikotlin** is a ~2 MB fallback: instant load, tens-of-ms compiles, but a
   subset language and an unconfirmed licence.

Open items:

- **Licensing is unconfirmed for both vendored toolchains.** minikotlin
  publishes no licence; the real-K2 image comes from a repo with no licence and
  embeds GraalVM runtime code (Oracle GraalVM terms). Both are vendored for
  evaluation only — clear the terms before shipping.
- **The real compiler is single-file, stdlib-only.** No other libraries, no
  multi-file projects, no Gradle. The npm package supports pre-supplied
  line-based stdin (`readln`/`readlnOrNull`/`readLine`); the demo page does not
  expose an input panel. The upstream Analysis API is not included.
- **Payload.** ~30 MB compressed (13.0 MB + 12.8 MB compiler parts + 3.8 MB
  stdlib; ~87 MB after inflation), cached by the browser. The image and stdlib
  are inflated in the worker with `DecompressionStream`; no server-side
  decompression is involved. LiveCodes should lazy-load it only when a snippet
  uses Kotlin.
- **WasmGC is required** — Chrome/Edge 119+, Firefox 120+, Safari 18.2+. No
  feature detection yet; unsupported browsers fail at instantiation.
- **Timeouts.** A program is stopped after 15 s in both demos.
- **Reproducing the real image needs Oracle GraalVM 25.1+ Web Image and ~10 GB
  free RAM per image** (the upstream build was given 24–28 GB heap). That is why
  these images are vendored rather than built here.

## Alternatives considered

| Route | Verdict |
| --- | --- |
| Real K2 via GraalVM Web Image (this demo) | Genuine Kotlin, works; ~30 MB gz payload (~87 MB inflated), licensing to clear |
| minikotlin (this demo) | Works, tiny; subset language |
| TeaVM + Kotlin class files | Back end proven (8/8 in `../browser-jvm/FINDINGS.md`), but no browser class-file front end exists |
| Doppio JVM in JS | Compiles took 7–20 minutes; abandoned by `@live-codes/java-wasm` |

The `browser-jvm` findings are the authority on the TeaVM route; the `java` and
`scala-wasm` projects show the house pattern for shipping one wasm toolchain per
language package.
