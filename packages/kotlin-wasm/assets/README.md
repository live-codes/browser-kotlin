# Vendored real-Kotlin compiler assets

Upstream toolchain: [`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`compiler-host`): the published JVM jars of the **real Kotlin compiler (K2)**
turned into a WebAssembly image with **Oracle GraalVM Web Image**
(`native-image --tool:svm-wasm`).

The committed image is built from that source tree with
[`../scripts/build-toolchain.sh`](../scripts/build-toolchain.sh); see
[`../TOOLCHAIN.md`](../TOOLCHAIN.md). Kotlin version: **2.5.0-dev-9169**.

Pinned source commit: compiler host
`alex28sh/wasm-code-editor@02a8916077b1ea697808f258dee5a5406c887774`. The exact
Oracle GraalVM and Binaryen versions, heap, build timestamp and every asset hash
are in [`../toolchain.lock.json`](../toolchain.lock.json).

| File | Size | What it is |
| --- | ---: | --- |
| `kotlin-compiler-worker.js` | 4,020 B | **our wrapper** (see below) |
| `kotlin-compiler-image.js` | 97,501 B | source-built generated GraalVM worker + worker glue |
| `kotlin-compiler-worker.js.wasm.gz.0` | 14,251,792 B | first half of the gzipped compiler image |
| `kotlin-compiler-worker.js.wasm.gz.1` | 14,251,791 B | second half |
| `kotlin-stdlib-wasm-js.bin.gz` | 3,811,357 B | gzipped Wasm stdlib archive |
| `kotlin-assets.json` | 467 B | parts, sizes and inflated SHA-256 |

Total: **32,416,928 B (30.9 MiB)** gzipped, **84,607,404 B (80.7 MiB)**
inflated. The compiler image is split so every file is under 20 MB; jsDelivr
refuses files over that. The Analysis API image is deliberately not vendored.

## How the compressed worker works

The GraalVM loader requests `self.location.href + ".wasm"` for its module and
`./kotlin-stdlib-wasm-js.bin` for the stdlib. `kotlin-compiler-worker.js` is a
classic-worker wrapper: it patches `fetch`, reads `kotlin-assets.json`, fetches
the listed gzip parts, concatenates them, inflates the result with
`DecompressionStream`, and only then imports the generated
`kotlin-compiler-image.js`. It also posts `asset-progress` messages so the
package's `onProgress` reflects the download. The generated image is untouched.

```
new Worker('kotlin-compiler-worker.js')     // wrapper
  ↓ patches fetch, importScripts
kotlin-compiler-image.js                    // generated GraalVM worker
  ↓ GraalVM.run()
fetch(kotlin-compiler-worker.js.wasm)
  → .gz.0 + .gz.1 concatenated → DecompressionStream → instantiate
  ↓ appended worker glue
fetch(kotlin-stdlib-wasm-js.bin.gz) → DecompressionStream → host.call('init', …)
```

DecompressionStream is supported in every browser that can run WasmGC
(Chrome 80+, Firefox 113+, Safari 16.4+). If a host serves a `.gz` with
`Content-Encoding: gzip`, the wrapper returns the already-inflated bytes instead
of decompressing twice.

The browser package also rewrites the image at runtime to set `config.wasm_path`
and the stdlib URL to absolute asset URLs, because it may load the worker from a
same-origin Blob URL while the assets live on a CDN.

## SHA-256 (shipped, compressed)

```
59214c997286ebb85942ab9c3a585c68b740b2c6f71386833b7ffd2c383f683b         467  kotlin-assets.json
d3f24b6cfbc8640edc52b2db466bab6f0a81f1bcae5602dc581b24e4319cf056       97501  kotlin-compiler-image.js
29f173371e2b538303917f82f45122a1db7243b3874ee3d19039e7ed7dd4bc71        4020  kotlin-compiler-worker.js
505d65bc5f762fc2ba659730066437f7e7546bde4b8ae3124438534c655efb5a    14251792  kotlin-compiler-worker.js.wasm.gz.0
85b389038abcfa6157bf622bf80ad9b994cd326dff986b3166e126c4b54f9acf    14251791  kotlin-compiler-worker.js.wasm.gz.1
8fec8e6f1cb4b5696240c8630b481d259018c4308e4dfabad339a7cb65c3e4e0     3811357  kotlin-stdlib-wasm-js.bin.gz
```

Inflated bytes match the source-built artifacts:

```
90ed9c9b12d3c5cbcde987d6f8a3b2e8cc8b51840e0f5767af0cbc79f31c6d91  72,602,076  compiler image
1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21  12,005,328  stdlib archive
```

`../scripts/asset-receipts.mjs` verifies both and regenerates
`../src/asset-receipts.js`.

## Protocol

`kotlin-compiler-image.js` publishes `globalThis.kotlinCompilerHost` and answers:

```js
worker.postMessage({ id, operation: 'compile', text: source, argument: '' });
// -> { id, answer: '{"ok":true,"files":[...],"diagnostics":[...],"milliseconds":...}' }
```

The returned files (`main.wasm`, `main.mjs`, `main.import-object.mjs`,
`main.js-builtins.mjs`) are rewired to Blob URLs and imported in a module worker
by the package's browser engine.

## Licensing

This package's own code — including the decompression wrapper and the manifest
— is **Apache-2.0**, the same license as the Kotlin compiler; see
[`../LICENSE`](../LICENSE).

**The compiler assets are unconfirmed for redistribution.** The Kotlin compiler
itself is Apache-2.0; the GraalVM Web Image runtime embedded in the generated
`.wasm` is governed by Oracle GraalVM terms (the committed build used Oracle
GraalVM 25.0.4, under Oracle's GraalVM Free Terms and Conditions). Building the
image here improves provenance but does not change those terms. The GFTC and
Oracle's distribution notices are reproduced in
[`../licenses/`](../licenses/); see [`../NOTICE`](../NOTICE) and
[`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md). Review Oracle's terms
before redistributing the image.
