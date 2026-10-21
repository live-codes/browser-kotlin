# @live-codes/kotlin-wasm

Run **Kotlin** with one API, on the **real K2 compiler** compiled to
WebAssembly by GraalVM Web Image. Compilation and execution happen entirely in
the browser (or in Node) — **no server compiles anything**, and nothing is sent
anywhere.

Source: <https://github.com/live-codes/browser-kotlin/tree/main/packages/kotlin-wasm>

```js
import { createCompiler } from '@live-codes/kotlin-wasm';

const compiler = await createCompiler();
const result = await compiler.run(`
data class Point(val x: Int, val y: Int)

fun main() {
    println("hello from Kotlin")
    val p = Point(2, 3)
    println("sum = \${p.x + p.y}")
}
`);

console.log(result.stdout); // hello from Kotlin\nsum = 5\n
console.log(result.errors); // []
console.log(result.exitCode); // 0
```

That is Node, where the assets ship inside the package. **In a browser there is
no filesystem**, so copy the assets somewhere your page can fetch and pass that
directory as `baseUrl`:

```bash
npx --package @live-codes/kotlin-wasm kotlin-wasm-copy-assets public/kotlin
```

```js
const compiler = await createCompiler({
  baseUrl: new URL('/kotlin/', location.href)
});
```

## API

### `createCompiler(options)`

Returns a promise for a compiler. Kotlin is the only language this package
runs, so there is no language argument. The toolchain is loaded here, so a bad
`baseUrl` fails at this point rather than on the first run. In the browser this
also compiles an empty program once, so the first user run is warm.

| Option | Meaning |
| --- | --- |
| `baseUrl` | Where the runtime assets are served from. **Required in a browser**, optional in Node (the packaged assets are used). It may be relative to the page or an absolute http(s) URL. |
| `onProgress` | `(value) => {}`, called with 0 to 1 while the ~30 MB of gzipped assets download. |
| `fileName` | The name diagnostics use for the source. Defaults to `Main.kt`. |

The returned object:

| Member | Meaning |
| --- | --- |
| `language` | `kotlin`. |
| `fileName` | The diagnostic file name. |
| `compilerVersion` | `2.5.0-dev-9169`. |
| `capabilities` | `{ language, compiler, stdin: true, wasmGc: true, analysis: false }`. |
| `run(code, input?, runOptions?)` | Compile and run. `input` is pre-supplied line-based stdin; see below. |
| `warm()` | Compile a throwaway program. Optional; `createCompiler` already loaded the toolchain. |
| `dispose()` | Release this compiler's hold on the shared toolchain. Further runs throw. |

`runOptions` may set `timeoutMs` (program run, default 15000), `compileTimeoutMs`
(default 180000) and `fileName`.

### `run()` result

| Field | Meaning |
| --- | --- |
| `stdout` | Everything the program wrote to stdout. |
| `stderr` | Everything it wrote to stderr. |
| `output` | Both, in the order the program wrote them. |
| `errors` | The compiler's diagnostics on failure, `file:line:column: severity: message`; empty on a clean compile. Runtime failures and timeouts are also reported here. |
| `exitCode` | `0` when the program ran, `1` for a runtime failure or timeout, `null` when it never ran because compilation failed. |
| `compileMs` | Wall clock for the compile. |
| `runMs` | Wall clock for the run, or `null` if it did not run. |

A failed compile does not throw: it comes back with `exitCode: null` and
`errors` filled in. Only a load failure, a disposed compiler or a bad argument
throws.

### Stdin

Kotlin/Wasm's standard library has no console input: `readLine` is unresolved
and `readlnOrNull` reads nothing. When you pass `input` (or the source uses one
of those functions), the package prepends a small prelude that shadows
`readln()`, `readlnOrNull()` and `readLine()` and reads pre-supplied lines
through a `@JsFun` host hook.

```js
const result = await compiler.run(
  `fun main() {
       println("name: " + readln())
       println("age: " + readlnOrNull())
   }`,
  'Ada\n36\n'
);
// stdout: name: Ada\nage: 36\n
```

- Input is split on `\r\n`, `\n` or `\r`; a trailing newline does not add an
  extra empty line.
- `readlnOrNull()` and `readLine()` return `null` at EOF. `readln()` throws
  `NoSuchElementException("EOF")`.
- **It is not interactive.** All input is available up front; a prompt-then-read
  interaction still sees the next pre-supplied line. `System.in` and binary
  streams are not available.
- If your source defines its own no-argument `readln`, `readlnOrNull` or
  `readLine`, the prelude leaves that definition alone.
- Diagnostics are mapped back to the caller's line numbers even though the
  prelude is inserted after the leading package/import block.

### `LANGUAGE_IDS`, `COMPILER_VERSION` and errors

```js
import {
  LANGUAGE_IDS,          // ['kotlin']
  COMPILER_VERSION,      // '2.5.0-dev-9169'
  KotlinWasmError,
  KotlinUnsupportedError
} from '@live-codes/kotlin-wasm';
```

## Browser

### Module workers and pages

Import the module entry. `createCompiler` fetches the two small worker scripts,
rewrites their asset URLs, and starts the compiler from Blob URLs, so `baseUrl`
may be cross-origin (jsDelivr works). The wrapper then fetches the ~30 MB of
gzipped compiler/std lib assets itself and reports progress.

### Classic workers and the IIFE

If the worker cannot use ES modules — LiveCodes builds its language workers from
a content string — `importScripts()` the IIFE build instead:

```js
importScripts('kotlin-wasm.global.js'); // from @live-codes/kotlin-wasm/iife
const compiler = await self.kotlinWasm.createCompiler({
  baseUrl: 'https://cdn.jsdelivr.net/npm/@live-codes/kotlin-wasm/assets/'
});
```

`self.kotlinWasm` has the same API as the module entry. The IIFE is a classic
script; it starts the compiler and the program in nested workers, so the host
worker is never blocked by a running program.

**The 30 MB compiler is split into two parts under 20 MB each**
(`kotlin-compiler-worker.js.wasm.gz.0` / `.1`) so jsDelivr, which refuses files
over 20 MB, can host it. The wrapper concatenates and inflates them with
`DecompressionStream`.

## Node

```sh
node --experimental-wasm-exnref your-app.mjs
```

The compiler image uses WebAssembly exception handling, which V8 still gates
behind `--experimental-wasm-exnref` in Node. The package's `test` script passes
it. Node 22 or later is required.

```js
import { createCompiler } from '@live-codes/kotlin-wasm';

const compiler = await createCompiler();
await compiler.warm(); // optional: pay the first compile up front
const result = await compiler.run('fun main() { println(42) }');
compiler.dispose();
```

In Node the packaged assets are read from `assets/`; pass `baseUrl` to fetch them
over HTTP instead. The compiler and the program run in a worker thread, so a
program can be stopped by terminating that thread. If you pass a `baseUrl`, the
files are downloaded to a temporary directory and removed on `dispose()`.

## What works

Verified in Node and Chromium; `npm test` compiles and runs it.

- Real **Kotlin 2.5.0-dev-9169**, compiled for the Wasm target.
- Data classes, sealed classes and `when`, generics, inheritance, null safety,
  string templates, collections (`groupBy`, `maxBy`, `sortedBy`, `associateWith`,
  `mapValues`, `sumOf`, `joinToString`), exceptions and `kotlin.math`.
- **Exact `print`/`println` output.** The generated import object routes `print`
  through a `write` hook and `println` through `console.log`, so the package
  keeps the distinction instead of turning every call into a line.
- **Line-based stdin** for `readln()`, `readlnOrNull()` and `readLine()`,
  pre-supplied as a string, `Uint8Array` or `ArrayBuffer`; see
  [Stdin](#stdin).
- **Diagnostics** with `file:line:column`, e.g.
  `Main.kt:1:25: error: Initializer type mismatch: expected 'Int', actual 'String'.`
- **A program timeout that leaves the compiler warm.** The program runs in its
  own worker; terminating it does not reload the 30 MB compiler.

Measured on this machine: browser compiles are ~1–3 s (first ~4 s including the
load), Node compiles are ~7–17 s (the first includes the image's JIT warm-up).
Program runs are tens of milliseconds.

## Limitations

- **Single file, standard library only.** No other libraries, no Gradle, no
  multi-file projects. The compiler takes one source string.
- **Stdin is line-based and pre-supplied.** There is no interactive console:
  `readln()` reads the next supplied line, and `System.in`/binary streams are not
  available.
- **No Analysis API.** This package compiles and runs; inline diagnostics and
  completion from the real Analysis API are not included. (The upstream
  toolchain has a separate 75 MB image for that.)
- **~30 MB gzipped / ~87 MB inflated** on first use, cached by the browser.
  Lazy-load it only when a module actually uses Kotlin.
- **WasmGC is required** — Chrome/Edge 119+, Firefox 120+, Safari 18.2+ — plus
  `DecompressionStream` and nested workers.
- **Node needs `--experimental-wasm-exnref`** and Node 22+.
- **Licensing must be cleared before shipping.** See
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## LiveCodes integration

- Create one compiler per sandbox worker, lazily on the first Kotlin run, and
  `importScripts()` the IIFE. Call `warm()` if the host wants the first compile
  paid at language-load time.
- Pass `baseUrl` pointing at the assets (`kotlin-wasm-copy-assets`, jsDelivr or
  any static host). The split parts keep every file under jsDelivr's 20 MB cap;
  the assets need CORS but no particular `Content-Type`.
- `run()` returns `{ output, errors, exitCode }` directly; map `errors` to the
  compiler panel. Diagnostics are already `file:line:column: severity: message`.
- Pass the editor's stdin text as `run(code, input)`. Input is line-based and
  pre-supplied: `readln()`, `readlnOrNull()` and `readLine()` work, but a
  prompt-then-respond interaction cannot be supported.
- Set `runOptions.timeoutMs` for a runaway program. The package terminates the
  program worker and keeps the compiler worker alive.
- Lazy-load the asset only when a module actually uses Kotlin, the way the other
  wasm languages work.

## Provenance

[`toolchain.lock.json`](toolchain.lock.json) pins the toolchain: Kotlin
`2.5.0-dev-9169`, the compiler host
`alex28sh/wasm-code-editor@02a8916`, the prebuilt image
`space-enthusiast/kotlin-on-web-playground@5e5a40d`, the SHA-256 of every
gzipped part and inflated archive, and the Apache license text. `npm run assets`
fails if the assets and the lock disagree.

## Development

```sh
cd packages/kotlin-wasm
npm install
npm run assets          # regenerate receipts; verify assets and toolchain.lock.json
npm run build:iife      # rewrite dist/kotlin-wasm.global.js (committed)
npm test                # real compiles in Node, with the exnref flag
node ../../serve.mjs 8001
# open http://localhost:8001/packages/kotlin-wasm/example/        (module entry)
# open http://localhost:8001/packages/kotlin-wasm/example/iife.html (classic worker)
```

`dist/` is committed because a classic worker can only `importScripts()` a URL.
`kotlin-wasm-copy-assets` verifies the assets against `src/asset-receipts.js`
before copying, so a stale pairing fails there rather than on someone's page.

## Licence

Apache-2.0 for this package's own code, matching the Kotlin compiler. The
assets are third-party builds: the Kotlin compiler and Kotlin/Wasm standard
library are Apache-2.0, and the GraalVM Web Image runtime carries Oracle
GraalVM terms. See [`LICENSE`](LICENSE), [`NOTICE`](NOTICE) and
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) for attribution, provenance
and the redistribution caveat.
