# Kotlin in the browser — proof of concept

Running Kotlin in LiveCodes with **no server**: the compiler is itself
WebAssembly, so `.kt` source is lexed, parsed, semantically analysed, lowered to
HIR/MIR and emitted as **WasmGC bytecode entirely in the browser tab** — then
instantiated and run on the same page. Nothing is sent anywhere.

Status: working. Verified in headless Chrome (see [Verified](#verified)).

## Run it

```sh
node serve.mjs          # http://localhost:8001/
```

Open <http://localhost:8001/> and press **Run** (or Ctrl/Cmd+Enter).

A static server is required (ES-module Workers and WebAssembly are blocked over
`file://`), but nothing is compiled server-side. `serve.mjs` exists mainly to
send `Content-Type: application/wasm` for `.wasm` files.

```sh
npm test                # Node smoke test: compile + execute + diagnostics
```

## What this proves

- **Real client-side compile and run.** No JVM, no LLVM, no Binaryen, no
  Gradle, no network round-trip. The 1.9 MB compiler is loaded once, then each
  Run is a synchronous compile (tens of milliseconds) followed by instantiation.
- **Kotlin features that work here:** data classes, inheritance and `override`,
  sealed classes with exhaustive `when` + smart casts, null safety (`?.`, `?:`,
  `!!`), generics, collections (`sorted`/`filter`/`map`/`sum`/`max`), string
  templates, top-level functions, and coroutines
  (`runBlocking`/`launch`/`delay`/`coroutineScope`).
- **Diagnostics** come back with message and line/column, so inline editor
  markers are feasible.
- **Output streams**: `println` arrives in the panel as it is produced.
- **A runaway program is recoverable**: compilation and execution happen in a
  Worker, which is terminated and replaced after a 15-second watchdog.

## Verified

Headless Chrome, served locally over HTTP.

| Program | Result |
| --- | --- |
| Hello, values (data class, templates, loop) | correct output, ~11 KB wasm |
| Classes & polymorphism (`open`/`override`) | correct output |
| Sealed shapes & `when` | correct output |
| Collections (`sorted`/`filter`/`map`/`sum`/`max`) | correct output |
| Null safety (`toIntOrNull`, `?.let`, `?:`) | correct output |
| Coroutines (two `launch` + `delay`) | `start / fast lane / slow lane / done` |
| Unresolved name | diagnostics listing the unresolved identifier |
| Infinite loop | stopped at 15 s, worker replaced, next run works |

Compile times observed: ~5–20 ms warm, first run includes compiler/runtime load.

## How it works

The compiler is [minikotlin](https://minikotlin.run) v0.1.0 — a from-scratch
Kotlin-to-WasmGC compiler written in C and built to WebAssembly with Emscripten.
It emits WebAssembly GC bytecode by hand, so the same tab that compiles also
instantiates the result.

```
index.html                  editor, examples, Run, output, watchdog
runner.js                   module Worker: load compiler → compile → instantiate → run
serve.mjs                   static server (adds Content-Type: application/wasm)
vendor/minikotlin/
  minikotlin.js             Emscripten loader (classic script, loaded as a blob module)
  minikotlin.wasm           the compiler itself (1.9 MB)
  engine/
    compile-bridge.js       upstream bridge (reference; not used directly here)
    host-imports.mjs        every env.__* import a generated module expects
    js-runtime.mjs          JS interop implementation used by host-imports
    math-runtime.mjs        kotlin.math runtime bridge
    char-runtime.mjs        Char classification runtime bridge
    kotlin_math_rt.wasm     musl libm for kotlin.math
    kotlin_char_rt.wasm     UCD table for Char classification
test/smoke.mjs              Node compile-and-run smoke test
```

### Worker sequence

```
new Worker('./runner.js', { type: 'module' })
  ↓ init
fetch minikotlin.js → append `export default createMinikotlin` → import(blob URL)
  ↓
createMinikotlin({ locateFile }) → mkc_compile_buffer / mkc_error_* / mkc_version
  ↓ run
mkc_compile_buffer(source, filename) → wasm bytes + diagnostics
  ↓
fetch kotlin_math_rt.wasm + kotlin_char_rt.wasm → makeHostEnv + imports
  ↓
WebAssembly.instantiate(wasm, { env }) → __mk_init() → main()
  ↓
stdout via env.__println/__print → postMessage to the page
```

The compiler is loaded through a Blob module because it is an Emscripten classic
script that assigns a global (`createMinikotlin`); a Worker has no `<script>`.
The vendored files stay untouched.

## Caveats for LiveCodes

Things to resolve before this becomes a language, roughly in order of weight:

1. **It is a subset, not Kotlin.** minikotlin is a reimplementation, not the
   official Kotlin compiler. It covers the language features above, but expects
   neither the full standard library nor JVM interop, Gradle, annotations
   processing or the wider ecosystem. A LiveCodes integration should either
   label it clearly (e.g. “Kotlin (minikotlin subset)”) or use the real
   compiler:
   - Official Kotlin/Wasm in the browser: [`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
     runs the real K2 compiler + Analysis API as WebAssembly, but the browser
     payload is ~75 MB compiler + ~75 MB Analysis API + ~12 MB stdlib, and it
     also targets Kotlin/Wasm.
   - TeaVM back end is ready for Kotlin class files (8/8 fixtures in
     `../browser-jvm/FINDINGS.md`), but no browser compiler emits JVM class
     files today. Doppio is not viable (7–20 minute compiles).
2. **Licence is unconfirmed.** No licence is published on `minikotlin.run` (as
   of 2026-10-21). The assets are vendored here for evaluation only; do not
   redistribute until the upstream licence is confirmed. See
   [`vendor/minikotlin/README.md`](vendor/minikotlin/README.md).
3. **No stdin.** The host runtime has file/stream imports, but this page does
   not plumb a stdin panel. `readLine()` is not available.
4. **Single file.** The compiler takes one source string. The upstream Studio
   concatenates multiple `.kt` files (hoisting imports, entry file last); this
   PoC does not expose that yet.
5. **No multi-file/project model, no diagnostics-to-editor mapping.** Errors
   are rendered in a panel, not as editor markers. Some diagnostics (unresolved
   names) report line/column 0,0.
6. **WasmGC is required** — Chrome/Edge 119+, Firefox 120+, Safari 18.2+. The
   page does not feature-detect this yet; a missing WasmGC support shows up as
   an instantiation error.
7. **Output is not cancellable on the main thread** — hence the Worker. The
   15-second watchdog also caps legitimate long-running coroutines.
8. **Payload** is ~1.9 MB compiler + ~105 KB runtimes, cached by the browser.
   Lazy-load it only when a snippet actually uses Kotlin, as the other wasm
   languages do.

## Alternatives considered

| Route | Verdict |
| --- | --- |
| minikotlin (this PoC) | Works today, tiny, subset language |
| Official K2 compiled to Wasm (`wasm-code-editor`) | Real Kotlin, ~162 MB browser payload, needs a GraalVM build to reproduce |
| TeaVM + Kotlin class files | Back end proven (8/8), but no browser class-file front end exists |
| Doppio JVM in JS | Compiles took 7–20 minutes; abandoned by `@live-codes/java-wasm` |

The `browser-jvm` findings are the authority on the TeaVM route; the `java` and
`scala-wasm` projects show the house pattern for shipping one wasm toolchain per
language package.
