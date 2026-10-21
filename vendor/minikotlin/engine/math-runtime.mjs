// math-runtime.mjs — loads the kotlin.math WASM runtime and produces the
// `env.__math_*` imports for a compiled minikotlin program.
//
// The transcendentals (sin/cos/exp/ln/pow/asinh/…) are computed IN WebAssembly
// by musl's libm (source: modules/kotlin.math/runtime/math_rt.c, built to
// kotlin_math_rt.wasm) — NOT by the JS host's `Math.*`. This module instantiates
// that runtime once and returns thin trampolines that FORWARD each call into it.
//
// Why a JS trampoline and not a direct wasm→wasm import: minikotlin emits WASM-GC
// and packs all func types into one big `(rec …)` group, so V8 does not treat the
// program's `(f64)->f64` import type as identical to the runtime module's plain
// `(f64)->f64` export — a direct import LinkErrors. The trampoline bridges that
// GC↔MVP type gap; the sin/exp/pow *algorithms* still run in the WASM runtime, so
// there is no `Math.*` computation on the JS side (only a forwarding call).
//
// `wasmBytes` is an ArrayBuffer/Uint8Array of kotlin_math_rt.wasm — each host
// fetches it its own way (Node: fs.readFileSync of the committed unit artifact;
// browser: fetch of web/wasm/kotlin_math_rt.wasm).

export async function makeMathImports(wasmBytes) {
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const rt = instance.exports;
  const out = {};
  for (const name in rt) {
    if (name.startsWith("__math_") && typeof rt[name] === "function") {
      const fn = rt[name];
      out[name] = (...args) => fn(...args); // variadic: covers 1-arg + 2-arg (pow/log/atan2/hypot)
    }
  }
  return out;
}
