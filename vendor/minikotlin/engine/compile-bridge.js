// minikotlin in-browser compile bridge
//
// Loads web/wasm/minikotlin.js (the emcc-built compiler) and exposes
// a single `compile(source, filename)` entry that turns a Kotlin
// source string into Uint8Array WASM bytes plus any diagnostics.
//
// Boot is async — call `await ensureCompiler()` before compile().

let modulePromise = null;
let M = null;

let _compile, _result_free, _err_count, _err_msg, _err_line, _err_col, _version;
let _mkf_analyze, _mkf_result_free, _mkf_tokens, _mkf_token_count;
let _compile_uiir;

export async function ensureCompiler() {
  if (M) return M;
  if (!modulePromise) {
    /* The emcc loader sets `createMinikotlin` on globalThis when run as
     * a classic <script>. We use the dynamic import form so the same
     * module file works in either bundling mode. */
    modulePromise = (async () => {
      if (typeof globalThis.createMinikotlin !== 'function') {
        // Wait — script tag may still be executing.
        await new Promise(r => setTimeout(r, 0));
      }
      if (typeof globalThis.createMinikotlin !== 'function') {
        throw new Error('createMinikotlin not loaded — was minikotlin.js included?');
      }
      const assetVersion = globalThis.MINIKOTLIN_ASSET_VERSION || 'dev';
      const mod = await globalThis.createMinikotlin({
        locateFile(path, prefix) {
          if (path === 'minikotlin.wasm')
            return `${prefix}${path}?v=${encodeURIComponent(assetVersion)}`;
          return `${prefix}${path}`;
        },
      });
      _compile          = mod.cwrap('mkc_compile_buffer', 'number',
                                    ['string', 'string', 'number', 'number', 'number']);
      _result_free      = mod.cwrap('mkc_result_free', null, ['number']);
      _err_count        = mod.cwrap('mkc_error_count', 'number', ['number']);
      _err_msg          = mod.cwrap('mkc_error_message', 'string', ['number', 'number']);
      _err_line         = mod.cwrap('mkc_error_line', 'number', ['number', 'number']);
      _err_col          = mod.cwrap('mkc_error_col', 'number', ['number', 'number']);
      _version          = mod.cwrap('mkc_version', 'string', []);

      _mkf_analyze      = mod.cwrap('mkf_analyze', 'number', ['string', 'string']);
      _mkf_result_free  = mod.cwrap('mkf_result_free', null, ['number']);
      _mkf_tokens       = mod.cwrap('mkf_tokens', 'number', ['number']);
      _mkf_token_count  = mod.cwrap('mkf_token_count', 'number', ['number']);

      /* Compose → UIIR. Deliberately its OWN entry rather than
       * mkc_compile_buffer + an options struct: cwrap would make us
       * hand-compute MKCOptions field offsets, which break silently the next
       * time a field is added. Returns a malloc'd C string we must free. */
      _compile_uiir     = mod.cwrap('mkc_compile_uiir', 'number', ['string', 'string']);

      M = mod;
      return mod;
    })();
  }
  return modulePromise;
}

export function version() {
  if (!M) throw new Error('compiler not initialised — call ensureCompiler first');
  return _version();
}

/* Compiles a Kotlin source buffer.
 *
 * Returns { wasm: Uint8Array | null, errors: [{message, line, col}] }.
 * The wasm bytes are a fresh copy — safe to keep after the call. */
export function compile(source, filename = 'playground.kt') {
  if (!M) throw new Error('compiler not initialised — call ensureCompiler first');

  /* mkc_compile_buffer takes pointer-to-pointer for the output buffer
   * and pointer-to-size_t for its length. Allocate two 4-byte slots
   * on the C heap, hand them in, read back via getValue. */
  const wasm_pp = M._malloc(4);
  const wasm_lp = M._malloc(4);

  let result = 0, wasm = null;
  try {
    result = _compile(source, filename, 0, wasm_pp, wasm_lp);

    const errors = [];
    const ec = _err_count(result);
    for (let i = 0; i < ec; i++) {
      errors.push({
        message: _err_msg(result, i),
        line:    _err_line(result, i),
        col:     _err_col(result, i),
      });
    }

    if (errors.length === 0) {
      const wasm_p = M.getValue(wasm_pp, '*');
      const wasm_l = M.getValue(wasm_lp, 'i32');
      /* Copy out of the heap so the caller can keep the bytes
       * independent of subsequent _malloc / heap growth. */
      wasm = new Uint8Array(M.HEAPU8.buffer, wasm_p, wasm_l).slice();
    }

    return { wasm, errors };
  } finally {
    M._free(wasm_pp);
    M._free(wasm_lp);
    if (result) _result_free(result);
  }
}

/* TokenType values from mkf.h. Mirrored here so the lexer doesn't
 * need a string round-trip. Keep in sync with mkf/include/mkf.h. */
export const TOK = {
  UNKNOWN:      0,
  IDENTIFIER:   1,
  KEYWORD:      2,
  INTEGER_LIT:  3,
  FLOAT_LIT:    4,
  STRING_LIT:   5,
  CHAR_LIT:     6,
  OPERATOR:     7,
  PUNCT:        8,
  LABEL:        9,
  INTERP_PART:  10,
  INTERP_VAR:   11,
  INTERP_OPEN:  12,
  INTERP_CLOSE: 13,
  COMMENT:      17,
  WHITESPACE:   19,
  NEWLINE:      20,
  EOF:          255,
};

/* mkf's Token struct layout (28 bytes, all u32 fields):
 *   type, pos, len, line, col, keyword, op_kind */
const TOKEN_BYTES   = 28;
const TOKEN_U32S    = 7;
const FIELD_TYPE    = 0;
const FIELD_POS     = 1;
const FIELD_LEN     = 2;
const FIELD_LINE    = 3;
/* col, keyword, op_kind are at offsets 4, 5, 6 — skipped here, the
 * highlighter only needs type+pos+len+line. */

/* Lexes a Kotlin source through mkf and returns a flat Uint32Array
 * view of the token stream. The caller MUST hold a reference to
 * `result` (via the returned handle) for the lifetime of the view —
 * the underlying memory is freed by `freeLex(handle)` and reading
 * the view after that is undefined. */
export function lex(source, filename = 'playground.kt') {
  if (!M) throw new Error('compiler not initialised — call ensureCompiler first');

  const result = _mkf_analyze(source, filename);
  const count  = _mkf_token_count(result);
  const ptr    = _mkf_tokens(result);
  /* Build a typed view over [ptr, ptr + count*28). Slicing here would
   * copy ~3KB per refresh; the model-change handler is hot, so we
   * keep the view live and free it on next refresh. */
  const view = new Uint32Array(M.HEAPU32.buffer, ptr, count * TOKEN_U32S);
  return { handle: result, count, view };
}

export function freeLex(handle) {
  if (handle) _mkf_result_free(handle);
}

/* Decode helpers — index `i` into the token stream returned by lex(). */
export function tokType (view, i) { return view[i * TOKEN_U32S + FIELD_TYPE]; }
export function tokPos  (view, i) { return view[i * TOKEN_U32S + FIELD_POS];  }
export function tokLen  (view, i) { return view[i * TOKEN_U32S + FIELD_LEN];  }
export function tokLine (view, i) { return view[i * TOKEN_U32S + FIELD_LINE]; }

/* ── Compose → UIIR ──────────────────────────────────────────────────────────
 *
 * Lowers `@Composable` functions to a UIIR v1 document — the wire format the
 * kavak renderer reads. Compiles no wasm: `androidx.compose.*` never resolves
 * here by design, so the UI pass branches out of the pipeline before HIR and a
 * Compose file is not expected to reach codegen.
 *
 * Returns the parsed document, or null when the source did not analyze. A file
 * with no composable yields `{views: []}` — an answer, not a failure. */
export function uiirJson(source, filename = 'studio.kt') {
  if (!M) throw new Error('compiler not initialised — call ensureCompiler first');
  const ptr = _compile_uiir(source, filename);
  if (!ptr) return null;
  try {
    const text = M.UTF8ToString(ptr);
    return JSON.parse(text);
  } catch (e) {
    return null;
  } finally {
    /* The C side handed us ownership; the wasm heap does not garbage-collect. */
    M._free(ptr);
  }
}
