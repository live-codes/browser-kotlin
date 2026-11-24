import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { JS_STDIN_HOOK } from '../prelude.js';

// A Node worker thread running the real Kotlin compiler image. The image is
// generated for the browser, but its Node path reads a local .wasm file, so we
// decompress the image, point `wasm_path` at it, and drive the host's
// `compile` operation directly. The compiled program is an ES module that
// reads its own main.wasm from disk, so it runs in a temp directory.
const require = createRequire(import.meta.url);
const { assetsDir, tempDir } = workerData;

let host = null;
let initError = null;

const post = (message) => parentPort.postMessage(message);

async function load() {
  const manifest = JSON.parse(await readFile(join(assetsDir, 'kotlin-assets.json'), 'utf8'));

  const parts = [];
  for (const name of manifest.compiler.parts) {
    parts.push(await readFile(join(assetsDir, name)));
  }
  const wasmPath = join(tempDir, 'compiler.wasm');
  await writeFile(wasmPath, gunzipSync(Buffer.concat(parts)));

  let image = await readFile(join(assetsDir, 'kotlin-compiler-image.js'), 'utf8');
  const runCall = 'GraalVM.run(load_cmd_args(),config)';
  if (!image.includes(runCall)) {
    throw new Error('The vendored Kotlin compiler image has an unexpected shape.');
  }
  image = image.replace(
    runCall,
    `GraalVM.run(load_cmd_args(),Object.assign(config,{wasm_path:${JSON.stringify(wasmPath)}}))`
  );
  const imagePath = join(tempDir, 'compiler-image.cjs');
  await writeFile(imagePath, image);

  // Keep the image's command-line arguments empty, as they are in a browser.
  process.argv = [process.argv[0], imagePath];
  require(imagePath);

  const deadline = Date.now() + 180_000;
  while (!globalThis.kotlinCompilerHost) {
    if (Date.now() > deadline) throw new Error('The Kotlin compiler host did not start.');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  host = globalThis.kotlinCompilerHost;

  const stdlib = gunzipSync(await readFile(join(assetsDir, manifest.stdlib.file)));
  const init = JSON.parse(host.call('init', stdlib.toString('base64'), ''));
  if (init.error) throw new Error(init.error);

  post({ type: 'ready', files: init.files });
}

const ready = load().catch((error) => {
  initError = error;
  post({ type: 'fatal', message: String(error?.stack || error) });
});

function compile(source) {
  const answer = JSON.parse(host.call('compile', source, ''));
  if (answer.error) throw new Error(answer.error);
  return answer;
}

/** Unpacks one optional library under its own name, as the browser engines do. */
function addLibraries(name, archiveBase64) {
  const answer = JSON.parse(host.call('addLibraries', archiveBase64, name));
  if (answer.error) throw new Error(answer.error);
  return answer;
}

parentPort.on('message', async (message) => {
  try {
    await ready;
    if (initError) throw initError;

    if (message.type === 'warm') {
      const answer = compile('fun main() {}');
      if (!answer.ok) throw new Error('An empty program did not compile.');
      post({ type: 'warmed', id: message.id });
      return;
    }

    if (message.type === 'compile') {
      const answer = compile(message.source);
      post({
        type: 'result',
        id: message.id,
        result: { answer, compileMs: answer.milliseconds, runMs: null }
      });
      return;
    }

    if (message.type === 'addLibraries') {
      const answer = addLibraries(message.name, message.archive);
      post({ type: 'library', id: message.id, result: { answer } });
      return;
    }

    if (message.type !== 'run') {
      post({ type: 'error', id: message.id, message: 'Unknown request.' });
      return;
    }

    const answer = compile(message.source);
    if (!answer.ok) {
      post({
        type: 'result',
        id: message.id,
        result: { answer, compileMs: answer.milliseconds, runMs: null }
      });
      return;
    }

    post({ type: 'compiled', id: message.id, compileMs: answer.milliseconds });

    const runDir = join(tempDir, `run-${message.id}`);
    await mkdir(runDir, { recursive: true });
    for (const file of answer.files) {
      await writeFile(join(runDir, file.name), Buffer.from(file.content, 'base64'));
    }

    const send = (text, stream, newline) =>
      post({ type: 'output', id: message.id, text, stream, newline });

    const inputLines = Array.isArray(message.inputLines) ? message.inputLines : [];
    let inputIndex = 0;
    globalThis[JS_STDIN_HOOK] = () =>
      inputIndex < inputLines.length ? inputLines[inputIndex++] : null;

    globalThis.write = (text) => send(String(text), 'stdout', false);
    const original = {};
    for (const level of ['log', 'info', 'debug']) {
      original[level] = console[level];
      console[level] = (...values) => send(values.map(String).join(' '), 'stdout', true);
    }
    for (const level of ['warn', 'error']) {
      original[level] = console[level];
      console[level] = (...values) => send(values.map(String).join(' '), 'stderr', true);
    }
    // Kotlin/JS writes through the process streams in Node.
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stdout.write = (chunk, encoding, callback) => {
      send(String(chunk), 'stdout', false);
      if (typeof encoding === 'function') encoding();
      else if (typeof callback === 'function') callback();
      return true;
    };
    process.stderr.write = (chunk, encoding, callback) => {
      send(String(chunk), 'stderr', false);
      if (typeof encoding === 'function') encoding();
      else if (typeof callback === 'function') callback();
      return true;
    };

    let runtimeError = null;
    const runStart = performance.now();
    try {
      await import(pathToFileURL(join(runDir, 'main.mjs')).href);
    } catch (error) {
      runtimeError = String(error?.stack || error);
    } finally {
      for (const level of Object.keys(original)) console[level] = original[level];
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      delete globalThis.write;
      delete globalThis[JS_STDIN_HOOK];
      await rm(runDir, { recursive: true, force: true }).catch(() => {});
    }

    post({
      type: 'result',
      id: message.id,
      result: {
        answer,
        compileMs: answer.milliseconds,
        runtimeError,
        runMs: performance.now() - runStart
      }
    });
  } catch (error) {
    post({ type: 'error', id: message.id, message: String(error?.stack || error) });
  }
});
