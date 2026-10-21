// kotlin.js host runtime — native JS (MiniJS semantics as reference where needed).

export function jsParseInt(s, radix) {
  const text = String(s).trim();
  const r =
    radix === undefined || radix === null || (radix | 0) === 0
      ? undefined
      : radix | 0;
  if (r !== undefined && (r < 2 || r > 36)) return 0;
  const n = r === undefined ? parseInt(text, 10) : parseInt(text, r);
  if (!Number.isFinite(n)) return 0;
  return n | 0;
}

export function jsParseFloat(s) {
  const text = String(s).trim();
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : 0;
}

export function jsTypeofValue(v) {
  if (v === null) return "object";
  return typeof v;
}

export function jsEval(expr) {
  // eslint-disable-next-line no-eval
  return eval(String(expr));
}

export function jsUndefined() {
  return undefined;
}

export function jsJsonStringify(v) {
  return JSON.stringify(v, (_, x) =>
    typeof x === "bigint" ? x.toString() : x,
  );
}

export function jsJsonParse(text) {
  return JSON.parse(String(text));
}

export function jsJsonObjectNew() {
  return {};
}

export function jsJsonSet(obj, key, value) {
  if (obj && typeof obj === "object") obj[String(key)] = value;
}

export function jsDynGet(obj, key) {
  if (obj == null) return undefined;
  return obj[String(key)];
}

export function jsDynSet(obj, key, value) {
  if (obj && typeof obj === "object") obj[String(key)] = value;
}

export function jsLongToBigInt(v) {
  return BigInt(v);
}

export function jsBoxInt(i) {
  return i | 0;
}

export function jsUnboxInt(v) {
  if (typeof v === "number") return v | 0;
  if (typeof v === "bigint") return Number(v) | 0;
  return 0;
}

export function jsUnboxDouble(v) {
  return Number(v);
}

export function jsUnboxLong(v) {
  if (typeof v === "bigint") return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0n;
  return BigInt(Math.trunc(n));
}

export function jsUnboxBool(v) {
  return !!v ? 1 : 0;
}

export function jsArrayNew() {
  return [];
}

export function jsArrayPush(arr, value) {
  if (arr && typeof arr.push === "function") arr.push(value);
}

export function jsArrayLength(arr) {
  return arr && typeof arr.length === "number" ? arr.length | 0 : 0;
}

export function jsBoxDouble(x) {
  return Number(x);
}

export function jsBoxBool(b) {
  return !!(b & 1);
}

export function jsConsole() {
  return console;
}

export function jsConsoleCall(op, argc, a0, a1, a2, a3) {
  const n = Math.max(0, argc | 0);
  jsConsoleCallArray(op, [a0, a1, a2, a3].slice(0, n));
}

export function jsConsoleCallArray(op, argv) {
  const names = ["log", "error", "warn", "info", "dir"];
  const m = names[op | 0] || "log";
  const args = Array.isArray(argv) ? argv : Array.from(argv ?? []);
  if (typeof console[m] === "function") console[m](...args);
}

export function jsRegexpNew(pattern, flags) {
  return new RegExp(String(pattern), flags == null ? "" : String(flags));
}

export function jsRegexpTest(re, str) {
  return re && typeof re.test === "function" && re.test(String(str)) ? 1 : 0;
}

export function jsRegexpExec(re, str) {
  if (!re || typeof re.exec !== "function") return null;
  return re.exec(String(str));
}

export function jsRegexpToString(re) {
  return re == null ? "" : String(re);
}

export function jsRegexpGetLastIndex(re) {
  return re && typeof re.lastIndex === "number" ? re.lastIndex | 0 : 0;
}

export function jsRegexpSetLastIndex(re, idx) {
  if (re && typeof re === "object") re.lastIndex = idx | 0;
}

export function jsRegexpFlag(re, which) {
  if (!re || typeof re !== "object") return 0;
  switch (which | 0) {
    case 0:
      return re.global ? 1 : 0;
    case 1:
      return re.ignoreCase ? 1 : 0;
    case 2:
      return re.multiline ? 1 : 0;
    default:
      return 0;
  }
}

export function jsRegexpMatchIndex(m) {
  return m && typeof m.index === "number" ? m.index | 0 : 0;
}

export function jsRegexpMatchInput(m) {
  return m && m.input != null ? String(m.input) : "";
}

export function jsRegexpMatchLength(m) {
  return m && typeof m.length === "number" ? m.length | 0 : 0;
}

export function jsRegexpMatchGet(m, idx) {
  if (!m) return null;
  const v = m[idx | 0];
  return v == null ? null : String(v);
}

/* Kotlin Regex wrapper — standard API over the existing RegExp infrastructure */

export function jsRegexpMatches(re, str) {
  if (!re || typeof re.exec !== "function") return 0;
  const s = String(str);
  const m = re.exec(s);
  return m !== null && m.index === 0 && m[0].length === s.length ? 1 : 0;
}

export function jsRegexpMatchEntire(re, str) {
  if (!re || typeof re.exec !== "function") return null;
  const s = String(str);
  const m = re.exec(s);
  return m !== null && m.index === 0 && m[0].length === s.length ? m : null;
}

export function jsRegexpReplace(str, re, repl) {
  // Kotlin's Regex.replace replaces ALL occurrences — ensure the global flag.
  const s = String(str);
  const r = re.global ? re : new RegExp(re.source, re.flags + "g");
  return s.replace(r, String(repl));
}

export function jsRegexpSplit(str, re) {
  return String(str).split(re);
}

export function jsRegexpFindAll(re, str) {
  if (!re || typeof re.exec !== "function") return [];
  const s = String(str);
  const results = [];
  /* Use a global copy so we can iterate without mutating the caller's regex. */
  const r = re.global ? re : new RegExp(re.source, re.flags + "g");
  r.lastIndex = 0;
  let m;
  while ((m = r.exec(s)) !== null) {
    results.push(m[0] != null ? String(m[0]) : "");
    if (m[0].length === 0) r.lastIndex++;
  }
  return results;
}

export function jsPromiseResolve(v) {
  return Promise.resolve(v);
}

export function jsPromiseThen(p, fulfillTok, rejectTok, getPcb) {
  const pcb = getPcb();
  const onFulfill =
    fulfillTok < 0
      ? undefined
      : (v) => {
          if (!pcb) return undefined;
          return pcb(fulfillTok, v);
        };
  const onReject =
    rejectTok < 0
      ? undefined
      : (e) => {
          if (!pcb) return undefined;
          return pcb(rejectTok, e);
        };
  return p.then(onFulfill, onReject);
}

export function jsPromiseCatch(p, rejectTok, getPcb) {
  const pcb = getPcb();
  return p.catch((e) => (pcb ? pcb(rejectTok, e) : undefined));
}

export function jsPromiseFinally(p, token, getPcbu) {
  const pcbu = getPcbu();
  return p.finally(() => {
    if (pcbu) pcbu(token);
  });
}

export function jsDateNew0() {
  return new Date();
}

export function jsDateNewMs(ms) {
  return new Date(Number(ms));
}

export function jsDateNewStr(s) {
  return new Date(String(s));
}

export function jsDateNewParts(argc, y, m, day, hour, min, sec, ms) {
  const a = [y | 0, m | 0];
  if ((argc | 0) >= 3) a.push(day | 0);
  if ((argc | 0) >= 4) a.push(hour | 0);
  if ((argc | 0) >= 5) a.push(min | 0);
  if ((argc | 0) >= 6) a.push(sec | 0);
  if ((argc | 0) >= 7) a.push(Number(ms));
  return new Date(...a);
}

export function jsDateNow() {
  return Date.now();
}

export function jsDateParse(s) {
  return Date.parse(String(s));
}

export function jsDateUtc(argc, y, m, day, hour, min, sec, ms) {
  const a = [y | 0, m | 0];
  if ((argc | 0) >= 3) a.push(day | 0);
  if ((argc | 0) >= 4) a.push(hour | 0);
  if ((argc | 0) >= 5) a.push(min | 0);
  if ((argc | 0) >= 6) a.push(sec | 0);
  if ((argc | 0) >= 7) a.push(Number(ms));
  return Date.UTC(...a);
}

export function jsDateGetInt(d, op) {
  if (!d || typeof d.getTime !== "function") return 0;
  switch (op | 0) {
    case 0:
      return d.getDate() | 0;
    case 1:
      return d.getDay() | 0;
    case 2:
      return d.getFullYear() | 0;
    case 3:
      return d.getHours() | 0;
    case 4:
      return d.getMilliseconds() | 0;
    case 5:
      return d.getMinutes() | 0;
    case 6:
      return d.getMonth() | 0;
    case 7:
      return d.getSeconds() | 0;
    case 8:
      return d.getTimezoneOffset() | 0;
    case 9:
      return d.getUTCDate() | 0;
    case 10:
      return d.getUTCDay() | 0;
    case 11:
      return d.getUTCFullYear() | 0;
    case 12:
      return d.getUTCHours() | 0;
    case 13:
      return d.getUTCMilliseconds() | 0;
    case 14:
      return d.getUTCMinutes() | 0;
    case 15:
      return d.getUTCMonth() | 0;
    case 16:
      return d.getUTCSeconds() | 0;
    default:
      return 0;
  }
}

export function jsDateGetTime(d) {
  return d && typeof d.getTime === "function" ? d.getTime() : 0;
}

export function jsDateToString(d, op) {
  if (!d) return "";
  switch (op | 0) {
    case 0:
      return String(d.toDateString());
    case 1:
      return String(d.toISOString());
    case 2:
      return String(d.toTimeString());
    case 3:
      return String(d.toUTCString());
    default:
      return "";
  }
}

export function jsDateToJson(d) {
  return d && typeof d.toJSON === "function" ? d.toJSON() : "";
}

export function jsDateLocaleString(d, op, locales, options) {
  if (!d) return "";
  const names = ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"];
  const fn = names[op | 0];
  if (!fn || typeof d[fn] !== "function") return "";
  if (locales == null && options == null) return String(d[fn]());
  if (options == null) return String(d[fn](locales));
  return String(d[fn](locales, options));
}

export const JS_EPSILON = 2.220446049250313e-16;
export const JS_TAYLOR_2 = Math.sqrt(JS_EPSILON);
export const JS_TAYLOR_N = Math.sqrt(JS_TAYLOR_2);
export const JS_UPPER_TAYLOR_2 = 1 / JS_TAYLOR_2;
export const JS_UPPER_TAYLOR_N = 1 / JS_TAYLOR_N;

// ── kotlin.browser + kotlin.dom (minimal DOM for Node e2e; real DOM in browser) ──

const DOM_ELEMENT_NODE = 1;
const DOM_TEXT_NODE = 3;
const DOM_DOCUMENT_NODE = 9;

let _minimalDom = null;

function makeStorage() {
  const data = new Map();
  return {
    getItem(k) {
      return data.has(k) ? data.get(k) : null;
    },
    setItem(k, v) {
      data.set(String(k), String(v));
    },
    removeItem(k) {
      data.delete(k);
    },
    clear() {
      data.clear();
    },
    get length() {
      return data.size;
    },
    key(i) {
      return [...data.keys()][i] ?? null;
    },
  };
}

function makeMinimalDom() {
  if (_minimalDom) return _minimalDom;

  function removeChild(parent, child) {
    const i = parent.childNodes.indexOf(child);
    if (i >= 0) {
      parent.childNodes.splice(i, 1);
      child.parentNode = null;
    }
    return child;
  }

  const document = {
    nodeType: DOM_DOCUMENT_NODE,
    childNodes: [],
    parentNode: null,
    ownerDocument: null,
    get firstChild() {
      return this.childNodes[0] ?? null;
    },
    hasChildNodes() {
      return this.childNodes.length > 0;
    },
    appendChild(child) {
      this.childNodes.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild(child) {
      return removeChild(this, child);
    },
    createElement(name) {
      const el = {
        nodeType: DOM_ELEMENT_NODE,
        tagName: String(name).toUpperCase(),
        className: "",
        childNodes: [],
        parentNode: null,
        ownerDocument: document,
        get firstChild() {
          return this.childNodes[0] ?? null;
        },
        hasChildNodes() {
          return this.childNodes.length > 0;
        },
        appendChild(child) {
          if (child.parentNode) removeChild(child.parentNode, child);
          this.childNodes.push(child);
          child.parentNode = this;
          return child;
        },
        removeChild(child) {
          return removeChild(this, child);
        },
      };
      return el;
    },
    createTextNode(text) {
      return {
        nodeType: DOM_TEXT_NODE,
        textContent: String(text),
        childNodes: [],
        parentNode: null,
        ownerDocument: document,
        get firstChild() {
          return null;
        },
        hasChildNodes() {
          return false;
        },
        appendChild() {
          throw new Error("Text node cannot have children");
        },
        removeChild() {
          throw new Error("Text node cannot have children");
        },
      };
    },
  };
  document.ownerDocument = document;

  const window = {
    document,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
  };

  _minimalDom = { window, document };
  return _minimalDom;
}

export function jsWindow() {
  if (typeof globalThis.window !== "undefined" && globalThis.window.document)
    return globalThis.window;
  return makeMinimalDom().window;
}

export function jsDocument() {
  if (typeof globalThis.document !== "undefined") return globalThis.document;
  return makeMinimalDom().document;
}

export function jsLocalStorage() {
  const w = jsWindow();
  return w.localStorage ?? makeMinimalDom().window.localStorage;
}

export function jsSessionStorage() {
  const w = jsWindow();
  return w.sessionStorage ?? makeMinimalDom().window.sessionStorage;
}

export function jsDomCreateElement(doc, name) {
  if (!doc || typeof doc.createElement !== "function") return null;
  return doc.createElement(String(name));
}

export function jsDomAppendChild(parent, child) {
  if (!parent || !child || typeof parent.appendChild !== "function")
    return child;
  return parent.appendChild(child);
}

export function jsDomAppendElement(parent, name) {
  if (!parent || !parent.ownerDocument) return null;
  const child = parent.ownerDocument.createElement(String(name));
  if (typeof parent.appendChild === "function") parent.appendChild(child);
  return child;
}

export function jsDomNodeClear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function jsDomAppendText(el, text) {
  if (!el || !el.ownerDocument) return el;
  const tn = el.ownerDocument.createTextNode(String(text));
  el.appendChild(tn);
  return el;
}

export function jsDomHasClass(el, cssClass) {
  if (!el) return 0;
  const cn = String(el.className ?? "");
  const esc = String(cssClass).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|.*\\s+)${esc}($|\\s+.*)`);
  return re.test(cn) ? 1 : 0;
}

export function jsDomAddClassArray(el, argv) {
  if (!el) return 0;
  const classes = (Array.isArray(argv) ? argv : Array.from(argv ?? [])).map(String);
  let added = false;
  for (const c of classes) {
    if (!jsDomHasClass(el, c)) {
      const present = String(el.className ?? "").trim();
      el.className = present ? `${present} ${c}` : c;
      added = true;
    }
  }
  return added ? 1 : 0;
}

export function jsDomAddClass(el, argc, a0, a1, a2, a3) {
  const n = Math.max(0, argc | 0);
  return jsDomAddClassArray(el, [a0, a1, a2, a3].slice(0, n));
}

export function jsDomRemoveClassArray(el, argv) {
  if (!el) return 0;
  const toRemove = new Set(
    (Array.isArray(argv) ? argv : Array.from(argv ?? [])).map(String),
  );
  if (![...toRemove].some((c) => jsDomHasClass(el, c))) return 0;
  const parts = String(el.className ?? "")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !toRemove.has(p));
  el.className = parts.join(" ");
  return 1;
}

export function jsDomRemoveClass(el, argc, a0, a1, a2, a3) {
  const n = Math.max(0, argc | 0);
  return jsDomRemoveClassArray(el, [a0, a1, a2, a3].slice(0, n));
}

export function jsDomNodeIsText(node) {
  if (!node) return 0;
  const t = node.nodeType | 0;
  return t === 3 || t === 4 ? 1 : 0;
}

export function jsDomNodeIsElement(node) {
  return node && (node.nodeType | 0) === 1 ? 1 : 0;
}

// kotlin.io — in-memory virtual filesystem (Node e2e + browser playground).
const vfsFiles = new Map();
const vfsDirs = new Set(["/"]);
let vfsTempCounter = 0;

function ioNormPath(path) {
  const raw = String(path ?? "").replace(/\\/g, "/");
  const abs = raw.startsWith("/");
  const parts = raw.split("/").filter((p) => p && p !== ".");
  const out = [];
  for (const p of parts) {
    if (p === "..") {
      out.pop();
      continue;
    }
    out.push(p);
  }
  const joined = out.join("/");
  return abs || raw.startsWith("/") ? `/${joined}` : joined || ".";
}

function ioJoin(base, rel) {
  const b = String(base ?? "");
  const r = String(rel ?? "");
  if (!b) return ioNormPath(r);
  if (r.startsWith("/")) return ioNormPath(r);
  const prefix = b.endsWith("/") ? b.slice(0, -1) : b;
  return ioNormPath(`${prefix}/${r}`);
}

function ioMkFile(path) {
  return { __mkFile: true, path: ioNormPath(path) };
}

function ioIsFile(v) {
  return v && v.__mkFile === true;
}

function ioEnsureParentDirs(path) {
  const norm = ioNormPath(path);
  const parts = norm.split("/").filter(Boolean);
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur += `/${parts[i]}`;
    vfsDirs.add(cur);
  }
}

function ioBasename(path) {
  const norm = ioNormPath(path);
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function ioParent(path) {
  const norm = ioNormPath(path);
  const idx = norm.lastIndexOf("/");
  if (idx <= 0) return "/";
  return norm.slice(0, idx) || "/";
}

function ioIsRootedPath(path) {
  return String(path ?? "")
    .replace(/\\/g, "/")
    .startsWith("/");
}

function ioSplitLines(text) {
  const s = String(text ?? "");
  if (!s.length) return [];
  const lines = s.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Kotlin String.split — literal delimiter, optional limit (0 = no limit). */
export function jsStrSplit(s, delim, limit) {
  const text = String(s ?? "");
  const d = String(delim ?? "");
  const lim = limit | 0;
  if (d === "") {
    const out = [];
    for (const ch of text) out.push(ch);
    if (lim > 0 && out.length >= lim) {
      const head = out.slice(0, lim - 1);
      head.push(out.slice(lim - 1).join(""));
      return head;
    }
    return out;
  }
  const parts = [];
  let rest = text;
  while (true) {
    const i = rest.indexOf(d);
    if (i < 0) {
      parts.push(rest);
      break;
    }
    parts.push(rest.slice(0, i));
    rest = rest.slice(i + d.length);
    if (lim > 0 && parts.length === lim - 1) {
      parts.push(rest);
      break;
    }
  }
  return parts;
}

/** Kotlin String.split(vararg delimiters) — all delimiters are literal strings. */
export function jsStrSplitMulti(s, delimiters, limit) {
  const text = String(s ?? "");
  const ds = (Array.isArray(delimiters) ? delimiters : Array.from(delimiters ?? []))
    .map((d) => String(d ?? ""));
  const lim = limit | 0;
  if (ds.length === 0) return [text];
  if (ds.some((d) => d === "")) return jsStrSplit(text, "", lim);

  const parts = [];
  let pos = 0;
  while (pos <= text.length) {
    let bestIndex = -1;
    let bestDelim = "";
    for (const d of ds) {
      const idx = text.indexOf(d, pos);
      if (idx >= 0 && (bestIndex < 0 || idx < bestIndex)) {
        bestIndex = idx;
        bestDelim = d;
      }
    }
    if (bestIndex < 0) {
      parts.push(text.slice(pos));
      break;
    }
    parts.push(text.slice(pos, bestIndex));
    pos = bestIndex + bestDelim.length;
    if (lim > 0 && parts.length === lim - 1) {
      parts.push(text.slice(pos));
      break;
    }
  }
  return parts;
}

/** Kotlin String.trimIndent — drop a blank first/last line, then remove the
 * common leading whitespace of non-blank lines (blank lines become ""). */
export function jsStrTrimIndent(s) {
  const text = String(s ?? "");
  const lines = text.split(/\r\n|\r|\n/);
  let minIndent = Infinity;
  for (const line of lines) {
    if (!line.trim().length) continue;
    const m = line.match(/^[\t ]*/);
    const indent = m ? m[0].length : 0;
    if (indent < minIndent) minIndent = indent;
  }
  if (!Number.isFinite(minIndent)) minIndent = 0;
  const last = lines.length - 1;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((i === 0 || i === last) && !line.trim().length) continue;
    out.push(line.slice(minIndent));
  }
  return out.join("\n");
}

function ioMkStream(kind, file, data, append) {
  return {
    __mkIoStream: true,
    kind: String(kind),
    file: ioIsFile(file) ? file : ioMkFile(file),
    data: String(data ?? ""),
    pos: 0,
    append: append ? 1 : 0,
    closed: 0,
  };
}

function ioIsStream(v) {
  return v && v.__mkIoStream === true;
}

export function jsIoFileNew(path) {
  return ioMkFile(path);
}

export function jsIoFileNewChild(parent, child) {
  if (ioIsFile(parent)) return ioMkFile(ioJoin(parent.path, child));
  return ioMkFile(ioJoin(parent, child));
}

export function jsIoFilePath(file) {
  return ioIsFile(file) ? file.path : ioNormPath(file);
}

export function jsIoFileExists(file) {
  const p = jsIoFilePath(file);
  return vfsFiles.has(p) || vfsDirs.has(p) ? 1 : 0;
}

export function jsIoFileIsDirectory(file) {
  const p = jsIoFilePath(file);
  if (vfsDirs.has(p)) return 1;
  if (vfsFiles.has(p)) return 0;
  return p.endsWith("/") ? 1 : 0;
}

export function jsIoFileReadText(file) {
  const p = jsIoFilePath(file);
  return vfsFiles.get(p) ?? "";
}

export function jsIoFileWriteText(file, text) {
  const p = jsIoFilePath(file);
  ioEnsureParentDirs(p);
  vfsFiles.set(p, String(text ?? ""));
}

export function jsIoFileAppendText(file, text) {
  const p = jsIoFilePath(file);
  ioEnsureParentDirs(p);
  const prev = vfsFiles.get(p) ?? "";
  vfsFiles.set(p, prev + String(text ?? ""));
}

export function jsIoFileDelete(file) {
  const p = jsIoFilePath(file);
  let ok = vfsFiles.delete(p) || vfsDirs.delete(p);
  for (const key of [...vfsFiles.keys()]) {
    if (key === p || key.startsWith(`${p}/`)) {
      vfsFiles.delete(key);
      ok = true;
    }
  }
  for (const key of [...vfsDirs.keys()]) {
    if (key === p || key.startsWith(`${p}/`)) {
      vfsDirs.delete(key);
      ok = true;
    }
  }
  return ok ? 1 : 0;
}

export function jsIoFileMkdirs(file) {
  const p = jsIoFilePath(file);
  vfsDirs.add(p);
  ioEnsureParentDirs(`${p}/.keep`);
  return 1;
}

export function jsIoFileResolve(base, other) {
  const bp = jsIoFilePath(base);
  if (ioIsFile(other)) return ioMkFile(ioJoin(bp, other.path));
  return ioMkFile(ioJoin(bp, other));
}

export function jsIoFileNormalize(file) {
  return ioMkFile(jsIoFilePath(file));
}

export function jsIoFileStartsWith(file, other) {
  const a = jsIoFilePath(file);
  const b = jsIoFilePath(other);
  return a === b || a.startsWith(`${b}/`) ? 1 : 0;
}

export function jsIoFileEndsWith(file, other) {
  const a = jsIoFilePath(file);
  const b = jsIoFilePath(other);
  if (!b) return 0;
  return a === b || a.endsWith(`/${b}`) || a.endsWith(b) ? 1 : 0;
}

export function jsIoFileToRelativeString(file, base) {
  const a = jsIoFilePath(file);
  const b = jsIoFilePath(base);
  if (a === b) return "";
  const bp = b.endsWith("/") ? b : `${b}/`;
  if (a.startsWith(bp)) return a.slice(bp.length);
  return a;
}

export function jsIoFileCopyTo(src, dst, overwrite) {
  const sp = jsIoFilePath(src);
  const dp = jsIoFilePath(dst);
  if (vfsFiles.has(sp)) {
    if (vfsFiles.has(dp) && !(overwrite & 1)) return dst;
    ioEnsureParentDirs(dp);
    vfsFiles.set(dp, vfsFiles.get(sp));
    return ioMkFile(dp);
  }
  return ioMkFile(dp);
}

export function jsIoFileExtension(file) {
  const name = ioBasename(jsIoFilePath(file));
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "";
}

export function jsIoFileNameWithoutExtension(file) {
  const name = ioBasename(jsIoFilePath(file));
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function jsIoFileIsRooted(file) {
  return ioIsRootedPath(jsIoFilePath(file)) ? 1 : 0;
}

export function jsIoFileInvariantPath(file) {
  return jsIoFilePath(file).replace(/\\/g, "/");
}

export function jsIoFileResolveSibling(file, relative) {
  const parent = ioParent(jsIoFilePath(file));
  return ioIsFile(relative)
    ? ioMkFile(ioJoin(parent, relative.path))
    : ioMkFile(ioJoin(parent, relative));
}

export function jsIoCreateTempDir(prefix, suffix, directory) {
  const base =
    directory && ioIsFile(directory) ? jsIoFilePath(directory) : "/tmp";
  const name = `${String(prefix ?? "tmp")}${vfsTempCounter++}${suffix == null ? "" : String(suffix)}`;
  const path = ioJoin(base, name);
  vfsDirs.add(ioNormPath(path));
  return ioMkFile(path);
}

export function jsIoCreateTempFile(prefix, suffix, directory) {
  const base =
    directory && ioIsFile(directory) ? jsIoFilePath(directory) : "/tmp";
  const sfx = suffix == null ? ".tmp" : String(suffix);
  const name = `${String(prefix ?? "tmp")}${vfsTempCounter++}${sfx}`;
  const path = ioJoin(base, name);
  ioEnsureParentDirs(path);
  vfsFiles.set(ioNormPath(path), "");
  return ioMkFile(path);
}

export function jsIoFileListChildren(file) {
  const p = jsIoFilePath(file);
  const prefix = p.endsWith("/") ? p : `${p}/`;
  const out = [];
  for (const d of vfsDirs) {
    if (d !== p && d.startsWith(prefix)) {
      const rest = d.slice(prefix.length);
      if (rest && !rest.includes("/")) out.push(ioMkFile(d));
    }
  }
  for (const f of vfsFiles.keys()) {
    if (f.startsWith(prefix)) {
      const rest = f.slice(prefix.length);
      if (rest && !rest.includes("/")) out.push(ioMkFile(f));
    }
  }
  return out;
}

export function jsIoTextLinesArray(text) {
  const arr = [];
  for (const line of ioSplitLines(text)) arr.push(line);
  return arr;
}

export function jsIoFileInputStream(file) {
  const data = jsIoFileReadText(file);
  return ioMkStream("input", file, data, 0);
}

export function jsIoFileOutputStream(file, append) {
  const data = append & 1 ? jsIoFileReadText(file) : "";
  return ioMkStream("output", file, data, append & 1);
}

export function jsIoStreamReadText(stream) {
  if (!ioIsStream(stream) || stream.closed) return "";
  if (stream.kind === "input") return stream.data.slice(stream.pos);
  return stream.data;
}

export function jsIoStreamReadBytes(stream) {
  const text = jsIoStreamReadText(stream);
  const arr = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) arr[i] = text.charCodeAt(i) & 0xff;
  return arr;
}

export function jsIoStreamWriteText(stream, text) {
  if (!ioIsStream(stream) || stream.closed) return;
  stream.data += String(text ?? "");
}

export function jsIoStreamClose(stream) {
  if (!ioIsStream(stream) || stream.closed) return;
  if (stream.kind === "output") {
    const p = jsIoFilePath(stream.file);
    ioEnsureParentDirs(p);
    vfsFiles.set(p, stream.data);
  }
  stream.closed = 1;
}

export function jsIoStreamBuffered(stream, bufSize) {
  if (!ioIsStream(stream)) return stream;
  return { ...stream, __mkBuffered: true, bufSize: bufSize | 0 || 8192 };
}

export function jsIoStringByteInputStream(text) {
  return ioMkStream("input", "/<string>", String(text ?? ""), 0);
}

export function jsIoStringReader(text) {
  return ioMkStream("reader", "/<string>", String(text ?? ""), 0);
}

function ioTextToUint8(text) {
  const s = String(text ?? "");
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i) & 0xff;
  return arr;
}

function ioUint8ToText(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
  let out = "";
  for (let i = 0; i < u8.length; i++) out += String.fromCharCode(u8[i]);
  return out;
}

export function jsIoFileReadBytes(file) {
  return ioTextToUint8(jsIoFileReadText(file));
}

export function jsIoFileWriteBytes(file, bytes) {
  jsIoFileWriteText(file, ioUint8ToText(bytes));
}

export function jsIoFileAppendBytes(file, bytes) {
  const prev = jsIoFileReadText(file);
  jsIoFileWriteText(file, prev + ioUint8ToText(bytes));
}

export function jsIoBytesToIntArray(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(0);
  const arr = [];
  for (let i = 0; i < u8.length; i++) arr.push(u8[i] | 0);
  return arr;
}

export function jsIoIntArrayToBytes(arr) {
  if (!arr || typeof arr.length !== "number") return new Uint8Array(0);
  const n = arr.length | 0;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (arr[i] | 0) & 0xff;
  return out;
}

export function jsIoFileCopyRecursively(src, dst, overwrite) {
  const sp = jsIoFilePath(src);
  if (vfsFiles.has(sp)) {
    jsIoFileCopyTo(src, dst, overwrite);
    return ioIsFile(dst) ? dst : ioMkFile(jsIoFilePath(dst));
  }
  jsIoFileMkdirs(dst);
  for (const child of jsIoFileListChildren(src)) {
    const name = ioBasename(jsIoFilePath(child));
    const target = jsIoFileResolve(dst, name);
    jsIoFileCopyRecursively(child, target, overwrite);
  }
  return ioIsFile(dst) ? dst : ioMkFile(jsIoFilePath(dst));
}

export function jsIoFileDeleteRecursively(file) {
  return jsIoFileDelete(file);
}

export function jsIoStreamCopyTo(inStream, outStream) {
  const text = jsIoStreamReadText(inStream);
  jsIoStreamWriteText(outStream, text);
  return text.length | 0;
}

export function jsIoStreamAsWriter(stream, kind) {
  if (!ioIsStream(stream)) return stream;
  return { ...stream, kind: String(kind || "writer") };
}

/** Format kotlin.time.Duration stored as signed nanoseconds (i64). */
export function jsTimeDurationAbs(nanos) {
  const n = typeof nanos === "bigint" ? Number(nanos) : Number(nanos);
  if (!Number.isFinite(n)) return 0;
  return (n < 0 ? -n : n) | 0;
}

export function jsTimeDurationToString(nanos) {
  const n = typeof nanos === "bigint" ? Number(nanos) : Number(nanos);
  if (!Number.isFinite(n) || n === 0) return "0s";
  const neg = n < 0;
  let v = Math.abs(Math.trunc(n));
  const units = [
    [86400000000000, "d"],
    [3600000000000, "h"],
    [60000000000, "m"],
    [1000000000, "s"],
    [1000000, "ms"],
    [1000, "us"],
    [1, "ns"],
  ];
  const topUnit = units.find(([scale]) => v >= scale);
  if (topUnit && v % topUnit[0] === 0) {
    return (neg ? "-" : "") + String(v / topUnit[0]) + topUnit[1];
  }
  if (topUnit && topUnit[0] >= 60000000000) {
    let rem = v;
    const parts = [];
    for (const [scale, unit] of units) {
      const q = Math.trunc(rem / scale);
      if (q > 0) {
        parts.push(String(q) + unit);
        rem -= q * scale;
      }
    }
    const text = parts.join(" ");
    return neg ? "-(" + text + ")" : text;
  }
  if (v >= 1000000000) {
    const s = v / 1000000000;
    const txt = Number.isInteger(s)
      ? String(s)
      : s.toFixed(9).replace(/\.?0+$/, "");
    return (neg ? "-" : "") + txt + "s";
  }
  if (v >= 1000000) return (neg ? "-" : "") + String(v / 1000000) + "ms";
  if (v >= 1000) return (neg ? "-" : "") + String(v / 1000) + "us";
  return (neg ? "-" : "") + String(v) + "ns";
}
