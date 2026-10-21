import { Worker } from 'node:worker_threads';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMPILER_VERSION } from './language.js';
import { KotlinUnsupportedError, KotlinWasmError } from './errors.js';
import { buildResult, compileFailureResult } from './output.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_COMPILE_TIMEOUT_MS = 180000;
const PACKAGED = fileURLToPath(new URL('../assets/', import.meta.url));
const WORKER = fileURLToPath(new URL('./node/compiler-worker.mjs', import.meta.url));

const records = new Map();

function assertNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 22) {
    throw new KotlinUnsupportedError(
      'Kotlin (Wasm) needs Node 22 or later: the compiler image uses the exception-handling proposal.'
    );
  }
  const flag = '--experimental-wasm-exnref';
  const hasFlag =
    process.execArgv.includes(flag) ||
    (process.env.NODE_OPTIONS || '').split(/\s+/).includes(flag);
  if (!hasFlag) {
    throw new KotlinUnsupportedError(
      'Node needs the WebAssembly exception-handling flag. Run with ' +
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

async function resolveAssets(options) {
  if (!options.baseUrl) return { dir: PACKAGED, cleanup: async () => {} };
  return hostedAssets(options.baseUrl, options.onProgress);
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

function runOnRecord(record, { code, fileName, timeoutMs, compileTimeoutMs }) {
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

      record.worker.postMessage({ type: 'run', id, source: code, fileName });
    });
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
  const assets = await resolveAssets(options);
  let record = await acquireRecord(assets, options.onProgress);

  const getRecord = async () => {
    if (!record.dead) return record;
    releaseRecord(record, options.onProgress);
    record = await acquireRecord(assets, options.onProgress);
    return record;
  };

  let disposed = false;
  return {
    capabilities: {
      language: 'kotlin',
      compiler: COMPILER_VERSION,
      stdin: false,
      wasmGc: true,
      analysis: false
    },

    async warm() {
      const current = await getRecord();
      await warmRecord(current);
    },

    async run({ code, fileName, timeoutMs, compileTimeoutMs }) {
      if (disposed) throw new Error('This compiler has been disposed.');
      const runTimeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS;
      const compileTimeout =
        Number(compileTimeoutMs) > 0 ? Number(compileTimeoutMs) : DEFAULT_COMPILE_TIMEOUT_MS;
      const current = await getRecord();
      const outcome = await runOnRecord(current, {
        code,
        fileName,
        timeoutMs: runTimeout,
        compileTimeoutMs: compileTimeout
      });
      if (outcome.answer && !outcome.answer.ok) {
        return compileFailureResult(outcome.answer, code, fileName);
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
