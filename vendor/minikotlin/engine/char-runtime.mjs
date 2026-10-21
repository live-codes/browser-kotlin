// char-runtime.mjs — loads the kotlin.text Char WASM runtime and produces the
// Char-classification imports for a compiled minikotlin program.
//
// General Category + predicates (isLetter/isDigit/…) are computed IN WebAssembly
// from a vendored UCD table (source: modules/kotlin.text/runtime/char_rt.c, built
// to kotlin_char_rt.wasm) — NOT by the JS host's `\p{…}` regex or `toUpperCase`.
// Same Model-A pattern as math-runtime: instantiate the runtime once, forward its
// exports. Two consumers share ONE runtime:
//
//   • flag-on (--gc-strings): inline codegen emits `call $__ucd_*` on an i32 code
//     unit — forwarded verbatim (no JS Unicode logic at all).
//   • flag-off: the legacy `__char_*` imports take a 1-char externref STRING; we
//     forward them through the same runtime after a codepoint read. That read is
//     the only JS left (a host externref boundary, like flatten/materialize) —
//     the Unicode computation itself runs in WASM.
//
// Why a JS trampoline and not a direct wasm→wasm import: minikotlin packs all
// func types into one big `(rec …)` group, so V8 won't unify the program's
// `(i32)->i32` import type with the runtime's plain `(i32)->i32` export — a direct
// import LinkErrors (same reason math needs one). The classification *algorithm*
// still runs in the WASM runtime.
//
// `wasmBytes` is an ArrayBuffer/Uint8Array of kotlin_char_rt.wasm.

export async function makeCharImports(wasmBytes) {
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const rt = instance.exports;
  const out = {};

  // i32 → i32 runtime exports, forwarded verbatim (flag-on inline codegen).
  for (const name in rt) {
    if (name.startsWith("__ucd_") && typeof rt[name] === "function") {
      const fn = rt[name];
      out[name] = (c) => fn(c | 0);
    }
  }

  // Legacy string-based `__char_*` imports (flag-off, and flag-on's non-drained
  // ops): bridge the 1-char string → code unit, then run the WASM classifier.
  const code = (s) => String(s).charCodeAt(0) | 0;
  const i32map = {
    __char_category:            rt.__ucd_category,
    __char_is_digit:            rt.__ucd_is_digit,
    __char_is_letter:           rt.__ucd_is_letter,
    __char_is_letter_or_digit:  rt.__ucd_is_letter_or_digit,
    __char_is_upper_case:       rt.__ucd_is_upper_case,
    __char_is_lower_case:       rt.__ucd_is_lower_case,
    __char_is_whitespace:       rt.__ucd_is_whitespace,
  };
  for (const name in i32map) {
    const fn = i32map[name];
    if (typeof fn === "function") out[name] = (s) => fn(code(s));
  }

  // Simple case mapping: 1-char string → 1-char string (SIMPLE mapping; the
  // expanding String Char.uppercase() ß→"SS" is a separate __str_* op).
  const strmap = {
    __char_uppercase:      rt.__ucd_to_upper,
    __char_lowercase:      rt.__ucd_to_lower,
    __char_titlecase_char: rt.__ucd_to_title,
  };
  for (const name in strmap) {
    const fn = strmap[name];
    if (typeof fn === "function") out[name] = (s) => String.fromCharCode(fn(code(s)));
  }

  return out;
}
