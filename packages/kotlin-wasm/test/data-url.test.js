import assert from 'node:assert/strict';
import test from 'node:test';

import { binaryDataUrl, scriptDataUrl, toBase64 } from '../src/data-url.js';

// These URLs are what a null-origin compile worker loads, so their shape matters:
// blob: URLs fail there, data: URLs do not.

test('scriptDataUrl produces a data: URL a worker can importScripts', () => {
  const url = scriptDataUrl('globalThis.x = 1;');
  assert.match(url, /^data:text\/javascript;charset=utf-8,/);
  // The payload must survive a round trip unchanged.
  const payload = decodeURIComponent(url.split(',').slice(1).join(','));
  assert.equal(payload, 'globalThis.x = 1;');
});

test('scriptDataUrl escapes characters that would break the URL', () => {
  // A newline and a comma would terminate or split a data URL if left raw.
  const source = 'a();\nb("%", #, ?);';
  const url = scriptDataUrl(source);
  assert.ok(!url.includes('\n'), 'newline must be escaped');
  assert.equal(decodeURIComponent(url.slice(url.indexOf(',') + 1)), source);
});

test('binaryDataUrl encodes bytes as base64, not percent-encoding', () => {
  // Percent-encoding a multi-megabyte wasm module would triple its size, and
  // `fetch` of an application/wasm data URL expects base64.
  const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  const url = binaryDataUrl(bytes, 'application/wasm');
  assert.match(url, /^data:application\/wasm;base64,/);
  assert.equal(url.split(',')[1], 'AGFzbQEAAAA=');
});

test('toBase64 handles content larger than one stack frame', () => {
  // The compiler wasm is larger than a single apply() call can take.
  const big = new Uint8Array(200_000);
  for (let i = 0; i < big.length; i += 1) big[i] = i % 256;
  const encoded = toBase64(big);
  assert.equal(encoded.length, Math.ceil(big.length / 3) * 4);
  // Spot-check that the bytes round trip.
  const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  assert.equal(decoded.length, big.length);
  assert.equal(decoded[0], big[0]);
  assert.equal(decoded[big.length - 1], big[big.length - 1]);
});
