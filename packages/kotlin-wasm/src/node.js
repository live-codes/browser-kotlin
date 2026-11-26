import { Worker } from 'node:worker_threads';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { COMPILER_VERSION } from './language.js';
import { KotlinUnsupportedError, KotlinWasmError } from './errors.js';
import { compileWithLibraries } from './libraries.js';
import { buildResult, compileFailureResult, formatDiagnostics } from './output.js';
import { prepareSource, splitLines } from './prelude.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_COMPILE_TIMEOUT_MS = 180000;
const PACKAGED = fileURLToPath(new URL('../assets/', import.meta.url));
const PACKAGED_JS = fileURLToPath(new URL('../assets/js/', import.meta.url));
const WORKER = fileURLToPath(new URL('./node/compiler-worker.mjs', import.meta.url));

const records = new Map();

function assertNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 22) {
    throw new KotlinUnsupportedError(
      'Kotlin (Wasm) needs Node 22 or later: the compiler image uses the exception-handling proposal.'
    );
  }
  // Node 24 enables WebAssembly exceptions by default; older versions need the
  // flag. Test the capability rather than the command line: `node --test` runs
  // each file in a child process that does not repeat the parent's execArgv.
  if (typeof WebAssembly.Exception !== 'function' || typeof WebAssembly.Tag !== 'function') {
    throw new KotlinUnsupportedError(
      'Node needs WebAssembly exception handling. On Node 22–23, run with ' +
        '`node --experimental-wasm-exnref your-app.mjs`, or add it to NODE_OPTIONS.'
    );
  }
}

async function download(url, target, tracker) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new KotlinWasmError(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  const total = Number(response.headers.get('content-length')) || 0;
  tracker.addTotal(total);
  const chunks = [];
  let loaded = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      tracker.addLoaded(value.byteLength);
    }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());
    chunks.push(bytes);
    loaded = bytes.byteLength;
    tracker.addLoaded(bytes.byteLength);
  }
  await writeFile(target, Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

async function hostedAssets(baseUrl, onProgress) {
  const base = String(baseUrl);
  if (!/^https?:\/\//i.test(base)) {
    throw new KotlinWasmError('baseUrl must be an http(s) URL in Node.');
  }
  const root = base.endsWith('/') ? base : `${base}/`;
  const dir = await mkdtemp(join(tmpdir(), 'kotlin-wasm-assets-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });

  const tracker = {
    loaded: 0,
    total: 0,
    addTotal(fileTotal) {
      if (fileTotal) this.total += fileTotal;
    },
    addLoaded(delta) {
      this.loaded += delta;
      if (onProgress && this.total) onProgress(Math.min(1, this.loaded / this.total));
    }
  };

  try {
    const manifestResponse = await fetch(new URL('kotlin-assets.json', root));
    if (!manifestResponse.ok) {
      throw new KotlinWasmError(
        `Failed to load ${new URL('kotlin-assets.json', root)}: ${manifestResponse.status}`
      );
    }
    const manifestText = await manifestResponse.text();
    const manifest = JSON.parse(manifestText);
    await writeFile(join(dir, 'kotlin-assets.json'), manifestText);

    const files = [
      'kotlin-compiler-image.js',
      ...(manifest.compiler?.parts || []),
      manifest.stdlib?.file
    ].filter(Boolean);

    for (const name of files) {
      await download(new URL(name, root).href, join(dir, name), tracker);
    }
    if (onProgress) onProgress(1);
    return { dir, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function targetBase(baseUrl, target) {
  let root = String(baseUrl);
  if (!root.endsWith('/')) root += '/';
  if (target === 'js' && !root.endsWith('/js/')) root += 'js/';
  return root;
}

async function resolveAssets(options, target) {
  const packed = target === 'js' ? PACKAGED_JS : PACKAGED;
  if (!options.baseUrl) return { dir: packed, cleanup: async () => {} };
  return hostedAssets(targetBase(options.baseUrl, target), options.onProgress);
}

async function createRecord(assets, onProgress) {
  assertNode();
  const tempDir = await mkdtemp(join(tmpdir(), 'kotlin-wasm-run-'));
  const record = {
    key: assets.dir,
    assets,
    tempDir,
    worker: null,
    ready: null,
    dead: false,
    failure: null,
    nextId: 1,
    pending: new Map(),
    progressSinks: new Set(onProgress ? [onProgress] : []),
    references: 0,
    queue: Promise.resolve()
  };

  const fail = (error) => {
    record.dead = true;
    record.failure = error instanceof Error ? error : new Error(String(error));
    for (const entry of record.pending.values()) {
      if (entry.reject) entry.reject(record.failure);
    }
    record.pending.clear();
  };

  const worker = new Worker(WORKER, {
    workerData: { assetsDir: assets.dir, tempDir }
  });
  record.worker = worker;

  record.ready = new Promise((resolve, reject) => {
    record.readyResolve = resolve;
    record.readyReject = reject;
  });

  worker.on('message', (data) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ready') {
      for (const sink of record.progressSinks) sink(1);
      record.readyResolve();
      return;
    }
    if (data.type === 'fatal') {
      const error = new KotlinWasmError(data.message || 'The Kotlin compiler failed to start.');
      record.readyReject?.(error);
      fail(error);
      return;
    }
    const entry = record.pending.get(data.id);
    if (!entry) return;
    if (data.type === 'output') {
      entry.chunks.push({ text: data.text, stream: data.stream, newline: data.newline });
      return;
    }
    if (data.type === 'compiled') {
      entry.compileMs = Number(data.compileMs) || 0;
      entry.onCompiled?.();
      return;
    }
    record.pending.delete(data.id);
    entry.onDone?.(data);
  });
  worker.on('error', (error) => {
    record.readyReject?.(error);
    fail(error);
  });
  worker.on('exit', (code) => {
    if (code !== 0) fail(new KotlinWasmError(`The Kotlin worker exited with code ${code}.`));
  });

  return record;
}

async function acquireRecord(assets, onProgress) {
  let record = records.get(assets.dir);
  if (!record) {
    record = await createRecord(assets, onProgress);
    records.set(assets.dir, record);
    try {
      await record.ready;
    } catch (error) {
      records.delete(assets.dir);
      try {
        record.worker.terminate();
      } catch {
        // already gone
      }
      await rm(record.tempDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  } else if (onProgress) {
    record.progressSinks.add(onProgress);
    onProgress(1);
  }
  record.references++;
  return record;
}

function releaseRecord(record, onProgress) {
  if (onProgress) record.progressSinks.delete(onProgress);
  record.references--;
  if (record.references > 0) return;
  records.delete(record.key);
  if (!record.dead) {
    try {
      record.worker.terminate();
    } catch {
      // already gone
    }
  }
  rm(record.tempDir, { recursive: true, force: true }).catch(() => {});
  if (record.assets.dir !== PACKAGED) {
    record.assets.cleanup().catch(() => {});
  }
}

function withLock(record, work) {
  const previous = record.queue;
  let release;
  record.queue = new Promise((resolve) => {
    release = resolve;
  });
  return previous.then(async () => {
    try {
      return await work();
    } finally {
      release();
    }
  });
}

function stopRecord(record, message) {
  record.dead = true;
  record.failure = new KotlinWasmError(message);
  try {
    record.worker.terminate();
  } catch {
    // already gone
  }
  records.delete(record.key);
}

function runOnRecord(record, { source, inputLines, fileName, timeoutMs, compileTimeoutMs }) {
  return withLock(record, () => {
    if (record.dead) throw record.failure || new KotlinWasmError('The Kotlin worker is not running.');
    return new Promise((resolve, reject) => {
      const id = record.nextId++;
      const chunks = [];
      const entry = {
        chunks,
        compileMs: 0,
        onCompiled: () => {
          clearTimeout(compileTimer);
          runTimer = setTimeout(() => {
            record.pending.delete(id);
            stopRecord(record, `Program did not finish within ${Math.round(timeoutMs / 1000)} s.`);
            resolve({ timedOut: true, timeoutMs, chunks, compileMs: entry.compileMs });
          }, timeoutMs);
        },
        onDone: (data) => {
          clearTimeout(compileTimer);
          clearTimeout(runTimer);
          if (data.type === 'error') {
            reject(new KotlinWasmError(data.message || 'The Kotlin run failed.'));
            return;
          }
          if (data.type === 'warmed') {
            resolve({ warmed: true });
            return;
          }
          if (data.type === 'result') {
            if (data.result?.error) {
              reject(new KotlinWasmError(data.result.error));
              return;
            }
            resolve({
              answer: data.result.answer,
              runtimeError: data.result.runtimeError,
              compileMs: Number(data.result.compileMs ?? entry.compileMs) || 0,
              runMs: data.result.runMs,
              chunks,
              timedOut: false
            });
            return;
          }
          reject(new KotlinWasmError('The Kotlin worker sent an unexpected message.'));
        }
      };
      record.pending.set(id, entry);
      let runTimer = 0;
      const compileTimer = setTimeout(() => {
        record.pending.delete(id);
        stopRecord(record, `The Kotlin compiler did not answer within ${Math.round(compileTimeoutMs / 1000)} s.`);
        reject(new KotlinWasmError(`The Kotlin compiler did not answer within ${Math.round(compileTimeoutMs / 1000)} s.`));
      }, compileTimeoutMs);

      record.worker.postMessage({
        type: 'run',
        id,
        source,
        inputLines: inputLines || [],
        fileName
      });
    });
  });
}

/**
 * Adds one optional library to the compiler, by name.
 *
 * The archive is read from the assets directory and passed as base64, the same
 * operation the browser engines use, so Node and the browser agree on what a
 * program can import.
 */
function addLibraryOnRecord(record, name, archive) {
  return withLock(record, () => {
    if (record.dead) throw record.failure || new KotlinWasmError('The Kotlin worker is not running.');
    return new Promise((resolve, reject) => {
      const id = record.nextId++;
      record.pending.set(id, {
        onDone: (data) => {
          if (data.type === 'library') {
            resolve(data.result);
          } else if (data.type === 'error') {
            reject(new KotlinWasmError(data.message || 'The Kotlin library failed to load.'));
          } else {
            reject(new KotlinWasmError('The Kotlin worker sent an unexpected message.'));
          }
        }
      });
      record.worker.postMessage({ type: 'addLibraries', id, name, archive });
    });
  });
}

function compileOnRecord(record, { source, fileName, compileTimeoutMs }) {
  return withLock(record, () => {
    if (record.dead) throw record.failure || new KotlinWasmError('The Kotlin worker is not running.');
    return new Promise((resolve, reject) => {
      const id = record.nextId++;
      const timer = setTimeout(() => {
        record.pending.delete(id);
        stopRecord(
          record,
          `The Kotlin compiler did not answer within ${Math.round(compileTimeoutMs / 1000)} s.`
        );
        reject(
          new KotlinWasmError(
            `The Kotlin compiler did not answer within ${Math.round(compileTimeoutMs / 1000)} s.`
          )
        );
      }, compileTimeoutMs);
      record.pending.set(id, {
        chunks: [],
        onDone: (data) => {
          clearTimeout(timer);
          if (data.type === 'error') {
            reject(new KotlinWasmError(data.message || 'The Kotlin compilation failed.'));
            return;
          }
          if (data.type === 'result') {
            if (data.result?.error) {
              reject(new KotlinWasmError(data.result.error));
              return;
            }
            resolve({
              answer: data.result.answer,
              compileMs: Number(data.result.compileMs) || 0
            });
            return;
          }
          reject(new KotlinWasmError('The Kotlin worker sent an unexpected message.'));
        }
      });
      record.worker.postMessage({ type: 'compile', id, source, fileName });
    });
  });
}

function decodeAnswerFiles(files, target) {
  return (files || []).map((file) => {
    if (target === 'js') {
      return {
        name: file.name,
        content: Buffer.from(file.content || '', 'base64').toString('utf8'),
        encoding: 'utf8'
      };
    }
    return { name: file.name, content: file.content, encoding: 'base64' };
  });
}

function warmRecord(record) {
  return withLock(record, () => {
    if (record.dead) throw record.failure || new KotlinWasmError('The Kotlin worker is not running.');
    return new Promise((resolve, reject) => {
      const id = record.nextId++;
      const timer = setTimeout(() => {
        record.pending.delete(id);
        reject(new KotlinWasmError('The Kotlin compiler did not warm up in time.'));
      }, DEFAULT_COMPILE_TIMEOUT_MS);
      record.pending.set(id, {
        chunks: [],
        onDone: (data) => {
          clearTimeout(timer);
          if (data.type === 'warmed') resolve();
          else reject(new KotlinWasmError(data.message || 'The Kotlin compiler did not warm up.'));
        }
      });
      record.worker.postMessage({ type: 'warm', id });
    });
  });
}

export async function createNodeEngine(options = {}) {
  assertNode();
  const target = options.target === 'js' ? 'js' : 'wasm';
  const assets = await resolveAssets(options, target);
  let record = await acquireRecord(assets, options.onProgress);

  const getRecord = async () => {
    if (!record.dead) return record;
    releaseRecord(record, options.onProgress);
    record = await acquireRecord(assets, options.onProgress);
    return record;
  };

  // Optional libraries are read from the assets directory on demand, so a
  // program that imports none never touches them.
  const loadedLibraries = new Set();
  const libraryIndex =
    target === 'js'
      ? JSON.parse(await readFile(join(assets.dir, 'libraries', 'kotlin-libraries.json'), 'utf8'))
      : { libraries: {} };
  const libraryOptions = () => ({
    libraries: libraryIndex.libraries,
    loaded: loadedLibraries,
    // The archives are shipped gzipped; the host wants the inflated bytes, as in
    // the browser, where the decompression happens on the page.
    fetchArchive: async (entry) => gunzipSync(await readFile(join(assets.dir, 'libraries', entry.file))),
    install: async (name, archive) => {
      await addLibraryOnRecord(record, name, archive.toString('base64'));
    },
  });

  /** Compiles with lazy library loading, sharing one implementation with the browser. */
  const compileWithRetries = (current, request) =>
    compileWithLibraries(() => compileOnRecord(current, request), {
      ...libraryOptions(),
      source: request.source,
    });

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
      const compileTimeout =
        Number(compileTimeoutMs) > 0 ? Number(compileTimeoutMs) : DEFAULT_COMPILE_TIMEOUT_MS;
      const current = await getRecord();
      // The shims are part of the program, so `compile()` emits what `run()` would
      // execute; a host that only compiles still gets the JVM conveniences.
      const prepared = prepareSource(code, '', target);
      const outcome = await compileWithRetries(current, {
        source: prepared.source,
        fileName,
        compileTimeoutMs: compileTimeout
      });
      const answer = outcome.answer;
      const compileMs = outcome.compileMs;
      if (!answer?.ok) {
        return {
          ok: false,
          target,
          compilerVersion: COMPILER_VERSION,
          fileName,
          compileMs,
          errors: formatDiagnostics(answer?.diagnostics, code, fileName),
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
    },

    async warm() {
      const current = await getRecord();
      await warmRecord(current);
    },

    async run({ code, input, fileName, timeoutMs, compileTimeoutMs }) {
      if (disposed) throw new Error('This compiler has been disposed.');
      const runTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
      const compileTimeout =
        Number(compileTimeoutMs) > 0 ? Number(compileTimeoutMs) : DEFAULT_COMPILE_TIMEOUT_MS;
      // Both targets get the JVM compatibility shims, appended so no offsets move;
      // wasm additionally gets the stdin prelude when input is supplied.
      const prepared = prepareSource(code, input, target);
      const current = await getRecord();
      // Load any library the program needs before the run, because the run
      // request compiles and executes in one round trip and cannot fetch one
      // itself. A program that imports nothing pays a single compile for this.
      const probe = await compileWithRetries(current, {
        source: prepared.source,
        fileName,
        compileTimeoutMs: compileTimeout
      });
      if (probe.answer && !probe.answer.ok) {
        return compileFailureResult(probe.answer, code, fileName, prepared.mapOffset);
      }
      const outcome = await runOnRecord(current, {
        source: prepared.source,
        inputLines: splitLines(input),
        fileName,
        timeoutMs: runTimeout,
        compileTimeoutMs: compileTimeout
      });
      if (outcome.answer && !outcome.answer.ok) {
        return compileFailureResult(outcome.answer, code, fileName, prepared.mapOffset);
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
