// Shared host-import bridge for minikotlin-compiled WASM modules.
//
// SINGLE SOURCE OF TRUTH for the `env.__*` functions every minikotlin app
// module imports. Used by BOTH:
//   - the browser playground   (web/playground.js)
//   - the Node e2e test runner (scripts/run_node.js, via `../web/host-imports.mjs`)
// so the two hosts can never drift out of sync again.
//
// The compiler UNCONDITIONALLY wires all of these imports (even for modules
// that don't use strings/Long/Double), so the host must supply every one.
//
import {
  jsParseInt,
  jsParseFloat,
  jsTypeofValue,
  jsEval,
  jsUndefined,
  jsJsonStringify,
  jsJsonParse,
  jsJsonObjectNew,
  jsJsonSet,
  jsBoxInt,
  jsUnboxInt,
  jsUnboxDouble,
  jsUnboxLong,
  jsUnboxBool,
  jsArrayNew,
  jsRegexpNew,
  jsRegexpTest,
  jsRegexpExec,
  jsRegexpToString,
  jsRegexpGetLastIndex,
  jsRegexpSetLastIndex,
  jsRegexpFlag,
  jsRegexpMatchIndex,
  jsRegexpMatchInput,
  jsRegexpMatchLength,
  jsRegexpMatchGet,
  jsRegexpMatches,
  jsRegexpMatchEntire,
  jsRegexpReplace,
  jsRegexpSplit,
  jsRegexpFindAll,
  jsPromiseResolve,
  jsPromiseThen,
  jsPromiseCatch,
  jsPromiseFinally,
  jsDateNew0,
  jsDateNewMs,
  jsDateNewStr,
  jsDateNewParts,
  jsDateNow,
  jsDateParse,
  jsDateUtc,
  jsDateGetInt,
  jsDateGetTime,
  jsDateToString,
  jsDateToJson,
  jsDateLocaleString,
  jsArrayPush,
  jsArrayLength,
  jsBoxDouble,
  jsBoxBool,
  jsConsole,
  jsConsoleCall,
  jsConsoleCallArray,
  jsDynGet,
  jsDynSet,
  jsLongToBigInt,
  jsWindow,
  jsDocument,
  jsLocalStorage,
  jsSessionStorage,
  jsDomCreateElement,
  jsDomAppendChild,
  jsDomAppendElement,
  jsDomNodeClear,
  jsDomAppendText,
  jsDomHasClass,
  jsDomAddClass,
  jsDomAddClassArray,
  jsDomRemoveClass,
  jsDomRemoveClassArray,
  jsDomNodeIsText,
  jsDomNodeIsElement,
  jsIoFileNew,
  jsIoFileNewChild,
  jsIoFilePath,
  jsIoFileExists,
  jsIoFileIsDirectory,
  jsIoFileReadText,
  jsIoFileWriteText,
  jsIoFileAppendText,
  jsIoFileDelete,
  jsIoFileMkdirs,
  jsIoFileResolve,
  jsIoFileNormalize,
  jsIoFileStartsWith,
  jsIoFileEndsWith,
  jsIoFileToRelativeString,
  jsIoFileCopyTo,
  jsIoFileExtension,
  jsIoFileNameWithoutExtension,
  jsIoFileIsRooted,
  jsIoFileInvariantPath,
  jsIoFileResolveSibling,
  jsIoCreateTempDir,
  jsIoCreateTempFile,
  jsIoFileListChildren,
  jsIoTextLinesArray,
  jsIoFileInputStream,
  jsIoFileOutputStream,
  jsIoStreamReadText,
  jsIoStreamReadBytes,
  jsIoStreamWriteText,
  jsIoStreamClose,
  jsIoStreamBuffered,
  jsIoStringByteInputStream,
  jsIoStringReader,
  jsIoFileReadBytes,
  jsIoFileWriteBytes,
  jsIoFileAppendBytes,
  jsIoBytesToIntArray,
  jsIoIntArrayToBytes,
  jsIoFileCopyRecursively,
  jsIoFileDeleteRecursively,
  jsIoStreamCopyTo,
  jsIoStreamAsWriter,
  jsTimeDurationToString,
  jsTimeDurationAbs,
  jsStrSplit,
  jsStrSplitMulti,
  jsStrTrimIndent,
  JS_EPSILON,
  JS_TAYLOR_2,
  JS_TAYLOR_N,
  JS_UPPER_TAYLOR_2,
  JS_UPPER_TAYLOR_N,
} from "./js-runtime.mjs";

// makeHostEnv({ getMemory, write }) -> the `env` object for WebAssembly imports.
//   getMemory() -> the instance's WebAssembly.Memory (bound lazily, after
//                  instantiate, since __make_string reads linear memory).
//   write(str)  -> output sink for println/print (host decides where it goes:
//                  an array, console, a DOM node, ...).

export function makeHostEnv({
  getMemory,
  write,
  getResume,
  getJsPcb,
  getJsPcbu,
  getFetchStore,
  onTimerScheduled,
  onTimerFired,
}) {
  const decoder = new TextDecoder("utf-8");
  /* --gc-strings: per-flatten code-unit accumulator for __gc_sb_push/take. */
  const gcSbBuf = [];
  const parseIntStrict = (s) => {
    const text = String(s);
    if (!/^[+-]?\d+$/.test(text)) return null;
    const normalized = text[0] === "+" ? text.slice(1) : text;
    const value = BigInt(normalized);
    if (value < -2147483648n || value > 2147483647n) return null;
    return Number(value) | 0;
  };
  const parseLongStrict = (s) => {
    const text = String(s);
    if (!/^[+-]?\d+$/.test(text)) return null;
    const normalized = text[0] === "+" ? text.slice(1) : text;
    const value = BigInt(normalized);
    if (value < -9223372036854775808n || value > 9223372036854775807n)
      return null;
    return value;
  };
  const parseDoubleStrict = (s) => {
    const text = String(s);
    const trimmed = text.trim();
    const pat =
      /^[+-]?(?:NaN|Infinity|(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)$/;
    if (!pat.test(trimmed)) return null;
    if (/^[+-]?NaN$/.test(trimmed)) return Number.NaN;
    if (/^[+]?Infinity$/.test(trimmed)) return Infinity;
    if (/^-Infinity$/.test(trimmed)) return -Infinity;
    return Number(trimmed);
  };
  const maybeFoldCase = (s, ignoreCase) => {
    const text = String(s);
    return ignoreCase ? text.toLowerCase() : text;
  };
  const parseBooleanStrict = (s) => {
    const text = String(s);
    if (text === "true") return 1;
    if (text === "false") return 0;
    return null;
  };
  /* Default Any.hashCode() — stable per-object identity while the ref lives. */
  const refHashIds = new WeakMap();
  let refHashNext = 1;
  return {
    // String materialization: a (ptr,len) slice of linear memory -> JS string
    // (strings then flow as host JS strings / externref).
    __make_string: (ptr, len) =>
      decoder.decode(new Uint8Array(getMemory().buffer, ptr, len)),

    // Coroutines — schedule a continuation resume after `ms` (genuine, non-
    // blocking suspension). The wasm registered its continuation closure in a
    // module-global table and handed us the i32 `token`; after the timer the
    // host event loop calls back into `__co_resume(token)`. `getResume` is
    // bound lazily after instantiate (like `getMemory`); absent in hosts that
    // don't run coroutines, so guard it.
    //
    // `onTimerScheduled`/`onTimerFired` are an OPTIONAL pending-continuation
    // counter so an async host (the browser playground) can await a quiescent
    // event loop before rendering. A resumed continuation may schedule MORE
    // timers, so onTimerFired runs in `finally` AFTER the resume — the count
    // stays > 0 across a chain and only hits 0 when nothing is left. The Node
    // runner ignores these (it uses `beforeExit`).
    __co_set_timeout: (token, ms) => {
      if (onTimerScheduled) onTimerScheduled();
      setTimeout(() => {
        try {
          const r = getResume && getResume();
          if (r) r(token);
        } catch (e) {
          /* swallow — host event loop */
        } finally {
          if (onTimerFired) onTimerFired();
        }
      }, ms | 0);
    },

    // fetch — async network request. On response, calls the exported
    // __co_recv_fetch(text) to store the result, then __co_resume(token).
    __co_set_fetch: (token, url) => {
      if (onTimerScheduled) onTimerScheduled();
      const urlStr = typeof url === "string" ? url : String(url);
      const doResume = (text) => {
        try {
          const recv = getFetchStore && getFetchStore();
          if (recv) recv(String(text));
          const r = getResume && getResume();
          if (r) r(token);
        } catch (e) {
          /* swallow — host event loop */
        } finally {
          if (onTimerFired) onTimerFired();
        }
      };
      if (typeof fetch !== "undefined") {
        fetch(urlStr)
          .then((resp) => resp.text())
          .then(doResume)
          .catch(() => doResume(""));
      } else {
        /* fetch unavailable (e.g. old Node without globalThis.fetch): resume
         * with empty string so the continuation doesn't hang. */
        setTimeout(() => doResume(""), 0);
      }
    },

    // Standard output.
    __println: (s) => write(String(s) + "\n"),
    __print: (s) => write(String(s)),

    /* --gc-strings boundary primitive (A): WASM→JS string flatten. __gc_flatten
     * (a defined WASM fn) pushes each UTF-16 code unit of a $WasmCharArray here,
     * then takes the accumulated JS string. No linear memory involved — the
     * gc-strings module has none. fromCharCode is chunked so long strings don't
     * overflow the call stack via spread. */
    __gc_sb_push: (code) => {
      gcSbBuf.push(code & 0xffff);
    },
    __gc_sb_take: () => {
      let out = "";
      for (let i = 0; i < gcSbBuf.length; i += 8192)
        out += String.fromCharCode.apply(null, gcSbBuf.slice(i, i + 8192));
      gcSbBuf.length = 0;
      return out;
    },

    /* --gc-strings boundary primitive (B): JS→WASM materialize. __gc_materialize
     * (a defined WASM fn) reads a JS string's UTF-16 code units into a gc char
     * array via these two host ops. */
    __gc_str_len: (s) => String(s).length | 0,
    __gc_str_at: (s, i) => String(s).charCodeAt(i | 0) | 0,

    // Test builtins
    __assert_equals: (a, b) => {
      if (a !== b) {
        throw new Error("Assertion failed");
      }
    },
    __assert_true: (cond) => {
      if (!cond) {
        throw new Error("Assertion failed: expected true");
      }
    },
    __assert_false: (cond) => {
      if (cond) {
        throw new Error("Assertion failed: expected false");
      }
    },
    __assert_fails_with: () => {
      // Stub: in tests this executes a block that's expected to fail.
      // Since it's hard to catch traps crossing the Wasm boundary in this simple stub,
      // we'll just let it pass for now to get past compiler errors.
    },

    // String-template helpers: concat + Int->String for `"$x"`.
    __concat: (a, b) => String(a) + String(b),
    __int_to_string: (i) => String(i | 0),
    __uint_to_string: (i) => String((i | 0) >>> 0),
    __ulong_to_string: (i) => BigInt.asUintN(64, BigInt(i)).toString(),
    __int_to_string_radix: (i, radix) => (i | 0).toString(radix | 0),

    // Long (i64 -> JS BigInt) -> String.
    __long_to_string: (i) => String(i),
    __long_to_string_radix: (i, radix) => BigInt(i).toString(radix | 0),

    // Boolean (i32 0/1) -> "true"/"false". Kotlin Boolean prints the words,
    // not the bit; the compiler routes a Boolean TO_STRING operand here
    // (Int and Boolean are both i32 at MIR, so the choice is made at HIR
    // time where the Boolean type is still visible).
    __bool_to_string: (i) => (i | 0 ? "true" : "false"),

    // Double (f64) -> String, matching Kotlin's Double.toString():
    //   - NaN / Infinity / -Infinity spell out (JS String() already does)
    //   - whole values keep a ".0"  (JS String(9.0) === "9")
    //   - -0.0 stays "-0.0"
    //   - very large / very small magnitudes use Kotlin's "E" exponent form
    //     (uppercase E, signed integer exponent, mantissa always has a dot).
    // Float toString: shortest decimal that round-trips through f32 —
    // Kotlin prints 4.4f as "4.4", not the widened double 4.400000095367432.
    __float_to_string: (d) => {
      const f = Math.fround(d);
      if (Number.isNaN(f)) return "NaN";
      if (f === Infinity) return "Infinity";
      if (f === -Infinity) return "-Infinity";
      if (f === 0) return Object.is(f, -0) ? "-0.0" : "0.0";
      let body = String(f);
      for (let p = 1; p <= 8; p++) {
        const cand = f.toPrecision(p);
        if (Math.fround(parseFloat(cand)) === f) {
          body = String(parseFloat(cand));
          break;
        }
      }
      if (!body.includes(".") && !body.includes("e") && !body.includes("E"))
        body += ".0";
      return body;
    },
    __double_to_string: (d) => {
      if (Number.isNaN(d)) return "NaN";
      if (d === Infinity) return "Infinity";
      if (d === -Infinity) return "-Infinity";
      if (d === 0) return Object.is(d, -0) ? "-0.0" : "0.0";

      const neg = d < 0;
      const a = Math.abs(d);

      let body;
      // Kotlin uses plain decimal for 1e-3 <= |d| < 1e7, else exponent form.
      if (a >= 1e-3 && a < 1e7) {
        body = String(a);
        if (
          body.indexOf(".") === -1 &&
          body.indexOf("e") === -1 &&
          body.indexOf("E") === -1
        ) {
          body += ".0";
        }
      } else {
        // toExponential gives e.g. "4.5e+9" / "1e+21" / "1e-7".
        const exp = a.toExponential();
        let [mant, e] = exp.split("e");
        if (mant.indexOf(".") === -1) mant += ".0";
        body = mant + "E" + String(parseInt(e, 10));
      }
      return neg ? "-" + body : body;
    },

    // kotlin.math transcendentals (__math_sin/exp/pow/asinh/…) are NO LONGER
    // provided here as JS `Math.*`. They are computed in WebAssembly by the
    // kotlin.math runtime (modules/kotlin.math/runtime/math_rt.c → musl libm →
    // kotlin_math_rt.wasm); each loader instantiates that runtime via
    // ./math-runtime.mjs (makeMathImports) and Object.assign's the resulting
    // __math_* forwarders onto this env before instantiating the program.

    // String API — strings are host JS strings, so each maps to a JS String
    // method. __str_char_at models Kotlin Char as a 1-char String;
    // __str_substring takes an explicit [start, end).
    __str_length: (s) => String(s).length,
    __str_upper: (s) => String(s).toUpperCase(),
    __str_lower: (s) => String(s).toLowerCase(),
    __str_substring: (s, a, b) => String(s).substring(a | 0, b | 0),
    __str_char_at: (s, i) => String(s).charAt(i | 0),
    __str_repeat: (s, n) => String(s).repeat(Math.max(0, n | 0)),
    __str_trim_margin: (s, marginPrefix) => {
      const prefix = String(marginPrefix);
      const lines = String(s).replace(/\r\n?/g, "\n").split("\n");
      while (lines.length && lines[0].trim() === "") lines.shift();
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      return lines
        .map((line) => {
          const match = line.match(/^[ \t]*/);
          const indent = match ? match[0].length : 0;
          return prefix.length && line.startsWith(prefix, indent)
            ? line.slice(indent + prefix.length)
            : line;
        })
        .join("\n");
    },
    __str_prepend_indent: (s, indent) => {
      const pad = String(indent);
      return String(s)
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => pad + line)
        .join("\n");
    },
    __str_replace_indent: (s, indent) => {
      const lines = String(s).replace(/\r\n?/g, "\n").split("\n");
      while (lines.length && lines[0].trim() === "") lines.shift();
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      const nonBlank = lines.filter((line) => line.trim() !== "");
      let minIndent = 0;
      if (nonBlank.length) {
        minIndent = Math.min(
          ...nonBlank.map((line) => {
            const match = line.match(/^[ \t]*/);
            return match ? match[0].length : 0;
          }),
        );
      }
      const pad = String(indent);
      return lines
        .map((line) => (line.trim() === "" ? "" : pad + line.slice(minIndent)))
        .join("\n");
    },

    // String structural equality (data-class equals() / Map String keys).
    // Returns 1/0 (the compiler treats it as an Int boolean).
    __str_eq: (a, b) => (String(a) === String(b) ? 1 : 0),

    // Java/Kotlin String.hashCode: 31-based content hash over UTF-16 code units.
    // Used by data-class field hashing and explicit `"x".hashCode()`.
    __str_hash: (s) => {
      const str = String(s);
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      }
      return h | 0;
    },

    // ── P1 — String/Char concrete stdlib ────────────────────────────────
    // Strings (and Chars, which flow as 1-char Strings) are host JS strings.
    // Predicates return 1/0 (the compiler treats them as Int booleans);
    // transforms return new JS strings; search returns a 0-based index or -1.
    __str_is_empty: (s) => (String(s).length === 0 ? 1 : 0),
    __str_is_not_empty: (s) => (String(s).length !== 0 ? 1 : 0),
    __str_is_blank: (s) => (String(s).trim().length === 0 ? 1 : 0),
    __str_is_not_blank: (s) => (String(s).trim().length !== 0 ? 1 : 0),
    __str_starts_with: (s, p, ignoreCase) => {
      const text = maybeFoldCase(s, ignoreCase | 0);
      const prefix = maybeFoldCase(p, ignoreCase | 0);
      return text.startsWith(prefix) ? 1 : 0;
    },
    __str_ends_with: (s, p, ignoreCase) => {
      const text = maybeFoldCase(s, ignoreCase | 0);
      const suffix = maybeFoldCase(p, ignoreCase | 0);
      return text.endsWith(suffix) ? 1 : 0;
    },
    __str_contains: (s, p, ignoreCase) => {
      const text = maybeFoldCase(s, ignoreCase | 0);
      const part = maybeFoldCase(p, ignoreCase | 0);
      return text.includes(part) ? 1 : 0;
    },
    __str_index_of: (s, p, startIndex) =>
      String(s).indexOf(String(p), startIndex | 0),
    __str_last_index_of: (s, p, startIndex) => {
      const text = String(s);
      const from = (startIndex | 0) < 0 ? text.length : startIndex | 0;
      return text.lastIndexOf(String(p), from);
    },
    __uuid_parse_hex: (s) =>
      String(s)
        .toLowerCase()
        .replace(
          /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/,
          "$1-$2-$3-$4-$5"
        ),
    __str_take: (s, n) => {
      const t = String(s),
        k = n | 0;
      if (k < 0)
        throw new Error("Requested character count is less than zero.");
      return t.slice(0, k);
    },
    __str_drop: (s, n) => {
      const t = String(s),
        k = n | 0;
      if (k < 0)
        throw new Error("Requested character count is less than zero.");
      return t.slice(k);
    },
    __str_take_last: (s, n) => {
      const t = String(s),
        k = n | 0;
      if (k < 0)
        throw new Error("Requested character count is less than zero.");
      return k >= t.length ? t : t.slice(t.length - k);
    },
    __str_drop_last: (s, n) => {
      const t = String(s),
        k = n | 0;
      if (k < 0)
        throw new Error("Requested character count is less than zero.");
      return k >= t.length ? "" : t.slice(0, t.length - k);
    },
    // Lexicographic sign for < <= > >= (Char compares by code point). UTF-16
    // code-unit order, matching Kotlin's String.compareTo / Char ordering.
    __str_cmp: (a, b) => {
      a = String(a);
      b = String(b);
      return a < b ? -1 : a > b ? 1 : 0;
    },
    __str_trim: (s) => String(s).trim(),
    __str_trim_start: (s) => String(s).trimStart(),
    __str_trim_end: (s) => String(s).trimEnd(),
    __str_trim_indent: (s) => jsStrTrimIndent(s),
    __str_split: (s, d, limit) => jsStrSplit(s, d, limit),
    __str_split_multi: (s, ds, limit) => jsStrSplitMulti(s, ds, limit),
    __str_region_matches: (s, thisOffset, other, otherOffset, length, ignoreCase) => {
      const a = String(s);
      const b = String(other);
      const startA = thisOffset | 0;
      const startB = otherOffset | 0;
      const len = length | 0;
      if (startA < 0 || startB < 0 || len < 0) return 0;
      if (startA + len > a.length || startB + len > b.length) return 0;
      const subA = maybeFoldCase(a.slice(startA, startA + len), ignoreCase | 0);
      const subB = maybeFoldCase(b.slice(startB, startB + len), ignoreCase | 0);
      return subA === subB ? 1 : 0;
    },
    __str_replace_range: (s, start, end, replacement) => {
      const t = String(s);
      const a = Math.max(0, start | 0);
      const b = Math.max(a, Math.min(t.length, end | 0));
      return t.slice(0, a) + String(replacement) + t.slice(b);
    },
    __str_common_prefix: (s, other, ignoreCase) => {
      const a = String(s);
      const b = String(other);
      const af = maybeFoldCase(a, ignoreCase | 0);
      const bf = maybeFoldCase(b, ignoreCase | 0);
      let i = 0;
      while (i < a.length && i < b.length && af.charAt(i) === bf.charAt(i)) i++;
      return a.slice(0, i);
    },
    __str_common_suffix: (s, other, ignoreCase) => {
      const a = String(s);
      const b = String(other);
      const af = maybeFoldCase(a, ignoreCase | 0);
      const bf = maybeFoldCase(b, ignoreCase | 0);
      let i = 0;
      while (i < a.length && i < b.length &&
             af.charAt(a.length - 1 - i) === bf.charAt(b.length - 1 - i)) i++;
      return i === 0 ? "" : a.slice(a.length - i);
    },
    // Reverse by UTF-16 code UNIT (split('')), matching Kotlin's char-wise
    // reversal — a surrogate pair's halves swap (mojibake), as in Kotlin.
    __str_reversed: (s) => String(s).split("").reverse().join(""),
    // Kotlin's replace(old, new) is a LITERAL (non-regex) replace-all.
    __str_replace: (s, o, n) => String(s).split(String(o)).join(String(n)),
    __str_replace_first: (s, o, n) => {
      const t = String(s),
        old = String(o),
        neu = String(n),
        i = t.indexOf(old);
      return i < 0 ? t : t.slice(0, i) + neu + t.slice(i + old.length);
    },
    __str_substring_before: (s, d) => {
      const t = String(s),
        i = t.indexOf(String(d));
      return i < 0 ? t : t.slice(0, i);
    },
    __str_substring_after: (s, d) => {
      const t = String(s),
        dd = String(d),
        i = t.indexOf(dd);
      return i < 0 ? t : t.slice(i + dd.length);
    },
    __str_substring_before_last: (s, d) => {
      const t = String(s),
        i = t.lastIndexOf(String(d));
      return i < 0 ? t : t.slice(0, i);
    },
    __str_substring_after_last: (s, d) => {
      const t = String(s),
        dd = String(d),
        i = t.lastIndexOf(dd);
      return i < 0 ? t : t.slice(i + dd.length);
    },
    __str_remove_prefix: (s, p) => {
      const t = String(s),
        pp = String(p);
      return t.startsWith(pp) ? t.slice(pp.length) : t;
    },
    __str_remove_suffix: (s, p) => {
      const t = String(s),
        pp = String(p);
      return pp.length && t.endsWith(pp) ? t.slice(0, t.length - pp.length) : t;
    },
    __str_remove_surrounding: (s, p, suffix) => {
      const t = String(s),
        pp = String(p),
        ss = String(suffix);
      return t.length >= pp.length + ss.length &&
        t.startsWith(pp) &&
        t.endsWith(ss)
        ? t.slice(pp.length, t.length - ss.length)
        : t;
    },
    __str_pad_start: (s, len, pad) =>
      String(s).padStart(len | 0, String(pad) || " "),
    __str_pad_end: (s, len, pad) =>
      String(s).padEnd(len | 0, String(pad) || " "),
    __str_first: (s) => String(s).charAt(0),
    __str_last: (s) => {
      const t = String(s);
      return t.charAt(t.length - 1);
    },
    __str_to_int_ok: (s) => (parseIntStrict(s) === null ? 0 : 1),
    __str_to_int: (s) => {
      const value = parseIntStrict(s);
      if (value === null) throw new Error("NumberFormatException");
      return value;
    },
    __str_to_long_ok: (s) => (parseLongStrict(s) === null ? 0 : 1),
    __str_to_long: (s) => {
      const value = parseLongStrict(s);
      if (value === null) throw new Error("NumberFormatException");
      return value;
    },
    __str_to_double_ok: (s) => (parseDoubleStrict(s) === null ? 0 : 1),
    __str_to_double: (s) => {
      const value = parseDoubleStrict(s);
      if (value === null) throw new Error("NumberFormatException");
      return value;
    },
    __str_to_boolean: (s) => (String(s).toLowerCase() === "true" ? 1 : 0),
    __str_to_boolean_strict_ok: (s) => (parseBooleanStrict(s) === null ? 0 : 1),
    __str_to_boolean_strict: (s) => {
      const value = parseBooleanStrict(s);
      if (value === null) throw new Error("IllegalArgumentException");
      return value;
    },

    // Char ops — receiver is a 1-char String. Predicates use Unicode property
    // escapes to track Kotlin's Char.isX() semantics closely.
    __char_code: (s) => s ? String(s).charCodeAt(0) : 0,
    __char_is_digit: (s) => (/^\p{Nd}$/u.test(String(s)) ? 1 : 0),
    __char_is_letter: (s) => (/^\p{L}$/u.test(String(s)) ? 1 : 0),
    __char_is_letter_or_digit: (s) =>
      /^[\p{L}\p{Nd}]$/u.test(String(s)) ? 1 : 0,
    __char_is_whitespace: (s) => (/^\s$/u.test(String(s)) ? 1 : 0),
    __char_is_upper_case: (s) => (/^\p{Lu}$/u.test(String(s)) ? 1 : 0),
    __char_is_lower_case: (s) => (/^\p{Ll}$/u.test(String(s)) ? 1 : 0),
    // Char.uppercaseChar()/lowercaseChar()/titlecaseChar() return exactly ONE
    // Char: if the full case mapping is multi-char (ß→SS, İ→i+combining-dot),
    // Kotlin keeps the ORIGINAL char. Fall back to the original when not a
    // single code unit. titlecase() supports one-to-many titlecase strings.
    __char_uppercase: (s) => {
      const r = String(s).toUpperCase();
      return r.length === 1 ? r : String(s);
    },
    __char_lowercase: (s) => {
      const r = String(s).toLowerCase();
      return r.length === 1 ? r : String(s);
    },
    __char_titlecase_char: (s) => {
      const t = String(s);
      const code = t.charCodeAt(0) | 0;
      if (
        (code >= 0x01c4 && code <= 0x01cc) ||
        (code >= 0x01f1 && code <= 0x01f3)
      ) {
        return String.fromCharCode(3 * Math.floor((code + 1) / 3));
      }
      if (
        (code >= 0x10d0 && code <= 0x10fa) ||
        (code >= 0x10fd && code <= 0x10ff)
      ) {
        return t;
      }
      const r = t.toUpperCase();
      return r.length === 1 ? r : t;
    },
    __char_titlecase: (s) => {
      const t = String(s);
      const upper = t.toUpperCase(); console.error("TITLECASE CALLED WITH:", t, "UPPER:", upper);
      if (upper.length > 1) {
        return t.charCodeAt(0) === 0x0149
          ? upper
          : upper.charAt(0) + upper.substring(1).toLowerCase();
      }
      const code = t.charCodeAt(0) | 0;
      if (
        (code >= 0x01c4 && code <= 0x01cc) ||
        (code >= 0x01f1 && code <= 0x01f3)
      ) {
        return String.fromCharCode(3 * Math.floor((code + 1) / 3));
      }
      if (
        (code >= 0x10d0 && code <= 0x10fa) ||
        (code >= 0x10fd && code <= 0x10ff)
      ) {
        return t;
      }
      return upper;
    },
    // digitToInt: decimal digits '0'-'9' -> 0..9; non-digit -> -1 (v1; real
    // Kotlin throws IllegalArgumentException — no exceptions yet).
    __char_category: (s) => {
      const c = String(s);
      if (/^\p{Nd}$/u.test(c)) return 1;
      if (/^\p{L}$/u.test(c)) return 2;
      if (/^\s$/u.test(c)) return 3;
      return 0;
    },
    __char_category_contains: (cat, ch) => {
      const c = String(ch);
      let id = 0;
      if (/^\p{Nd}$/u.test(c)) id = 1;
      else if (/^\p{L}$/u.test(c)) id = 2;
      else if (/^\s$/u.test(c)) id = 3;
      return id === (cat | 0) ? 1 : 0;
    },
    __char_digit_to_int: (s) => {
      const c = String(s).charCodeAt(0);
      return c >= 48 && c <= 57 ? c - 48 : -1;
    },
    __char_digit_to_int_radix: (s, radix) => {
      const r = radix | 0;
      if (r < 2 || r > 36) return -1;
      const code = String(s).charCodeAt(0);
      let v = -1;
      if (code >= 48 && code <= 57) v = code - 48;
      else if (code >= 65 && code <= 90) v = code - 55;
      else if (code >= 97 && code <= 122) v = code - 87;
      return v >= 0 && v < r ? v : -1;
    },
    // Int.toChar(): low 16 bits -> a UTF-16 code unit (Kotlin Char).
    __int_to_char: (code) => String.fromCharCode((code | 0) & 0xffff),
    // Default Any.hashCode() on class refs — JVM-style identity (not value) hash.
    __ref_hash: (ref) => {
      if (ref == null) return 0;
      let id = refHashIds.get(ref);
      if (id === undefined) {
        id = refHashNext++;
        refHashIds.set(ref, id);
      }
      return id;
    },

    // StringBuilder — represented as a tiny host object carried as externref.
    __sb_new: (initial) => {
      const text = String(initial ?? "");
      return {
        __mkStringBuilder: true,
        parts: [text],
        capacity: text.length,
        toString() {
          return this.parts.join("");
        },
      };
    },
    __sb_new_capacity: (capacity) => ({
      __mkStringBuilder: true,
      parts: [""],
      capacity: Math.max(0, capacity | 0),
      toString() {
        return this.parts.join("");
      },
    }),
    __sb_append: (builder, value) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      builder.parts.push(String(value));
      builder.capacity = Math.max(builder.capacity ?? 0, String(builder).length);
      return builder;
    },
    __sb_clear: (builder) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        return {
          __mkStringBuilder: true,
          parts: [],
          capacity: 0,
          toString() {
            return this.parts.join("");
          },
        };
      }
      builder.parts.length = 0;
      return builder;
    },
    __sb_delete: (builder, start, end) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      const text = String(builder);
      start = start | 0;
      end = end | 0;
      if (start < 0 || start > end || end > text.length) {
        throw new RangeError("StringBuilder.delete index out of bounds");
      }
      builder.parts = [text.slice(0, start), text.slice(end)];
      return builder;
    },
    __sb_insert: (builder, index, value) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      const text = String(builder);
      index = index | 0;
      if (index < 0 || index > text.length) {
        throw new RangeError("StringBuilder.insert index out of bounds");
      }
      builder.parts = [text.slice(0, index), String(value), text.slice(index)];
      builder.capacity = Math.max(builder.capacity ?? 0, String(builder).length);
      return builder;
    },
    __sb_set_length: (builder, newLength) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      const text = String(builder);
      newLength = newLength | 0;
      if (newLength < 0) {
        throw new RangeError("StringBuilder.setLength length out of bounds");
      }
      builder.parts =
        newLength <= text.length
          ? [text.slice(0, newLength)]
          : [text, "\u0000".repeat(newLength - text.length)];
      builder.capacity = Math.max(builder.capacity ?? 0, newLength);
    },
    __sb_get: (builder, index) => {
      const text = String(builder);
      index = index | 0;
      if (index < 0 || index >= text.length) {
        throw new RangeError("StringBuilder.get index out of bounds");
      }
      return text[index];
    },
    __sb_set: (builder, index, value) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      const text = String(builder);
      index = index | 0;
      if (index < 0 || index >= text.length) {
        throw new RangeError("StringBuilder.set index out of bounds");
      }
      const ch = String(value ?? "");
      builder.parts = [text.slice(0, index), ch.slice(0, 1), text.slice(index + 1)];
    },
    __sb_delete_at: (builder, index) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      const text = String(builder);
      index = index | 0;
      if (index < 0 || index >= text.length) {
        throw new RangeError("StringBuilder.deleteAt index out of bounds");
      }
      builder.parts = [text.slice(0, index), text.slice(index + 1)];
      return builder;
    },
    __sb_reverse: (builder) => {
      if (!builder || builder.__mkStringBuilder !== true) {
        const text = String(builder ?? "");
        builder = {
          __mkStringBuilder: true,
          parts: [text],
          capacity: text.length,
          toString() {
            return this.parts.join("");
          },
        };
      }
      builder.parts = [String(builder).split("").reverse().join("")];
      return builder;
    },
    __sb_to_string: (builder) => String(builder),
    __sb_length: (builder) => String(builder).length,
    __sb_capacity: (builder) => Math.max(String(builder).length, builder?.capacity ?? 0),

    /* kotlin.js — host JS interop (see web/js-runtime.mjs). */
    __js_parse_int: (s, radix) => jsParseInt(s, radix),
    __js_parse_float: (s) => jsParseFloat(s),
    __js_typeof_val: (v) => jsTypeofValue(v),
    __js_typeof_int: (i) => jsTypeofValue(i | 0),
    __js_eval: (expr) => jsEval(expr),
    __js_undefined: () => jsUndefined(),
    __js_json_stringify: (v) => jsJsonStringify(v),
    __js_json_parse: (text) => jsJsonParse(text),
    __js_json_object_new: () => jsJsonObjectNew(),
    __js_json_set: (obj, key, val) => {
      jsJsonSet(obj, key, val);
    },
    __js_dyn_get: (obj, key) => jsDynGet(obj, key),
    __js_dyn_set: (obj, key, val) => {
      jsDynSet(obj, key, val);
    },
    __js_long_to_bigint: (v) => jsLongToBigInt(v),
    __js_box_int: (i) => jsBoxInt(i),
    __js_unbox_int: (v) => jsUnboxInt(v),
    __js_unbox_double: (v) => jsUnboxDouble(v),
    __js_unbox_long: (v) => jsUnboxLong(v),
    __js_unbox_bool: (v) => jsUnboxBool(v),
    __js_array_new: () => jsArrayNew(),
    __js_array_push: (arr, v) => {
      jsArrayPush(arr, v);
    },
    __js_array_length: (arr) => jsArrayLength(arr),
    __js_box_double: (x) => jsBoxDouble(x),
    __js_box_bool: (b) => jsBoxBool(b),
    __js_console: () => jsConsole(),
    __js_console_call: (op, argc, a0, a1, a2, a3) => {
      const n = Math.max(0, argc | 0);
      const args = [a0, a1, a2, a3].slice(0, n);
      if ((op | 0) === 4) {
        jsConsoleCall(op, argc, a0, a1, a2, a3);
        return;
      }
      write(args.map((a) => String(a)).join(" ") + "\n");
    },
    __js_console_call_array: (op, argv) => {
      const args = Array.isArray(argv) ? argv : Array.from(argv ?? []);
      if ((op | 0) === 4) {
        jsConsoleCallArray(op, args);
        return;
      }
      write(args.map((a) => String(a)).join(" ") + "\n");
    },
    __js_regexp_new: (pat, flags) => jsRegexpNew(pat, flags),
    __js_regexp_test: (re, s) => jsRegexpTest(re, s),
    __js_regexp_exec: (re, s) => jsRegexpExec(re, s),
    __js_regexp_to_string: (re) => jsRegexpToString(re),
    __js_regexp_get_last_index: (re) => jsRegexpGetLastIndex(re),
    __js_regexp_set_last_index: (re, idx) => jsRegexpSetLastIndex(re, idx),
    __js_regexp_flag: (re, which) => jsRegexpFlag(re, which),
    __js_regexp_match_index: (m) => jsRegexpMatchIndex(m),
    __js_regexp_match_input: (m) => jsRegexpMatchInput(m),
    __js_regexp_match_length: (m) => jsRegexpMatchLength(m),
    __js_regexp_match_get: (m, idx) => jsRegexpMatchGet(m, idx),
    /* Kotlin Regex standard API */
    __js_regexp_matches: (re, s) => jsRegexpMatches(re, s),
    __js_regexp_match_entire: (re, s) => jsRegexpMatchEntire(re, s),
    __js_regexp_replace: (s, re, repl) => jsRegexpReplace(s, re, repl),
    __js_regexp_split: (s, re) => jsRegexpSplit(s, re),
    __js_regexp_find_all: (re, s) => jsRegexpFindAll(re, s),
    __js_promise_resolve: (v) => jsPromiseResolve(v),
    __js_promise_then: (p, ft, rt) =>
      jsPromiseThen(p, ft | 0, rt | 0, () => {
        const exp = getJsPcb && getJsPcb();
        return exp ? (tok, v) => exp(tok | 0, v) : null;
      }),
    __js_promise_catch: (p, rt) =>
      jsPromiseCatch(p, rt | 0, () => {
        const exp = getJsPcb && getJsPcb();
        return exp ? (tok, v) => exp(tok | 0, v) : null;
      }),
    __js_promise_finally: (p, t) =>
      jsPromiseFinally(p, t | 0, () => {
        const exp = getJsPcbu && getJsPcbu();
        return exp ? (tok) => exp(tok | 0) : null;
      }),
    __js_date_new0: () => jsDateNew0(),
    __js_date_new_ms: (ms) => jsDateNewMs(ms),
    __js_date_new_str: (s) => jsDateNewStr(s),
    __js_date_new_parts: (argc, y, m, day, hour, min, sec, ms) =>
      jsDateNewParts(argc, y, m, day, hour, min, sec, ms),
    __js_date_now: () => jsDateNow(),
    __js_date_parse: (s) => jsDateParse(s),
    __js_date_utc: (argc, y, m, day, hour, min, sec, ms) =>
      jsDateUtc(argc, y, m, day, hour, min, sec, ms),
    __js_date_get_int: (d, op) => jsDateGetInt(d, op),
    __js_date_get_time: (d) => jsDateGetTime(d),
    __js_date_to_string: (d, op) => jsDateToString(d, op),
    __js_date_to_json: (d) => jsDateToJson(d),
    __js_date_locale_string: (d, op, locales, options) =>
      jsDateLocaleString(d, op, locales, options),
    __js_epsilon: () => JS_EPSILON,
    __js_taylor_2_bound: () => JS_TAYLOR_2,
    __js_taylor_n_bound: () => JS_TAYLOR_N,
    __js_upper_taylor_2_bound: () => JS_UPPER_TAYLOR_2,
    __js_upper_taylor_n_bound: () => JS_UPPER_TAYLOR_N,
    __js_window: () => jsWindow(),
    __js_document: () => jsDocument(),
    __js_local_storage: () => jsLocalStorage(),
    __js_session_storage: () => jsSessionStorage(),
    __js_dom_create_element: (doc, name) => jsDomCreateElement(doc, name),
    __js_dom_append_child: (parent, child) => jsDomAppendChild(parent, child),
    __js_dom_append_element: (parent, name) => jsDomAppendElement(parent, name),
    __js_dom_node_clear: (node) => {
      jsDomNodeClear(node);
    },
    __js_dom_append_text: (el, text) => jsDomAppendText(el, text),
    __js_dom_has_class: (el, css) => jsDomHasClass(el, css),
    __js_dom_add_class: (el, argc, a0, a1, a2, a3) =>
      jsDomAddClass(el, argc, a0, a1, a2, a3),
    __js_dom_remove_class: (el, argc, a0, a1, a2, a3) =>
      jsDomRemoveClass(el, argc, a0, a1, a2, a3),
    __js_dom_add_class_array: (el, argv) => jsDomAddClassArray(el, argv),
    __js_dom_remove_class_array: (el, argv) => jsDomRemoveClassArray(el, argv),
    __js_dom_node_is_text: (node) => jsDomNodeIsText(node),
    __js_dom_node_is_element: (node) => jsDomNodeIsElement(node),

    /* kotlin.io — virtual filesystem (web/js-runtime.mjs). */
    __io_file_new: (path) => jsIoFileNew(path),
    __io_file_new_child: (parent, child) => jsIoFileNewChild(parent, child),
    __io_file_path: (file) => jsIoFilePath(file),
    __io_file_exists: (file) => jsIoFileExists(file),
    __io_file_is_directory: (file) => jsIoFileIsDirectory(file),
    __io_file_read_text: (file) => jsIoFileReadText(file),
    __io_file_write_text: (file, text) => {
      jsIoFileWriteText(file, text);
    },
    __io_file_append_text: (file, text) => {
      jsIoFileAppendText(file, text);
    },
    __io_file_delete: (file) => jsIoFileDelete(file),
    __io_file_mkdirs: (file) => {
      jsIoFileMkdirs(file);
    },
    __io_file_resolve: (base, other) => jsIoFileResolve(base, other),
    __io_file_normalize: (file) => jsIoFileNormalize(file),
    __io_file_starts_with: (file, other) => jsIoFileStartsWith(file, other),
    __io_file_ends_with: (file, other) => jsIoFileEndsWith(file, other),
    __io_file_to_relative_string: (file, base) =>
      jsIoFileToRelativeString(file, base),
    __io_file_copy_to: (src, dst, overwrite) =>
      jsIoFileCopyTo(src, dst, overwrite),
    __io_file_extension: (file) => jsIoFileExtension(file),
    __io_file_name_wo_ext: (file) => jsIoFileNameWithoutExtension(file),
    __io_file_is_rooted: (file) => jsIoFileIsRooted(file),
    __io_file_invariant_path: (file) => jsIoFileInvariantPath(file),
    __io_file_resolve_sibling: (file, rel) => jsIoFileResolveSibling(file, rel),
    __io_create_temp_dir: (prefix, suffix, dir) =>
      jsIoCreateTempDir(prefix, suffix, dir),
    __io_create_temp_file: (prefix, suffix, dir) =>
      jsIoCreateTempFile(prefix, suffix, dir),
    __io_file_list_children: (file) => jsIoFileListChildren(file),
    __io_text_lines_array: (text) => jsIoTextLinesArray(text),
    __io_file_input_stream: (file) => jsIoFileInputStream(file),
    __io_file_output_stream: (file, append) =>
      jsIoFileOutputStream(file, append),
    __io_stream_read_text: (stream) => jsIoStreamReadText(stream),
    __io_stream_read_bytes: (stream) => jsIoStreamReadBytes(stream),
    __io_stream_write_text: (stream, text) => {
      jsIoStreamWriteText(stream, text);
    },
    __io_stream_close: (stream) => {
      jsIoStreamClose(stream);
    },
    __io_stream_buffered: (stream, bufSize) =>
      jsIoStreamBuffered(stream, bufSize),
    __io_string_byte_input_stream: (text) => jsIoStringByteInputStream(text),
    __io_string_reader: (text) => jsIoStringReader(text),
    __io_file_read_bytes: (file) => jsIoFileReadBytes(file),
    __io_file_write_bytes: (file, bytes) => {
      jsIoFileWriteBytes(file, bytes);
    },
    __io_file_append_bytes: (file, bytes) => {
      jsIoFileAppendBytes(file, bytes);
    },
    __io_bytes_to_int_array: (bytes) => jsIoBytesToIntArray(bytes),
    __io_int_array_to_bytes: (arr) => jsIoIntArrayToBytes(arr),
    __io_file_copy_recursively: (src, dst, ow) =>
      jsIoFileCopyRecursively(src, dst, ow),
    __io_file_delete_recursively: (file) => jsIoFileDeleteRecursively(file),
    __io_stream_copy_to: (ins, outs) => jsIoStreamCopyTo(ins, outs),
    __io_stream_as_writer: (stream, kind) => jsIoStreamAsWriter(stream, kind),
    __time_duration_to_string: (nanos) => jsTimeDurationToString(nanos),
    __time_duration_abs: (nanos) => jsTimeDurationAbs(nanos),
  };
}
