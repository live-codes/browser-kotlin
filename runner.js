// Runs minikotlin in a module worker: Kotlin source -> WasmGC -> execute.
//
// The compiler is a classic Emscripten build that assigns a global when loaded
// by a <script>. Workers have no <script>, so we fetch it, append an export, and
// import the result as a module. That keeps the vendored file untouched.

import { makeHostEnv } from './vendor/minikotlin/engine/host-imports.mjs';
import { makeMathImports } from './vendor/minikotlin/engine/math-runtime.mjs';
import { makeCharImports } from './vendor/minikotlin/engine/char-runtime.mjs';

const BASE = new URL('./vendor/minikotlin/', self.location.href);

const post = (message) => self.postMessage(message);
const fatal = (err) => post({ type: 'fatal', message: err?.message || String(err) });

let api = null;
let loading = null;
let ready = false;
let readyPosted = false;
let mathImports = null;
let charImports = null;

async function loadCompiler() {
  const source = await (await fetch(new URL('minikotlin.js', BASE))).text();
  const blob = new Blob([source, '\nexport default createMinikotlin;\n'], {
    type: 'text/javascript',
  });
  const url = URL.createObjectURL(blob);
  let createMinikotlin;
  try {
    ({ default: createMinikotlin } = await import(url));
  } finally {
    URL.revokeObjectURL(url);
  }

  const module = await createMinikotlin({
    locateFile: (path) => new URL(path, BASE).href,
  });

  const cw = (name, result, args) => module.cwrap(name, result, args);
  api = {
    module,
    version: cw('mkc_version', 'string', []),
    compileBuffer: cw('mkc_compile_buffer', 'number', ['string', 'string', 'number', 'number', 'number']),
    resultFree: cw('mkc_result_free', null, ['number']),
    errorCount: cw('mkc_error_count', 'number', ['number']),
    errorMessage: cw('mkc_error_message', 'string', ['number', 'number']),
    errorFile: cw('mkc_error_file', 'string', ['number', 'number']),
    errorLine: cw('mkc_error_line', 'number', ['number', 'number']),
    errorCol: cw('mkc_error_col', 'number', ['number', 'number']),
  };
  ready = true;
}

async function init() {
  if (ready) {
    if (!readyPosted) {
      readyPosted = true;
      post({ type: 'ready', version: api.version() });
    }
    return true;
  }
  if (!loading) loading = loadCompiler();
  try {
    await loading;
  } catch (err) {
    loading = null;
    fatal(new Error('could not load the Kotlin compiler: ' + (err?.message || err)));
    return false;
  }
  if (!readyPosted) {
    readyPosted = true;
    post({ type: 'ready', version: api.version() });
  }
  return true;
}

function compile(source, filename) {
  const { module: M } = api;
  const wasmPtrPtr = M._malloc(4);
  const wasmLenPtr = M._malloc(4);
  let result = 0;
  try {
    result = api.compileBuffer(source, filename, 0, wasmPtrPtr, wasmLenPtr);
    const errors = [];
    for (let i = 0, n = api.errorCount(result); i < n; i++) {
      errors.push({
        message: api.errorMessage(result, i),
        file: api.errorFile(result, i) || filename,
        line: api.errorLine(result, i),
        col: api.errorCol(result, i),
      });
    }
    let wasm = null;
    if (!errors.length) {
      const ptr = M.getValue(wasmPtrPtr, '*');
      const len = M.getValue(wasmLenPtr, 'i32');
      wasm = new Uint8Array(M.HEAPU8.buffer, ptr, len).slice();
    }
    return { wasm, errors };
  } finally {
    M._free(wasmPtrPtr);
    M._free(wasmLenPtr);
    if (result) api.resultFree(result);
  }
}

async function runtimeImports() {
  mathImports ??= fetch(new URL('engine/kotlin_math_rt.wasm', BASE))
    .then((response) => response.arrayBuffer())
    .then(makeMathImports);
  charImports ??= fetch(new URL('engine/kotlin_char_rt.wasm', BASE))
    .then((response) => response.arrayBuffer())
    .then(makeCharImports);
  return { math: await mathImports, chars: await charImports };
}

async function run(source, filename = 'Main.kt') {
  if (!(await init())) return;

  post({ type: 'status', stage: 'compiling' });
  const compileStart = performance.now();
  let built;
  try {
    built = compile(source, filename);
  } catch (err) {
    fatal(new Error('compiler failed: ' + (err?.message || err)));
    return;
  }
  const compileMs = performance.now() - compileStart;

  if (built.errors.length) {
    post({ type: 'result', ok: false, errors: built.errors, compileMs });
    return;
  }

  post({ type: 'compiled', bytes: built.wasm.byteLength, compileMs });
  post({ type: 'status', stage: 'running' });

  let instance = null;
  let memory = null;
  let pending = 0;
  let resolveIdle = null;
  const idle = () =>
    new Promise((resolve) => {
      if (pending === 0) resolve();
      else resolveIdle = resolve;
    });

  const env = makeHostEnv({
    getMemory: () => memory,
    write: (text) => post({ type: 'output', text }),
    getResume: () => instance && instance.exports.__co_resume,
    getJsPcb: () => {
      const exports = instance && instance.exports;
      if (!exports) return null;
      return (token, value) => {
        const fn = exports[`__js_pcb_${token | 0}`];
        return fn ? fn(value) : undefined;
      };
    },
    getJsPcbu: () => {
      const exports = instance && instance.exports;
      if (!exports) return null;
      return (token) => {
        const fn = exports[`__js_pcbu_${token | 0}`];
        if (fn) fn();
      };
    },
    onTimerScheduled: () => {
      pending++;
    },
    onTimerFired: () => {
      if (--pending === 0 && resolveIdle) {
        const resolve = resolveIdle;
        resolveIdle = null;
        resolve();
      }
    },
  });

  try {
    const imports = await runtimeImports();
    Object.assign(env, imports.math, imports.chars);
  } catch (err) {
    fatal(new Error('could not load runtime support: ' + (err?.message || err)));
    return;
  }

  const runStart = performance.now();
  try {
    instance = (await WebAssembly.instantiate(built.wasm, { env })).instance;
    memory = instance.exports.memory;
    if (typeof instance.exports.__mk_init === 'function') instance.exports.__mk_init();

    const hasMain = typeof instance.exports.main === 'function';
    if (hasMain) {
      const returned = instance.exports.main();
      if (returned !== undefined) post({ type: 'output', text: String(returned) + '\n' });
    }

    if (pending > 0) {
      await Promise.race([idle(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }

    post({
      type: 'result',
      ok: true,
      hasMain,
      bytes: built.wasm.byteLength,
      compileMs,
      runMs: performance.now() - runStart,
    });
  } catch (err) {
    post({
      type: 'result',
      ok: false,
      runtimeError: err?.message || String(err),
      bytes: built.wasm.byteLength,
      compileMs,
      runMs: performance.now() - runStart,
    });
  }
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') init().catch(fatal);
  else if (message.type === 'run') run(message.source, message.filename).catch(fatal);
};
