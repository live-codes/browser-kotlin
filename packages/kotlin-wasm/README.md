# @live-codes/kotlin-wasm

Run **Kotlin** with one API, on the **real K2 compiler** compiled to
WebAssembly by GraalVM Web Image. Compilation and execution happen entirely in
the browser (or in Node) — **no server compiles anything**, and nothing is sent
anywhere.

Two output targets:

- **`wasm`** (default): K2 emits a WasmGC module plus its JS glue.
- **`js`**: K2's Kotlin/JS backend emits a standalone `main.mjs` ES module.

The compiler image is the same kind of WebAssembly image for both targets; only
the generated program differs.

Source: <https://github.com/live-codes/browser-kotlin/tree/main/packages/kotlin-wasm>
· [technical record](https://github.com/live-codes/browser-kotlin/blob/main/FINDINGS.md)
· [build and upgrade process](TOOLCHAIN.md)

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

The JS target gives you the emitted JavaScript instead of a Wasm program:

```js
const compiler = await createCompiler({ target: 'js' });
const compiled = await compiler.compile('fun main() { println("hello") }');

compiled.files[0];
// {
//   name: 'main.mjs',
//   content: '//region block: polyfills ...', // UTF-8 JS
//   encoding: 'utf8'
// }

const result = await compiler.run('fun main() { println("hello") }');
// result.stdout === 'hello\n'
```

That is Node, where the assets ship inside the package. **In a browser there is
no filesystem**, so copy the assets somewhere your page can fetch and pass that
directory as `baseUrl` (the `js` target appends `js/` automatically):

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
| `target` | `wasm` (default) or `js`. The JS target loads `assets/js/` and emits a standalone `main.mjs`. |
| `baseUrl` | Where the runtime assets are served from. **Required in a browser**, optional in Node (the packaged assets are used). It may be relative to the page or an absolute http(s) URL. For the JS target this is still the assets root; the package appends `js/`. |
| `onProgress` | `(value) => {}`, called with 0 to 1 while the target's ~32 MB of gzipped assets download. |
| `fileName` | The name diagnostics use for the source. Defaults to `Main.kt`. |

The returned object:

| Member | Meaning |
| --- | --- |
| `language` | `kotlin`. |
| `target` | `wasm` or `js`. |
| `fileName` | The diagnostic file name. |
| `compilerVersion` | `2.5.0-dev-9169`. |
| `capabilities` | `{ language, compiler, target, stdin, wasmGc, programWasmGc, analysis }`. `wasmGc` is the compiler image; `programWasmGc` is the emitted program. |
| `compile(code, compileOptions?)` | Compile and return `{ ok, target, compilerVersion, fileName, compileMs, errors, files }`. JS files are UTF-8 text; Wasm files are base64. |
| `run(code, input?, runOptions?)` | Compile and run. `input` is pre-supplied line-based stdin for the Wasm target; see below. |
| `warm()` | Compile a throwaway program. Optional; `createCompiler` already loaded the toolchain. |
| `dispose()` | Release this compiler's hold on the shared toolchain. Further runs throw. |

`compileOptions` may set `fileName` and `timeoutMs`. `runOptions` may set
`timeoutMs` (program run, default 15000), `compileTimeoutMs` (default 180000) and
`fileName`.

### `compile()` result

`compile()` does not execute anything; it is the path for a host that wants to
run the output itself.

| Field | Meaning |
| --- | --- |
| `ok` | Whether the compile succeeded. |
| `target` | `wasm` or `js`. |
| `compilerVersion` | The K2 version. |
| `fileName` | The diagnostic file name. |
| `compileMs` | Wall clock for the compile. |
| `errors` | `file:line:column: severity: message` lines on failure. |
| `files` | The emitted files. The JS target returns `main.mjs` with `encoding: 'utf8'`; the Wasm target returns `main.wasm` and its JS glue with `encoding: 'base64'`. |

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

### Stdin (Wasm target)

Kotlin/Wasm's standard library has no console input: `readLine` is unresolved
and `readlnOrNull` reads nothing. When you pass `input` (or the source uses one
of those functions), the package prepends a small prelude that shadows
`readln()`, `readlnOrNull()` and `readLine()` and reads pre-supplied lines
through a `@JsFun` host hook.

The JS target does not currently support stdin; `capabilities.stdin` is `false`.

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
may be cross-origin (jsDelivr works). The wrapper then fetches the target's
~32 MB of gzipped compiler/std lib assets itself and reports progress.

For `target: 'js'`, pass the assets root as `baseUrl`; the package appends `js/`
and loads the source-built JS-target compiler image. The compiler image still
uses WasmGC; the emitted `main.mjs` is ordinary JavaScript and needs no Wasm.

### Classic workers and the IIFE

If the worker cannot use ES modules — LiveCodes builds its language workers from
a content string — `importScripts()` the IIFE build instead:

```js
importScripts('kotlin-wasm.global.js'); // from @live-codes/kotlin-wasm/iife
const compiler = await self.kotlinWasm.createCompiler({
  target: 'js', // or omit for wasm
  baseUrl: 'https://cdn.jsdelivr.net/npm/@live-codes/kotlin-wasm/assets/'
});
```

`self.kotlinWasm` has the same API as the module entry. The IIFE is a classic
script; it starts the compiler and the program in nested workers, so the host
worker is never blocked by a running program.

**Each compiler image is split into two parts under 20 MB each**
(`kotlin-compiler-worker.js.wasm.gz.0` / `.1`) so jsDelivr, which refuses files
over 20 MB, can host them. The wrapper concatenates and inflates them with
`DecompressionStream`.

## Node

```sh
node --experimental-wasm-exnref your-app.mjs
```

The compiler image uses WebAssembly exception handling. Node 24 enables it by
default; Node 22–23 needs `--experimental-wasm-exnref`, which the package's
`test` script passes. The package detects the capability at runtime, so Node 24+
works without the flag. Node 22 or later is required.

```js
import { createCompiler } from '@live-codes/kotlin-wasm';

const compiler = await createCompiler();
await compiler.warm(); // optional: pay the first compile up front
const result = await compiler.run('fun main() { println(42) }');
compiler.dispose();
```

In Node the packaged assets are read from `assets/` (or `assets/js/` for
`target: 'js'`); pass `baseUrl` to fetch them over HTTP instead. The compiler and
the program run in a worker thread, so a program can be stopped by terminating
that thread. If you pass a `baseUrl`, the files are downloaded to a temporary
directory and removed on `dispose()`.

The compiler image uses exception handling for both targets, so Node still needs
`--experimental-wasm-exnref` even when the emitted program is JavaScript.

## What works

Verified in Node and Chromium; `npm test` compiles and runs it.

- Real **Kotlin 2.5.0-dev-9169**, compiled for the **Wasm** and **JS** targets.
- **`target: 'js'`** emits a standalone `main.mjs` ES module that you can import
  yourself; no Wasm import object or program Wasm is involved.
- Data classes, sealed classes and `when`, generics, inheritance, null safety,
  string templates, collections (`groupBy`, `maxBy`, `sortedBy`, `associateWith`,
  `mapValues`, `sumOf`, `joinToString`), exceptions and `kotlin.math`.
- **Exact `print`/`println` output on the Wasm target.** The generated import
  object routes `print` through a `write` hook and `println` through
  `console.log`, so the package keeps the distinction instead of turning every
  call into a line. The JS target uses the Kotlin/JS console/process output.
- **Line-based stdin on the Wasm target** for `readln()`, `readlnOrNull()` and
  `readLine()`, pre-supplied as a string, `Uint8Array` or `ArrayBuffer`; see
  [Stdin](#stdin-wasm-target).
- **Diagnostics** with `file:line:column`, e.g.
  `Main.kt:1:25: error: Initializer type mismatch: expected 'Int', actual 'String'.`
- **A program timeout that leaves the compiler warm.** The program runs in its
  own worker; terminating it does not reload the target's compiler image.

Measured on this machine: browser compiles are ~1–3 s (first ~4 s including the
load), Node compiles are ~7–17 s (the first includes the image's JIT warm-up).
Program runs are tens of milliseconds.

## Limitations

- **Single file, standard library only.** No Gradle and no multi-file projects.
  The compiler takes one source string. A curated set of libraries is available
  on the JS target and downloaded lazily; see [Libraries](#libraries-js-target).
- **Stdin is Wasm-only, line-based and pre-supplied.** There is no interactive
  console: `readln()` reads the next supplied line, and `System.in`/binary
  streams are not available. The JS target has no stdin support yet.
- **Both targets load a compiler image.** The `wasm` target loads ~32.4 MB gz;
  the `js` target loads ~32.7 MB gz. The compiler image still needs WasmGC, even
  though the JS program does not.
- **`target: 'js'` emits one self-contained `main.mjs`.** It is ordinary
  JavaScript; it does not need WasmGC or `--experimental-wasm-exnref` to run
  (the compiler image still does).
- **No Analysis API.** This package compiles and runs; inline diagnostics and
  completion from the real Analysis API are not included. (The upstream
  toolchain has a separate 75 MB image for that.)
- **~32 MB gzipped / ~85 MB inflated per target** on first use, cached by the
  browser. Lazy-load only the target a module actually uses.
- **WasmGC is required for the compiler** — Chrome/Edge 119+, Firefox 120+,
  Safari 18.2+ — plus `DecompressionStream` and nested workers. The JS target's
  emitted program does not need WasmGC, but the compiler image does.
- **Node needs WebAssembly exception handling** for the compiler image on both
  targets: built in on Node 24+, `--experimental-wasm-exnref` on Node 22–23.
  Node 22+ is required.
- **Licensing must be cleared before shipping.** See
  [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## JVM conveniences

A browser has no arguments, no process streams and no console input, but tutorial
code uses them. On the JS target the compiler supplies them, so this compiles and
runs unmodified:

```kotlin
fun main(args: Array<String>) {
    System.out.println("to stdout")
    System.err.println("to stderr")
    println("args = " + args.joinToString(","))
    println("input = " + readLine())
    System.exit(0)
}
```

| API | How |
| --- | --- |
| `main(args)` | The compiler emits `main([])`; the host passes the program's arguments to that call. |
| `System.out` / `System.err` / `System.exit` | A shim in the default package, so no import is needed. |
| `readLine()` / `readln()` / `readlnOrNull()` | Same package, feeding from `run(code, input)`. |

They are compiled with the program, so they cost nothing when unused, and a
program that defines its own is left alone.

## Libraries (JS target)

Kotlin/JS programs expect libraries, which the standard library does not include.
A program that imports one downloads it the first time it compiles — and a
program that imports nothing downloads nothing.

```kotlin
import kotlinx.browser.document
import kotlinx.coroutines.*

fun main() {
    document.getElementById("name")?.textContent = "Kotlin"
    GlobalScope.launch { println("and coroutines") }
}
```

The download is transparent: the package compiles, notices the unresolved
package, fetches that library and its dependencies, and recompiles. The failed
attempt's diagnostics are never returned, so a user sees only real errors.

| Library | Import root |
| --- | --- |
| `kotlin-dom-api-compat` | `kotlin.*` DOM types |
| `kotlinx-browser` | `kotlinx.browser` |
| `kotlinx-html` | `kotlinx.html` |
| `kotlinx-coroutines-core` | `kotlinx.coroutines` |
| `kotlinx-collections-immutable` | `kotlinx.collections.immutable` |
| `kotlinx-datetime` | `kotlinx.datetime` |
| `kotlinx-serialization-core` / `-json` | `kotlinx.serialization` |
| `kotlin-test` | `kotlin.test` |
| `atomicfu` | `kotlinx.atomicfu` |

Only the closure a program needs is fetched: `import kotlinx.browser.document`
downloads two files, not the ten. Versions and hashes are pinned in
[`assets/js/libraries/kotlin-libraries.json`](assets/js/libraries/kotlin-libraries.json);
[`scripts/fetch-libraries.mjs`](scripts/fetch-libraries.mjs) regenerates them.

:::caution Serialization

`kotlinx.serialization` klibs are included, but `@Serializable` needs the
serialization **compiler plugin**, which a GraalVM image cannot load — the
classes were not kept reachable when it was built. `Json.encodeToString` works for
built-in types; a `@Serializable` class compiles and then throws at runtime.

:::

## LiveCodes integration

- Create one compiler per sandbox worker, lazily on the first Kotlin run, and
  `importScripts()` the IIFE. Call `warm()` if the host wants the first compile
  paid at language-load time.
- Pass `baseUrl` pointing at the assets (`kotlin-wasm-copy-assets`, jsDelivr or
  any static host). The split parts keep every file under jsDelivr's 20 MB cap;
  the assets need CORS but no particular `Content-Type`.
- `run()` returns `{ output, errors, exitCode }` directly; map `errors` to the
  compiler panel. Diagnostics are already `file:line:column: severity: message`.
- Pass the editor's stdin text as `run(code, input)` on the Wasm target. Input is
  line-based and pre-supplied: `readln()`, `readlnOrNull()` and `readLine()`
  work, but a prompt-then-respond interaction cannot be supported. The JS target
  has no stdin support yet.
- Set `runOptions.timeoutMs` for a runaway program. The package terminates the
  program worker and keeps the compiler worker alive.
- **For the JS target**, call `compiler.compile(code)` in the compiler worker and
  send the returned `main.mjs` text to the result page. The result page can
  import it as a module (Blob URL) and run it without a Wasm import object. The
  package's `run()` remains available for a self-contained result.
- Lazy-load only the target a module actually uses, the way the other wasm
  languages work.

## Provenance

[`toolchain.lock.json`](toolchain.lock.json) pins both targets: Kotlin
`2.5.0-dev-9169`, the compiler host
`alex28sh/wasm-code-editor@02a8916`, the source builds (Oracle GraalVM, Binaryen,
heap and UTC timestamp), the build tasks, and the SHA-256 of every gzipped part
and inflated archive. The Wasm assets are in `assets/`, the JS assets in
`assets/js/`. `npm run assets` fails if either target and the lock disagree.

Both images are built from source, not copied from another project. See
[`TOOLCHAIN.md`](TOOLCHAIN.md) for the reproducible build and Kotlin upgrade
procedure.

## Development

```sh
cd packages/kotlin-wasm
npm install
npm run assets          # regenerate receipts; verify both targets and the lock
npm run toolchain:check # print the pinned build provenance for both targets
npm run toolchain:plan  # print the source-build/upgrade steps
npm run build:iife      # rewrite dist/kotlin-wasm.global.js (committed)
npm test                # real Wasm and JS compiles in Node, with the exnref flag
node ../../serve.mjs 8001
# open http://localhost:8001/packages/kotlin-wasm/example/        (Wasm module entry)
# open http://localhost:8001/packages/kotlin-wasm/example/js.html (JS target)
# open http://localhost:8001/packages/kotlin-wasm/example/iife.html (classic worker)
```

Build a target with `TARGET=js`:

```sh
TARGET=js HEAP=8g GRADLE_HEAP=1024m bash scripts/build-toolchain.sh
node scripts/toolchain.mjs vendor --target js --compiler-dist .toolchain/js-compilerDist
```

`dist/` is committed because a classic worker can only `importScripts()` a URL.
`kotlin-wasm-copy-assets` verifies the assets against `src/asset-receipts.js`
before copying, so a stale pairing fails there rather than on someone's page.

## Licence

Apache-2.0 for this package's own code, the same license as the Kotlin compiler.
The assets are built from the pinned upstream host: the Kotlin compiler, the
Kotlin/Wasm stdlib and the Kotlin/JS stdlib are Apache-2.0, and both GraalVM Web
Image compiler images are under the GraalVM Free Terms and Conditions (GFTC).
The GFTC and Oracle's distribution notices are included in
[`licenses/`](licenses/). Building them here improves provenance but does not
change those terms. See [`LICENSE`](LICENSE), [`NOTICE`](NOTICE),
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and [`licenses/`](licenses/)
for attribution, provenance and the redistribution caveat.
