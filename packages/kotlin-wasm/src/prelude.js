// Kotlin/Wasm's stdlib has no console input: `readLine` is unresolved and
// `readlnOrNull` returns null. When input is supplied we prepend a small
// prelude that shadows those functions and reads lines from a host hook. It is
// line-based, pre-supplied input — not an interactive console — but it gives
// programs the API they expect.
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

// Insert after the leading package/import block so the prelude stays in the
// same package and Kotlin's "imports come first" rule still holds.
function findInsertOffset(code) {
  const lines = code.split('\n');
  let offset = 0;
  let insertAt = 0;
  let inBlockComment = false;
  let seenHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const end = Math.min(code.length, offset + line.length + (i < lines.length - 1 ? 1 : 0));

    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
    } else if (trimmed.startsWith('/*')) {
      inBlockComment = !trimmed.includes('*/');
    } else if (trimmed === '' || trimmed.startsWith('//')) {
      // Leading whitespace and comments are skipped.
    } else if (!seenHeader && /^package\s+/.test(trimmed)) {
      insertAt = end;
      seenHeader = true;
    } else if (/^import\s+/.test(trimmed)) {
      insertAt = end;
      seenHeader = true;
    } else {
      break;
    }
    offset = end;
  }
  return insertAt;
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
 * Prepend the stdin prelude when input is supplied, and return a mapping from
 * offsets in the compiled source back to the caller's source for diagnostics.
 */
export function prepareSource(code, input = '') {
  const usesStdin = /\b(readln|readlnOrNull|readLine)\s*\(/.test(code);
  if (!input && !usesStdin) {
    return { source: code, injected: false, mapOffset: (offset) => offset };
  }

  const prelude = buildPrelude(code);
  const insertAt = findInsertOffset(code);
  const source = code.slice(0, insertAt) + prelude + code.slice(insertAt);
  const end = insertAt + prelude.length;

  return {
    source,
    injected: true,
    mapOffset(offset) {
      if (offset <= insertAt) return offset;
      if (offset >= end) return offset - prelude.length;
      return insertAt;
    }
  };
}
