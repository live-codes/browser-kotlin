# Libraries

The Kotlin compiler image ships only the Kotlin/JS standard library. Popular
Kotlin libraries are optional archives, downloaded lazily the first time a
program needs one, so a program that does not import them pays nothing.

Each `*.bin.gz` is an unpacked klib in the same archive format as the standard
library: a count, then the name, size and bytes of every file. `kotlin-libraries.json`
pins the version, closure and inflated SHA-256 of each archive.

## Available libraries

| Name | Import root | Depends on |
| --- | --- | --- |
| `kotlin-dom-api-compat` | `kotlin.*` DOM types | — |
| `kotlinx-browser` | `kotlinx.browser` | `kotlin-dom-api-compat` |
| `kotlinx-html` | `kotlinx.html` | `kotlin-dom-api-compat` |
| `kotlinx-coroutines-core` | `kotlinx.coroutines` | `kotlin-dom-api-compat`, `atomicfu` |
| `kotlinx-collections-immutable` | `kotlinx.collections.immutable` | `kotlin-dom-api-compat` |
| `kotlinx-datetime` | `kotlinx.datetime` | `kotlinx-serialization-core`, `kotlin-dom-api-compat` |
| `kotlinx-serialization-core` | `kotlinx.serialization` | — |
| `kotlinx-serialization-json` | `kotlinx.serialization.json` | `kotlinx-serialization-core` |
| `kotlin-test` | `kotlin.test` | — |
| `atomicfu` | `kotlinx.atomicfu` | `kotlin-dom-api-compat` |

## Why the closure ships together

A library's `-libraries` root must be a separate entry: K2 does not see a klib
nested inside another one, and repeating `-libraries` replaces the value instead
of appending. So each library is its own archive, and the dependencies above are
fetched with it rather than resolved at run time.

## Versions

The versions are pinned in `kotlin-libraries.json`. ABI compatibility with the
compiler is loose in practice — klibs built by Kotlin 1.8 through 2.5 all link
against our 2.5.0-dev compiler.
