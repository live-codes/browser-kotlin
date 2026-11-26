// Kotlin/Wasm's stdlib has no console input: `readLine` is unresolved and
// `readlnOrNull` returns null. When input is supplied we append a small prelude
// that shadows those functions and reads lines from a host hook. It is
// line-based, pre-supplied input — not an interactive console — but it gives
// programs the API they expect.
import { buildCompatShims } from './shim.js';

export const JS_STDIN_HOOK = '__liveCodesKotlinWasmReadLine';

const PRELUDE_HEADER = `@JsFun("() => globalThis.${JS_STDIN_HOOK}()")
external fun __liveCodesKotlinWasmStdin(): String?`;

function definesNoArgFunction(code, name) {
  return new RegExp(`\\bfun\\s+${name}\\s*\\(\\s*\\)`).test(code);
}

export function buildPrelude(code) {
  const lines = [PRELUDE_HEADER];
  if (!definesNoArgFunction(code, 'readlnOrNull')) {
    lines.push('fun readlnOrNull(): String? = __liveCodesKotlinWasmStdin()');
  }
  if (!definesNoArgFunction(code, 'readLine')) {
    lines.push('fun readLine(): String? = __liveCodesKotlinWasmStdin()');
  }
  if (!definesNoArgFunction(code, 'readln')) {
    lines.push('fun readln(): String = readlnOrNull() ?: throw NoSuchElementException("EOF")');
  }
  return `${lines.join('\n')}\n\n`;
}

/** Split stdin the way Kotlin's line readers do: no trailing empty line. */
export function splitLines(input) {
  if (!input) return [];
  const normalized = String(input).replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}

/**
 * The source to hand the compiler for one program.
 *
 * Two independent additions, both appended after the program so every line number
 * the user sees stays where they expect it:
 *
 *  - the JVM compatibility shims (both targets), and
 *  - the stdin prelude (wasm, when input is supplied or the program reads it).
 *
 * Appending means diagnostics need no offset mapping: the compiler reports user
 * errors at their real offsets. `mapOffset` is kept for callers that already pass a
 * function, and is the identity here.
 */
export function prepareSource(code, input = '', target = 'wasm') {
  const usesStdin = /\b(readln|readlnOrNull|readLine)\s*\(/.test(code);
  const needsStdin = target === 'wasm' && (Boolean(input) || usesStdin);

  const shims = buildCompatShims(code, target);
  const stdin = needsStdin ? `\n${buildPrelude(code)}` : '';
  if (!shims && !stdin) {
    return { source: code, injected: false, mapOffset: (offset) => offset };
  }

  // Appended, so no offset shifts.
  const source = `${code}\n${shims}${stdin}`;
  return { source, injected: true, mapOffset: (offset) => offset };
}
