# Third-party notices

This package's own code is **Apache-2.0** (see `LICENSE`), the same license as
the Kotlin compiler. This file is the attribution and provenance record for the
toolchain in `assets/`.

## Assets

| Asset | What it is | Terms |
| --- | --- | --- |
| `assets/kotlin-compiler-image.js` | The GraalVM Web Image host generated from the Kotlin compiler | Generated code; includes GraalVM runtime code under GPLv2 + Classpath Exception and the GraalVM Free Terms and Conditions (GFTC) |
| `assets/kotlin-compiler-worker.js.wasm.gz.0` | First half of the gzipped compiler image | Same as above |
| `assets/kotlin-compiler-worker.js.wasm.gz.1` | Second half of the gzipped compiler image | Same as above |
| `assets/kotlin-stdlib-wasm-js.bin.gz` | The Kotlin/Wasm standard library archive, gzipped | Apache-2.0 |
| `assets/kotlin-assets.json` | Manifest of parts, sizes and inflated SHA-256 | Apache-2.0 (this package) |
| `assets/kotlin-compiler-worker.js` | The decompression wrapper around the generated worker | Apache-2.0 (this package) |
| `assets/js/kotlin-compiler-image.js` | The JS-target GraalVM Web Image host | Generated code; includes GraalVM runtime code under GPLv2 + Classpath Exception and the GFTC |
| `assets/js/kotlin-compiler-worker.js.wasm.gz.0` | First half of the gzipped JS-target compiler image | Same as above |
| `assets/js/kotlin-compiler-worker.js.wasm.gz.1` | Second half of the gzipped JS-target compiler image | Same as above |
| `assets/js/kotlin-stdlib-js.bin.gz` | The Kotlin/JS standard library archive, gzipped | Apache-2.0 |
| `assets/js/kotlin-assets.json` | JS-target manifest | Apache-2.0 (this package) |
| `assets/js/kotlin-compiler-worker.js` | JS-target decompression wrapper | Apache-2.0 (this package) |

The compiler itself is the **real Kotlin compiler (K2)**, version
`2.5.0-dev-9169`, which is Apache-2.0. It was turned into WebAssembly images
with **Oracle GraalVM Web Image** (`native-image --tool:svm-wasm`) by the
[`alex28sh/wasm-code-editor`](https://github.com/alex28sh/wasm-code-editor)
project. The committed images are built from that source tree by
[`scripts/build-toolchain.sh`](scripts/build-toolchain.sh); see
[`TOOLCHAIN.md`](TOOLCHAIN.md).

The Kotlin compiler, the Kotlin/Wasm standard library and the Kotlin/JS standard
library are developed by JetBrains s.r.o. and the Kotlin Programming Language
contributors, and are licensed under the Apache License, Version 2.0. Kotlin's
own third-party notices are at
<https://github.com/JetBrains/kotlin/blob/master/license/README.md>.

## GraalVM

Both committed compiler images and loaders (Wasm and JS targets) were generated
with **Oracle GraalVM Web Image (Substrate VM) 25.0.4+7.1**, and the images
embed GraalVM runtime code. The generated scripts carry GPLv2 + Classpath
Exception headers.

Oracle GraalVM is governed by the **GraalVM Free Terms and Conditions (GFTC)**.
The GFTC, Oracle's `NOTICE.txt`, and the distribution's license-information user
manual are reproduced verbatim in:

- [`licenses/GraalVM-LICENSE.txt`](licenses/GraalVM-LICENSE.txt)
- [`licenses/GraalVM-NOTICE.txt`](licenses/GraalVM-NOTICE.txt)
- [`licenses/GraalVM-license-information-user-manual.zip`](licenses/GraalVM-license-information-user-manual.zip)

See also [`NOTICE`](NOTICE).

The exact commits, build tools, heap and every asset hash are pinned in
[`toolchain.lock.json`](toolchain.lock.json): host
`alex28sh/wasm-code-editor@02a8916`, source build (Oracle GraalVM + Binaryen).
The package's Apache-2.0 license does not grant rights to the GraalVM image;
Oracle's GFTC governs it. Review the GFTC before redistributing the assets.

## What this package changed

The compiler and standard libraries are built from the pinned upstream source;
this package did not modify the compiler classes. For hosting and transport
only:

- the Wasm compiler image (72,602,076 bytes) was gzipped and split into two
  parts (14,251,792 and 14,251,791 bytes);
- the JS-target compiler image (74,999,356 bytes) was gzipped and split into two
  parts (14,661,265 and 14,661,264 bytes);
- each image is under jsDelivr's 20 MB per-file cap;
- the Wasm stdlib (12,005,328 bytes) and Kotlin/JS stdlib (10,493,338 bytes)
  archives were gzipped;
- each target's `kotlin-assets.json` records the parts and inflated SHA-256;
- each `kotlin-compiler-worker.js` wrapper concatenates, inflates and hands the
  bytes to the generated loader.

Binaryen 133 (`wasm-as`) is a build-time dependency and is not shipped; it is
Apache-2.0.

Inflated checksums (they match the source-built artifacts):

```
90ed9c9b12d3c5cbcde987d6f8a3b2e8cc8b51840e0f5767af0cbc79f31c6d91   72,602,076  Wasm compiler image
1745038e115f1b1f591a0fdfd745458c91fa938dc4303898d4d2a63aacfabf21   12,005,328  Kotlin/Wasm stdlib
1b07b557851009dfef305c8797e1e5ea53f6f2dd5b9f89f6e24eb958a313f60e   74,999,356  JS compiler image
ca8fdeef1f5707f605bd52878e79cc6705fa3bb811d08052a66d46902aa38083   10,493,338  Kotlin/JS stdlib
```

## What the browser downloads

The target's compiler image and standard library only. The upstream **Analysis
API** image (another ~75 MB) is deliberately not shipped, so this package
compiles and runs but has no semantic completion or inline analysis from the
compiler. The JS target still downloads a compiler image; only the emitted
program is JavaScript.
