import { COMPILER_VERSION } from './language.js';
import { KotlinUnsupportedError, KotlinWasmError } from './errors.js';
import { compileWithLibraries } from './libraries.js';
import { buildResult, compileFailureResult, formatDiagnostics } from './output.js';
import { JS_STDIN_HOOK, prepareSource, splitLines } from './prelude.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_COMPILE_TIMEOUT_MS = 180000;

const records = new Map();

/**
 * Fetches bytes from the page. Libraries are fetched here rather than in the
 * worker because the page is what knows the asset URL and already has the
 * fetch/decompress path.
 */
async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new KotlinWasmError(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Gunzips a complete archive, accepting one already served decompressed. */
async function inflateArchive(bytes) {
  if (!(bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Base64 without blowing the call stack on a multi-megabyte archive. */
function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function assertBrowser() {
  if (typeof Worker !== 'function' || typeof WebAssembly !== 'object') {
    throw new KotlinUnsupportedError(
      'Kotlin (Wasm) needs Web Workers and WebAssembly. This environment has neither.'
    );
  }
  if (typeof DecompressionStream !== 'function') {
    throw new KotlinUnsupportedError(
      'Kotlin (Wasm) needs DecompressionStream to inflate the compiler assets.'
    );
  }
}

export function resolveBaseUrl(options) {
  if (!options.baseUrl) {
    throw new KotlinWasmError(
      'baseUrl is required in the browser. Copy the package assets somewhere your page can ' +
        'fetch them (`npx @live-codes/kotlin-wasm kotlin-wasm-copy-assets <dir>`) and pass that ' +
        'directory as baseUrl.'
    );
  }
  const base = typeof document !== 'undefined' ? document.baseURI : globalThis.location?.href;
  const url = new URL(String(options.baseUrl), base);
  let href = url.href.endsWith('/') ? url.href : `${url.href}/`;
  if (options.target === 'js' && !href.endsWith('/js/')) href = new URL('js/', href).href;
  return href;
}

// A classic Worker must be same-origin; assets are often on a CDN. Fetch the
// two small scripts, rewrite their relative paths to absolute asset URLs, and
// start them from Blob URLs instead. The 30 MB compiler/stdlib stay on the CDN.
async function loadWorkerScripts(baseUrl) {
  const fetchText = async (name) => {
    const url = new URL(name, baseUrl).href;
    const response = await fetch(url);
    if (!response.ok) {
      throw new KotlinWasmError(`Failed to load ${url}: ${response.status} ${response.statusText}`);
    }
    return response.text();
  };

  const [wrapperText, imageText] = await Promise.all([
    fetchText('kotlin-compiler-worker.js'),
    fetchText('kotlin-compiler-image.js')
  ]);

  const imageUrl = URL.createObjectURL(
    new Blob([rewriteImage(imageText, baseUrl)], { type: 'text/javascript' })
  );
  const wrapperUrl = URL.createObjectURL(
    new Blob([rewriteWrapper(wrapperText, baseUrl, imageUrl)], { type: 'text/javascript' })
  );
  return { wrapperUrl, imageUrl };
}

export function rewriteWrapper(text, baseUrl, imageUrl) {
  const manifestUrl = new URL('kotlin-assets.json', baseUrl).href;
  return text
    .replace(
      "new URL('./kotlin-assets.json', self.location.href)",
      `new URL(${JSON.stringify(manifestUrl)})`
    )
    .replace(
      "importScripts('./kotlin-compiler-image.js')",
      `importScripts(${JSON.stringify(imageUrl)})`
    );
}

/**
 * Points the generated loader at our own wasm/stdlib URLs. `urls` lets a caller
 * that already inflated the bytes (a worker loading the image itself) pass Blob
 * URLs instead of asset paths.
 */
export function rewriteImage(text, baseUrl, urls = {}) {
  const runCall = 'GraalVM.run(load_cmd_args(),config)';
  if (!text.includes(runCall)) {
    throw new KotlinWasmError(
      'The vendored Kotlin compiler image has an unexpected shape: its startup call was not found.'
    );
  }
  const wasmUrl = urls.wasmUrl || new URL('kotlin-compiler-worker.js.wasm', baseUrl).href;
  const stdlibUrl = urls.stdlibUrl || new URL('kotlin-stdlib-wasm-js.bin', baseUrl).href;
  return text
    .replace(
      runCall,
      `GraalVM.run(load_cmd_args(),Object.assign(config,{wasm_path:${JSON.stringify(wasmUrl)}}))`
    )
    .replace(
      "new URL('./kotlin-stdlib-wasm-js.bin', self.location.href)",
      `new URL(${JSON.stringify(stdlibUrl)})`
    );
}

async function createRecord(baseUrl, onProgress) {
  assertBrowser();
  const { wrapperUrl, imageUrl } = await loadWorkerScripts(baseUrl);

  const record = {
    key: baseUrl,
    baseUrl,
    worker: null,
    blobUrls: [wrapperUrl, imageUrl],
    nextId: 1,
    pending: new Map(),
    progress: new Map(),
    progressSinks: new Set(onProgress ? [onProgress] : []),
    references: 0,
    failure: null,
    warmPromise: null,
    queue: Promise.resolve()
  };

  const emitProgress = () => {
    let loaded = 0;
    let total = 0;
    for (const { loaded: l, total: t } of record.progress.values()) {
      loaded += l;
      total += t;
    }
    if (!total) return;
    const fraction = Math.min(1, loaded / total);
    for (const sink of record.progressSinks) sink(fraction);
  };

  const fail = (error) => {
    record.failure = error instanceof Error ? error : new Error(String(error));
    for (const { reject } of record.pending.values()) reject(record.failure);
    record.pending.clear();
  };

  const worker = new Worker(wrapperUrl, { name: 'kotlin-compiler' });
  record.worker = worker;

  worker.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'asset-progress') {
      record.progress.set(data.file, { loaded: data.loaded || 0, total: data.total || 0 });
      emitProgress();
      return;
    }
    if (data.type === 'asset-error') {
      fail(new KotlinWasmError(data.message || 'The Kotlin compiler assets failed to load.'));
      return;
    }
    const pending = record.pending.get(data.id);
    if (!pending) return;
    record.pending.delete(data.id);
    let answer;
    try {
      answer = JSON.parse(data.answer);
    } catch {
      pending.reject(new KotlinWasmError('The Kotlin compiler sent an invalid answer.'));
      return;
    }
    pending.resolve(answer);
  };
  worker.onerror = (event) => {
    fail(new KotlinWasmError(event.message || 'The Kotlin compiler worker failed to start.'));
  };
  worker.onmessageerror = () => {
    fail(new KotlinWasmError('The Kotlin compiler worker sent an unreadable message.'));
  };

  const request = (operation, text, argument = '', timeoutMs = DEFAULT_COMPILE_TIMEOUT_MS) =>
    new Promise((resolve, reject) => {
      if (record.failure) {
        reject(record.failure);
        return;
      }
      const id = record.nextId++;
      const timer = setTimeout(() => {
        record.pending.delete(id);
        fail(new KotlinWasmError(`The Kotlin compiler did not answer within ${Math.round(timeoutMs / 1000)} s.`));
        worker.terminate();
      }, timeoutMs);
      record.pending.set(id, {
        resolve: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      worker.postMessage({ id, operation, text, argument });
    });

  record.request = request;

  // Library state is per worker: a library added to this compiler host stays
  // added, so remember it rather than re-fetching on every compile.
  record.loadedLibraries = new Set();
  record.loadLibraryIndex = async () => {
    record.libraryIndex ??= JSON.parse(
      new TextDecoder().decode(
        await fetchBytes(new URL('libraries/kotlin-libraries.json', baseUrl))
      )
    );
    return record.libraryIndex;
  };
  record.fetchLibraryArchive = async (entry) => {
    const bytes = await fetchBytes(new URL(`libraries/${entry.file}`, baseUrl));
    return inflateArchive(bytes);
  };
  record.installLibrary = async (name, archive) => {
    const answer = await request('addLibraries', toBase64(archive), name);
    if (answer?.error) throw new KotlinWasmError(answer.error);
  };
  record.warm = () => {
    record.warmPromise ??= request('compile', 'fun main() {}').then((answer) => {
      if (answer?.error) throw new KotlinWasmError(answer.error);
      if (!answer?.ok) {
        throw new KotlinWasmError(
          'The Kotlin compiler could not compile an empty program: ' +
            JSON.stringify(answer?.diagnostics || [])
        );
      }
      for (const sink of record.progressSinks) sink(1);
    });
    return record.warmPromise;
  };

  return record;
}

async function acquireRecord(baseUrl, onProgress) {
  let record = records.get(baseUrl);
  if (!record) {
    record = await createRecord(baseUrl, onProgress);
    records.set(baseUrl, record);
  } else if (onProgress) {
    record.progressSinks.add(onProgress);
    let loaded = 0;
    let total = 0;
    for (const { loaded: l, total: t } of record.progress.values()) {
      loaded += l;
      total += t;
    }
    if (total && loaded >= total) onProgress(1);
  }
  record.references++;
  return record;
}

function releaseRecord(record, onProgress) {
  if (onProgress) record.progressSinks.delete(onProgress);
  record.references--;
  if (record.references > 0) return;
  // A failed record must not be reused: the next caller should be able to retry.
  records.delete(record.key);
  try {
    record.worker.terminate();
  } catch {
    // already gone
  }
  for (const url of record.blobUrls) URL.revokeObjectURL(url);
}

function decodeAnswerFiles(files, target) {
  const decoder = new TextDecoder();
  return (files || []).map((file) => {
    const bytes = Uint8Array.from(atob(file.content || ''), (c) => c.charCodeAt(0));
    return target === 'js'
      ? { name: file.name, content: decoder.decode(bytes), encoding: 'utf8' }
      : { name: file.name, content: file.content, encoding: 'base64' };
  });
}

async function compileAnswer(record, { source, target, compileTimeoutMs }) {
  const timeout =
    Number(compileTimeoutMs) > 0 ? Number(compileTimeoutMs) : DEFAULT_COMPILE_TIMEOUT_MS;
  // Optional libraries are fetched only when a compile needs one, so a program
  // that imports nothing pays nothing. The host keeps what is added for the
  // lifetime of this worker, which is why the loaded set lives on the record.
  await record.loadLibraryIndex();
  const answer = await compileWithLibraries(
    async () => {
      const result = await record.request('compile', source, '', timeout);
      if (result?.error) throw new KotlinWasmError(result.error);
      return result;
    },
    {
      libraries: record.libraryIndex.libraries,
      loaded: record.loadedLibraries,
      fetchArchive: record.fetchLibraryArchive,
      install: record.installLibrary,
      source,
    },
  );
  return {
    answer,
    compileMs: Number(answer?.milliseconds) || 0,
    // The runner needs the compiler's own base64 entries, not the decoded text.
    files: answer?.files || [],
  };
}

async function compileInWorker(record, { source, fileName, target, compileTimeoutMs }) {
  const { answer, compileMs } = await compileAnswer(record, { source, target, compileTimeoutMs });
  if (!answer?.ok) {
    return {
      ok: false,
      target,
      compilerVersion: COMPILER_VERSION,
      fileName,
      compileMs,
      errors: formatDiagnostics(answer.diagnostics, source, fileName),
      files: []
    };
  }
  return {
    ok: true,
    target,
    compilerVersion: COMPILER_VERSION,
    fileName,
    compileMs,
    errors: [],
    files: decodeAnswerFiles(answer.files, target)
  };
}

async function runInWorker(record, { source, timeoutMs, input, target }) {
  // Compile through the same path as compile(), so a program that needs a
  // library gets it here too rather than failing with an unresolved reference.
  const { answer, compileMs, files } = await compileAnswer(record, { source, target });
  if (!answer.ok) {
    return { answer, compileMs, chunks: [], runMs: null };
  }

  const chunks = [];
  const outcome = target === 'js'
    ? await runCompiledJs(files, (chunk) => chunks.push(chunk), timeoutMs)
    : await runCompiledProgram(
        files,
        (chunk) => chunks.push(chunk),
        timeoutMs,
        input
      );
  return { answer, compileMs, chunks, ...outcome };
}

async function runCompiledJs(files, onChunk, timeoutMs) {
  const file =
    (files || []).find((entry) => entry.name === 'main.mjs') ||
    (files || []).find((entry) => /\.m?js$/.test(entry.name));
  if (!file) throw new KotlinWasmError('The Kotlin compiler did not emit a JavaScript module.');
  const source = new TextDecoder().decode(
    Uint8Array.from(atob(file.content || ''), (c) => c.charCodeAt(0))
  );
  const urls = [];
  const blob = (content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    urls.push(url);
    return url;
  };
  const main = blob(source, 'text/javascript');
  const runner = blob(
    `
    globalThis.write = (message) => postMessage({ output: String(message), stream: 'stdout', newline: false });
    const out = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stdout', newline: true });
    const err = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stderr', newline: true });
    console.log = out; console.info = out; console.debug = out;
    console.warn = err; console.error = err;
    try { await import(${JSON.stringify(main)}); postMessage({ done: true }); }
    catch (error) { postMessage({ done: true, error: String(error && error.stack || error) }); }
    `,
    'text/javascript'
  );

  const started = performance.now();
  return new Promise((resolve) => {
    const worker = new Worker(runner, { type: 'module', name: 'kotlin-program' });
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      for (const url of urls) URL.revokeObjectURL(url);
      resolve({ ...outcome, runMs: performance.now() - started });
    };
    const timer = setTimeout(
      () => finish({ timedOut: true, timeoutMs }),
      timeoutMs
    );
    worker.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object') return;
      if (data.done) finish({ runtimeError: data.error || null });
      else onChunk({ text: data.output, stream: data.stream, newline: data.newline });
    };
    worker.onerror = (event) =>
      finish({ runtimeError: event.message || 'The Kotlin program worker failed to start.' });
  });
}

async function runCompiledProgram(files, onChunk, timeoutMs, input = '') {
  const find = (name) => {
    const file = (files || []).find((entry) => entry.name === name);
    if (!file) throw new KotlinWasmError(`The Kotlin compiler did not emit ${name}.`);
    return file.content;
  };
  const bytes = (name) => Uint8Array.from(atob(find(name)), (c) => c.charCodeAt(0));
  const text = (name) => new TextDecoder().decode(bytes(name));
  const urls = [];
  const blob = (content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    urls.push(url);
    return url;
  };

  const wasm = blob(bytes('main.wasm'), 'application/wasm');
  const builtins = blob(text('main.js-builtins.mjs'), 'text/javascript');
  const imports = blob(
    text('main.import-object.mjs').replaceAll("'./main.js-builtins.mjs'", `'${builtins}'`),
    'text/javascript'
  );
  const main = blob(
    text('main.mjs')
      .replaceAll("'./main.import-object.mjs'", `'${imports}'`)
      .replaceAll("new URL('./main.wasm',import.meta.url).href", `'${wasm}'`),
    'text/javascript'
  );
  const runner = blob(
    `
    const inputLines = ${JSON.stringify(splitLines(input))};
    let inputIndex = 0;
    globalThis.${JS_STDIN_HOOK} = () => inputIndex < inputLines.length ? inputLines[inputIndex++] : null;
    globalThis.write = (message) => postMessage({ output: String(message), stream: 'stdout', newline: false });
    const out = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stdout', newline: true });
    const err = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stderr', newline: true });
    console.log = out; console.info = out; console.debug = out;
    console.warn = err; console.error = err;
    try { await import(${JSON.stringify(main)}); postMessage({ done: true }); }
    catch (error) { postMessage({ done: true, error: String(error && error.stack || error) }); }
    `,
    'text/javascript'
  );

  const started = performance.now();
  return new Promise((resolve) => {
    const worker = new Worker(runner, { type: 'module', name: 'kotlin-program' });
    let settled = false;
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      for (const url of urls) URL.revokeObjectURL(url);
      resolve({ ...outcome, runMs: performance.now() - started });
    };
    const timer = setTimeout(
      () => finish({ timedOut: true, timeoutMs }),
      timeoutMs
    );
    worker.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object') return;
      if (data.done) finish({ runtimeError: data.error || null });
      else onChunk({ text: data.output, stream: data.stream, newline: data.newline });
    };
    worker.onerror = (event) =>
      finish({ runtimeError: event.message || 'The Kotlin program worker failed to start.' });
  });
}

export async function createBrowserEngine(options = {}) {
  assertBrowser();
  const target = options.target === 'js' ? 'js' : 'wasm';
  const baseUrl = resolveBaseUrl(options);
  const record = await acquireRecord(baseUrl, options.onProgress);

  // A host that already runs in a worker can skip the throwaway compile.
  if (options.warm !== false) {
    try {
      await record.warm();
    } catch (error) {
      releaseRecord(record, options.onProgress);
      throw error;
    }
  }

  let disposed = false;
  return {
    capabilities: {
      language: 'kotlin',
      compiler: COMPILER_VERSION,
      target,
      stdin: target === 'wasm',
      wasmGc: true,
      programWasmGc: target === 'wasm',
      analysis: false
    },

    async compile({ code, fileName, compileTimeoutMs }) {
      if (disposed) throw new Error('This compiler has been disposed.');
      return compileInWorker(record, {
        source: code,
        fileName,
        target,
        compileTimeoutMs
      });
    },

    async warm() {
      await record.warm();
    },

    async run({ code, input, fileName, timeoutMs }) {
      if (disposed) throw new Error('This compiler has been disposed.');
      const runTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
      // The Wasm target prepends a stdin prelude, shifting every offset by a
      // fixed amount; diagnostics subtract it. The JS target prepends nothing.
      const prepared = target === 'js' ? { source: code, mapOffset: 0 } : prepareSource(code, input);
      const shift = typeof prepared.mapOffset === 'function'
        ? prepared.mapOffset
        : (offset) => offset - Number(prepared.mapOffset || 0);
      const outcome = await runInWorker(record, {
        source: prepared.source,
        timeoutMs: runTimeout,
        input,
        target
      });
      if (outcome.answer && !outcome.answer.ok) {
        return compileFailureResult(outcome.answer, code, fileName, shift);
      }
      return buildResult({
        chunks: outcome.chunks || [],
        runtimeError: outcome.runtimeError,
        timedOut: outcome.timedOut,
        timeoutMs: outcome.timeoutMs || runTimeout,
        compileMs: outcome.compileMs,
        runMs: outcome.runMs
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      releaseRecord(record, options.onProgress);
    }
  };
}
