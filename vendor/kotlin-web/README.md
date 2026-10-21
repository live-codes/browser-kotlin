# Vendored real-Kotlin compiler assets

Upstream toolchain: [`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`compiler-host`): the published JVM jars of the **real Kotlin compiler (K2)**
turned into a WebAssembly image with **Oracle GraalVM Web Image**
(`native-image --tool:svm-wasm`).

The prebuilt images are published by
[`space-enthusiast/kotlin-on-web-playground`](https://github.com/space-enthusiast/kotlin-on-web-playground)
(GitHub Pages). Copied from there on **2026-10-21**.

Kotlin version reported by the toolchain: **2.5.0-dev-9169**.

| File | Size | What it is |
| --- | ---: | --- |
| `kotlin-compiler-worker.js` | 1,787 B | **our wrapper** (see below) |
| `kotlin-compiler-image.js` | 112,773 B | upstream generated GraalVM worker, unmodified |
| `kotlin-compiler-worker.js.wasm.gz` | 25,826,360 B | compiler image, gzip -9 (74,849,307 B inflated) |
| `kotlin-stdlib-wasm-js.bin.gz` | 3,811,357 B | Wasm stdlib archive, gzip -9 (12,005,328 B inflated) |

Total shipped: **29,752,277 B (28.4 MiB)** — down from ~87 MB uncompressed.
The uncompressed originals are not shipped.

The Analysis API image (`kotlin-analysis-worker.js` + 73.7 MB wasm) is
**deliberately not vendored**: this PoC only compiles and runs, and the compiler
worker loads its own standard library. Skipping it halves the pipeline and
avoids a second 75 MB payload.

## How the compressed worker works

The GraalVM loader requests two files itself:

- `self.location.href + ".wasm"` — with this wrapper served as
  `kotlin-compiler-worker.js`, that is `kotlin-compiler-worker.js.wasm`;
- `./kotlin-stdlib-wasm-js.bin`, relative to the worker.

`kotlin-compiler-worker.js` is a classic-worker wrapper. Before
`importScripts('./kotlin-compiler-image.js')`, it patches `self.fetch` so those
two paths are fetched with `.gz` appended and the response body is piped
through `DecompressionStream('gzip')`. The generated image is untouched.

```
new Worker('./vendor/kotlin-web/kotlin-compiler-worker.js')   // wrapper
  ↓ patches fetch, importScripts
kotlin-compiler-image.js                                       // generated GraalVM worker
  ↓ GraalVM.run()
fetch(kotlin-compiler-worker.js.wasm.gz) → DecompressionStream → instantiate
  ↓ appended worker glue
fetch(kotlin-stdlib-wasm-js.bin.gz)      → DecompressionStream → host.call('init', …)
```

DecompressionStream is supported in every browser that can run WasmGC
(Chrome 80+, Firefox 113+, Safari 16.4+). If a host serves the `.gz` with
`Content-Encoding: gzip`, the wrapper uses the already-inflated response instead
of decompressing twice.

## SHA-256

```
b6e63b3e58bfa8cc277a58c4075b326f0780e99e4ca23481d513d5638244b7fa  kotlin-compiler-worker.js
2188cb431a4ef48c158f00d95ab3989dfdbd1b6264d577464243581dd2406ac5  kotlin-compiler-image.js
bec32126267a35131f1e3c33f731d5d5f743276c45eea46322c25eadd4d35f6b  kotlin-compiler-worker.js.wasm.gz
8fec8e6f1cb4b5696240c8630b481d259018c4308e4dfabad339a7cb65c3e4e0  kotlin-stdlib-wasm-js.bin.gz
```

Inflated bytes match the previously vendored, uncompressed originals:

```
e197bbe3e265505997231cc1b907ab33acdb507a88647308e7790cc7afdb2512  kotlin-compiler-worker.js.wasm
1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21  kotlin-stdlib-wasm-js.bin
```

## Protocol

`kotlin-compiler-image.js` publishes `globalThis.kotlinCompilerHost` and answers:

```js
worker.postMessage({ id, operation: 'compile', text: source, argument: '' });
// -> { id, answer: '{"ok":true,"files":[...],"diagnostics":[...],"milliseconds":...}' }
```

The returned files (`main.wasm`, `main.mjs`, `main.import-object.mjs`,
`main.js-builtins.mjs`) are rewired to Blob URLs and imported in a module worker
by `real.html`.

## Licensing

**Unconfirmed for redistribution.** The Kotlin compiler itself is Apache-2.0;
the GraalVM Web Image runtime embedded in the generated `.wasm` is governed by
Oracle GraalVM terms (the upstream build used Oracle GraalVM 25i4, under
Oracle's GraalVM Free Terms and Conditions). The publishing repository has no
licence file. These assets are vendored for evaluation only; confirm the terms
with the upstream authors before shipping them.
