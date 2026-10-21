import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import { ASSET_RECEIPTS } from '../src/asset-receipts.js';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('every shipped asset matches its receipt', async () => {
  const names = (await readdir(assets, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== 'README.md')
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(names, Object.keys(ASSET_RECEIPTS).sort());

  for (const name of names) {
    const bytes = await readFile(join(assets, name));
    assert.equal(bytes.byteLength, ASSET_RECEIPTS[name].bytes, `${name} size`);
    assert.equal(sha256(bytes), ASSET_RECEIPTS[name].sha256, `${name} sha256`);
  }
});

test('every file is under jsDelivr’s 20 MB per-file cap', async () => {
  for (const name of Object.keys(ASSET_RECEIPTS)) {
    assert.ok(ASSET_RECEIPTS[name].bytes < 20_000_000, `${name} is too large`);
  }
});

test('the compiler parts inflate to the pinned image, and the stdlib to the pinned archive', async () => {
  const manifest = JSON.parse(await readFile(join(assets, 'kotlin-assets.json'), 'utf8'));
  const compiler = Buffer.concat(
    await Promise.all(manifest.compiler.parts.map((name) => readFile(join(assets, name))))
  );
  assert.equal(compiler.byteLength, manifest.compiler.gzBytes);

  const wasm = gunzipSync(compiler);
  assert.equal(wasm.byteLength, manifest.compiler.rawBytes);
  assert.equal(sha256(wasm), manifest.compiler.rawSha256);

  const stdlib = gunzipSync(await readFile(join(assets, manifest.stdlib.file)));
  assert.equal(stdlib.byteLength, manifest.stdlib.rawBytes);
  assert.equal(sha256(stdlib), manifest.stdlib.rawSha256);
});
