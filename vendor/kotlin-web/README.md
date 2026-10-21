# Vendored real-Kotlin compiler assets

Upstream toolchain: [`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`compiler-host`): the published JVM jars of the **real Kotlin compiler (K2)**
turned into a WebAssembly image with **Oracle GraalVM Web Image**
(`native-image --tool:svm-wasm`).

The prebuilt images are published by
[`space-enthusiast/kotlin-on-web-playground`](https://github.com/space-enthusiast/kotlin-on-web-playground)
(GitHub Pages), which is where these files were copied from on **2026-10-21**:

| File | Size | Source |
| --- | ---: | --- |
| `kotlin-compiler-worker.js` | 112,773 B | `https://space-enthusiast.github.io/kotlin-on-web-playground/kotlin-compiler-worker.js` |
| `kotlin-compiler-worker.js.wasm` | 74,849,307 B | same directory |
| `kotlin-stdlib-wasm-js.bin` | 12,005,328 B | same directory |

Kotlin version reported by the toolchain: **2.5.0-dev-9169**.

The Analysis API image (`kotlin-analysis-worker.js` + 73.7 MB wasm) is
**deliberately not vendored**: this PoC only compiles and runs, and the compiler
worker loads its own standard library. Skipping it halves the download.

## SHA-256

```
2188cb431a4ef48c158f00d95ab3989dfdbd1b6264d577464243581dd2406ac5  kotlin-compiler-worker.js
e197bbe3e265505997231cc1b907ab33acdb507a88647308e7790cc7afdb2512  kotlin-compiler-worker.js.wasm
1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21  kotlin-stdlib-wasm-js.bin
```

## How the worker is used

`kotlin-compiler-worker.js` is a classic Worker (not a module). It loads
`kotlin-compiler-worker.js.wasm` next to itself, fetches
`kotlin-stdlib-wasm-js.bin` next to itself, and publishes
`globalThis.kotlinCompilerHost`. Messages are:

```js
worker.postMessage({ id, operation: 'compile', text: source, argument: '' });
// -> { id, answer: '{"ok":true,"files":[...],"diagnostics":[...],"milliseconds":...}' }
```

The returned files (`main.wasm`, `main.mjs`, `main.import-object.mjs`,
`main.js-builtins.mjs`) are rewired to Blob URLs and imported in a module
worker by `real.html`.

## Licensing

**Unconfirmed for redistribution.** The Kotlin compiler itself is Apache-2.0;
the GraalVM Web Image runtime embedded in the generated `.wasm` is governed by
Oracle GraalVM terms (the upstream build used Oracle GraalVM 25i4, under
Oracle's GraalVM Free Terms and Conditions). The publishing repository has no
licence file. These assets are vendored for evaluation only; confirm the terms
with the upstream authors before shipping them.
