# Third-party notices

This package's own code is **Apache-2.0** (see `LICENSE` and `NOTICE`). This
file is the attribution and provenance record for the toolchain in `assets/`.

## Assets

| Asset | What it is | Terms |
| --- | --- | --- |
| `assets/kotlin-compiler-image.js` | The GraalVM Web Image host generated from the Kotlin compiler | Generated code; includes GraalVM runtime code under GPLv2 + Classpath Exception and Oracle GraalVM terms |
| `assets/kotlin-compiler-worker.js.wasm.gz.0` | First half of the gzipped compiler image | Same as above |
| `assets/kotlin-compiler-worker.js.wasm.gz.1` | Second half of the gzipped compiler image | Same as above |
| `assets/kotlin-stdlib-wasm-js.bin.gz` | The Kotlin/Wasm standard library archive, gzipped | Apache-2.0 |
| `assets/kotlin-assets.json` | Manifest of parts, sizes and inflated SHA-256 | Apache-2.0 (this package) |
| `assets/kotlin-compiler-worker.js` | The decompression wrapper around the generated worker | Apache-2.0 (this package) |

The compiler itself is the **real Kotlin compiler (K2)**, version
`2.5.0-dev-9169`, which is Apache-2.0. It was turned into a WebAssembly image
with **Oracle GraalVM Web Image** (`native-image --tool:svm-wasm`) by the
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
project. The prebuilt images were published by
[`space-enthusiast/kotlin-on-web-playground`](https://github.com/space-enthusiast/kotlin-on-web-playground).

The upstream build used Oracle GraalVM 25i4, under Oracle's GraalVM Free Terms
and Conditions. The generated image embeds GraalVM runtime code; the generated
script carries GPLv2 + Classpath Exception headers. The publishing repository
has no licence file. The exact commits and every asset hash are pinned in
[`toolchain.lock.json`](toolchain.lock.json): host
`alex28sh/wasm-code-editor@02a8916`, prebuilt image
`space-enthusiast/kotlin-on-web-playground@5e5a40d`. **Treat these assets as
evaluation-only until the terms are confirmed with the upstream authors; this
package does not grant a licence to redistribute them.**

## What this package changed

Nothing in the compiler image or standard library was modified. For hosting and
transport only:

- the 74,849,307-byte compiler image was gzipped, then split into two parts
  (13,000,000 and 12,826,360 bytes) so each file is under jsDelivr's 20 MB cap;
- the standard library archive was gzipped;
- `kotlin-assets.json` records the parts and the inflated SHA-256 values;
- `kotlin-compiler-worker.js` is our wrapper that concatenates, inflates, and
  hands the bytes to the generated loader.

Inflated checksums (they match the upstream uncompressed artifacts):

```
e197bbe3e265505997231cc1b907ab33acdb507a88647308e7790cc7afdb2512  compiler image (74,849,307 bytes)
1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21  stdlib archive (12,005,328 bytes)
```

## What the browser downloads

The compiler and standard library only. The upstream **Analysis API** image
(another ~75 MB) is deliberately not shipped, so this package compiles and runs
but has no semantic completion or inline analysis from the compiler.
