# Third-party notices

This package's own code is **MIT** (see `LICENSE`). This file is the attribution
and provenance record for the toolchain in `assets/`.

## Assets

| Asset | What it is | Terms |
| --- | --- | --- |
| `assets/kotlin-compiler-image.js` | The GraalVM Web Image host generated from the Kotlin compiler | Generated code; includes GraalVM runtime code under GPLv2 + Classpath Exception and Oracle GraalVM terms |
| `assets/kotlin-compiler-worker.js.wasm.gz.0` | First half of the gzipped compiler image | Same as above |
| `assets/kotlin-compiler-worker.js.wasm.gz.1` | Second half of the gzipped compiler image | Same as above |
| `assets/kotlin-stdlib-wasm-js.bin.gz` | The Kotlin/Wasm standard library archive, gzipped | Apache-2.0 |
| `assets/kotlin-assets.json` | Manifest of parts, sizes and inflated SHA-256 | MIT (this package) |
| `assets/kotlin-compiler-worker.js` | The decompression wrapper around the generated worker | MIT (this package) |

The compiler itself is the **real Kotlin compiler (K2)**, version
`2.5.0-dev-9169`, which is Apache-2.0. It was turned into a WebAssembly image
with **Oracle GraalVM Web Image** (`native-image --tool:svm-wasm`) by the
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
project. The committed image is built from that source tree by
[`scripts/build-toolchain.sh`](scripts/build-toolchain.sh); see
[`TOOLCHAIN.md`](TOOLCHAIN.md).

The Kotlin compiler and the Kotlin/Wasm standard library are developed by
JetBrains s.r.o. and the Kotlin Programming Language contributors, and are
licensed under the Apache License, Version 2.0. Kotlin's own third-party notices
are at <https://github.com/JetBrains/kotlin/blob/master/license/README.md>.

The committed build used Oracle GraalVM 25.0.4 and Binaryen 133, under Oracle's
GraalVM Free Terms and Conditions. The generated image embeds GraalVM runtime
code; the generated script carries GPLv2 + Classpath Exception headers. The
exact commits, build tools, heap and every asset hash are pinned in
[`toolchain.lock.json`](toolchain.lock.json): host
`alex28sh/wasm-code-editor@02a8916`, source build (Oracle GraalVM + Binaryen).
**Treat these assets as evaluation-only until Oracle's terms are confirmed for
redistribution; this package does not grant a licence to redistribute them.**

## What this package changed

The compiler and standard library are built from the pinned upstream source;
this package did not modify the compiler classes. For hosting and transport
only:

- the 72,602,076-byte compiler image was gzipped, then split into two parts
  (14,251,792 and 14,251,791 bytes) so each file is under jsDelivr's 20 MB cap;
- the standard library archive was gzipped;
- `kotlin-assets.json` records the parts and the inflated SHA-256 values;
- `kotlin-compiler-worker.js` is our wrapper that concatenates, inflates, and
  hands the bytes to the generated loader.

Binaryen 133 (`wasm-as`) is a build-time dependency and is not shipped; it is
Apache-2.0.

Inflated checksums (they match the source-built artifacts):

```
90ed9c9b12d3c5cbcde987d6f8a3b2e8cc8b51840e0f5767af0cbc79f31c6d91  compiler image (72,602,076 bytes)
1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21  stdlib archive (12,005,328 bytes)
```

## What the browser downloads

The compiler and standard library only. The upstream **Analysis API** image
(another ~75 MB) is deliberately not shipped, so this package compiles and runs
but has no semantic completion or inline analysis from the compiler.
