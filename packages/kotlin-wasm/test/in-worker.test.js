import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { GLUE_MARKER, stripWorkerGlue } from '../src/in-worker.js';
import { rewriteImage } from '../src/browser.js';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

// The in-worker loader exists because a host already has a worker for us. It
// cannot be exercised in Node (it needs importScripts), so this covers the two
// transformations it applies and the export the browser harness uses.

test('the shipped image carries the worker glue that would hijack the host', async () => {
  const image = await readFile(join(assets, 'kotlin-compiler-image.js'), 'utf8');
  assert.ok(image.includes(GLUE_MARKER), 'the build appends the glue before this marker');
  assert.ok(image.includes('self.onmessage ='), 'the glue assigns self.onmessage');
});

test('stripping the glue removes the message handler and the stdlib fetch', async () => {
  const image = await readFile(join(assets, 'kotlin-compiler-image.js'), 'utf8');
  const stripped = stripWorkerGlue(image);

  assert.ok(stripped.length < image.length);
  assert.ok(!stripped.includes('self.onmessage ='));
  assert.ok(!stripped.includes('./kotlin-stdlib-wasm-js.bin'));
  // The loader itself must survive: its startup call is what we patch next.
  assert.ok(stripped.includes('GraalVM.run(load_cmd_args(),config)'));
});

test('stripping text without glue leaves it alone instead of dropping code', () => {
  const text = 'GraalVM.run(load_cmd_args(),config);';
  assert.equal(stripWorkerGlue(text), text);
});

test('rewriteImage points the loader at the caller-supplied wasm module', () => {
  // Mirrors the real loader's shape: the startup call plus the stdlib fetch the
  // glue makes. (In the in-worker path the glue is stripped first, so the stdlib
  // URL is unused there; this covers the contract for the page path.)
  const image = `GraalVM.run(load_cmd_args(),config);
fetch(new URL('./kotlin-stdlib-wasm-js.bin', self.location.href));`;
  const patched = rewriteImage(image, 'https://cdn.example/assets/', {
    wasmUrl: 'blob:https://page/1234',
    stdlibUrl: 'https://cdn.example/assets/kotlin-stdlib-wasm-js.bin.gz'
  });

  assert.ok(patched.includes('wasm_path:"blob:https://page/1234"'));
  assert.ok(patched.includes('https://cdn.example/assets/kotlin-stdlib-wasm-js.bin.gz'));
});

test('the IIFE exposes the in-worker entry for a classic worker', async () => {
  const bundle = await readFile(join(dist, 'kotlin-wasm.global.js'), 'utf8');
  assert.ok(bundle.includes('createInWorkerCompiler'));
});
