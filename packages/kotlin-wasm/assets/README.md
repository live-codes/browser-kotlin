# Vendored real-Kotlin compiler assets

Upstream toolchain: [`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
(`compiler-host`): the published JVM jars of the **real Kotlin compiler (K2)**
turned into a WebAssembly image with **Oracle GraalVM Web Image**
(`native-image --tool:svm-wasm`).

The committed images are built from that source tree with
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

## JS target

`assets/js/` is the same asset layout for the Kotlin/JS backend. This is a
second GraalVM image; the program it emits is a standalone `main.mjs`, but the
compiler image still runs as WebAssembly.

| File | Size | What it is |
| --- | ---: | --- |
| `kotlin-compiler-worker.js` | 4,020 B | the same wrapper |
| `kotlin-compiler-image.js` | 97,505 B | source-built JS-target generated worker + glue |
| `kotlin-compiler-worker.js.wasm.gz.0` | 14,661,265 B | first half of the gzipped JS compiler image |
| `kotlin-compiler-worker.js.wasm.gz.1` | 14,661,264 B | second half |
| `kotlin-stdlib-js.bin.gz` | 3,304,275 B | gzipped Kotlin/JS stdlib archive |
| `kotlin-assets.json` | 462 B | parts, sizes and inflated SHA-256 |

Total: **32,728,791 B (31.2 MiB)** gzipped, **85,492,694 B (81.5 MiB)**
inflated.

SHA-256 (shipped, compressed):

```
8dfc994ac40c8f2fe29e701c16fb4731f0636c69cdaa72643148a4a4732336ff         462  js/kotlin-assets.json
2e6211e8417a2353c3abcfa2bf8de6d91baa0097cf7c45b63d30366e998eb9da       97505  js/kotlin-compiler-image.js
29f173371e2b538303917f82f45122a1db7243b3874ee3d19039e7ed7dd4bc71        4020  js/kotlin-compiler-worker.js
c1f8bc7399c7d6bb1515721a7ac7fbd820d6e35d3d9022185213954f6acf2a36    14661265  js/kotlin-compiler-worker.js.wasm.gz.0
a69bd4939a7ca5c519d1e3cadce07d2127a251246567f8aae773ad74b7bbae86    14661264  js/kotlin-compiler-worker.js.wasm.gz.1
e24bdc0de4da8571fa3ae7521733b1bf123facfea8732355acce98937cba765e     3304275  js/kotlin-stdlib-js.bin.gz
```

Inflated bytes:

```
1b07b557851009dfef305c8797e1e5ea53f6f2dd5b9f89f6e24eb958a313f60e  74,999,356  JS compiler image
ca8fdeef1f5707f605bd52878e79cc6705fa3bb811d08052a66d46902aa38083  10,493,338  Kotlin/JS stdlib archive
```

The JS target's own code and wrapper are Apache-2.0. The Kotlin/JS stdlib is
Apache-2.0; the compiler image embeds GraalVM runtime code under the GFTC, with
the same [`../licenses/`](../licenses/) notice as the Wasm image.

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
and both stdlibs are Apache-2.0; the GraalVM Web Image runtime embedded in the
generated `.wasm` files is governed by Oracle GraalVM terms (the committed builds
used Oracle GraalVM 25.0.4, under the GraalVM Free Terms and Conditions).
Building the images here improves provenance but does not change those terms. The
GFTC and Oracle's distribution notices are reproduced in
[`../licenses/`](../licenses/); see [`../NOTICE`](../NOTICE) and
[`../THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md). Review Oracle's terms
before redistributing the images.
