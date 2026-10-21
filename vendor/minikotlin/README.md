# Vendored minikotlin assets

Upstream: <https://minikotlin.run> — reported version **0.1.0** (`mkc_version()`).

Copied on **2026-10-21** from the upstream Studio:

| File | Upstream URL |
| --- | --- |
| `minikotlin.js` | `https://minikotlin.run/wasm/minikotlin.js` |
| `minikotlin.wasm` | `https://minikotlin.run/wasm/minikotlin.wasm` |
| `engine/compile-bridge.js` | `https://minikotlin.run/engine/compile-bridge.js` |
| `engine/host-imports.mjs` | `https://minikotlin.run/engine/host-imports.mjs` |
| `engine/js-runtime.mjs` | `https://minikotlin.run/engine/js-runtime.mjs` |
| `engine/math-runtime.mjs` | `https://minikotlin.run/engine/math-runtime.mjs` |
| `engine/char-runtime.mjs` | `https://minikotlin.run/engine/char-runtime.mjs` |
| `engine/kotlin_math_rt.wasm` | `https://minikotlin.run/wasm/kotlin_math_rt.wasm` |
| `engine/kotlin_char_rt.wasm` | `https://minikotlin.run/wasm/kotlin_char_rt.wasm` |

No upstream file has been modified. `compile-bridge.js` is kept for reference;
this PoC uses its own wrapper in `runner.js` (the upstream bridge expects a
global set by a classic `<script>`).

`package.json` (`{"type":"commonjs"}`) is a local addition so Node's
`require()` treats `minikotlin.js` as CommonJS inside this ESM project. Browsers
ignore it; the worker imports the file explicitly as a module.

## SHA-256

```
6dbca5c8810d1e4bcbd97d8d931378e912cb94bed265278bc4beef370930ddf6  minikotlin.js
86c134c94596744bdebb23e493433587b9e0b5b185ece3c1b34d34e568a3ecf6  minikotlin.wasm
c46a252c5133d366caad685903e170689334217b2095a0101a596669fb4f6f34  engine/char-runtime.mjs
53001b7cf43dcf74de84596659586c3e0b56f0159a64d0fa818f5319ac38e909  engine/compile-bridge.js
94341db06b2a2cdccb2555a13a1d56a023267ebb1b93e69b56ae7e95100f9a7e  engine/host-imports.mjs
2709b243be299601b32b360a57e3d87b13a8160826d8a6009ca4b4f38bb5ff9f  engine/js-runtime.mjs
c1e6ba0c35a98a3c66834b5a667cb6663af81c510a34b3832da23596246bd1d8  engine/kotlin_char_rt.wasm
82bcc3799c510a77a21b7cf6aed1cabc0179219ca643fbc4d42179da25119e17  engine/kotlin_math_rt.wasm
43d9a9d492c61b0f20cf96864f1bc9125c49a0b18aa9b24d253075b1de4d8549  engine/math-runtime.mjs
```

## Licence

**Unconfirmed.** The upstream site does not publish a licence (checked
2026-10-21). These files are vendored for evaluation only. Do not redistribute
or ship them until the licence is established with the upstream author.
