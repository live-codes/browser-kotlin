import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

const libraries = fileURLToPath(new URL('../assets/js/libraries/', import.meta.url));

// The optional libraries are downloaded lazily, so their integrity and the
// closure they declare matter as much as the compiler's own assets.

async function manifest() {
  return JSON.parse(await readFile(join(libraries, 'kotlin-libraries.json'), 'utf8'));
}

test('every library archive inflates to the size and hash the manifest pins', async () => {
  const { libraries: entries } = await manifest();
  assert.ok(Object.keys(entries).length > 0);

  for (const [name, entry] of Object.entries(entries)) {
    const raw = gunzipSync(await readFile(join(libraries, entry.file)));
    assert.equal(raw.byteLength, entry.rawBytes, `${name} inflated size`);
    const { createHash } = await import('node:crypto');
    const sha = createHash('sha256').update(raw).digest('hex');
    assert.equal(sha, entry.rawSha256, `${name} inflated sha256`);
  }
});

test('the manifest ships no archive it does not describe', async () => {
  const { libraries: entries } = await manifest();
  const files = (await readdir(libraries)).filter((name) => name.endsWith('.bin.gz')).sort();
  assert.deepEqual(files, Object.values(entries).map((entry) => entry.file).sort());
});

test('each library declares the import roots its name implies', async () => {
  const { libraries: entries } = await manifest();
  for (const [name, entry] of Object.entries(entries)) {
    assert.ok(entry.importRoots?.length, `${name} needs importRoots to be matched`);
    // A truncated diagnostic reports the first segment, so roots must be at least
    // as specific as the package the library provides.
    for (const root of entry.importRoots) {
      assert.match(root, /^[a-z][\w.]*$/i, `${name} root ${root} is a package path`);
    }
  }
  assert.deepEqual(entries['kotlinx-browser'].importRoots, ['kotlinx.browser']);
  assert.deepEqual(entries['kotlin-test'].importRoots, ['kotlin.test']);
});

test('a library closure only names libraries that exist', async () => {
  const { libraries: entries } = await manifest();
  for (const [name, entry] of Object.entries(entries)) {
    for (const dependency of entry.dependsOn) {
      assert.ok(entries[dependency], `${name} depends on unknown ${dependency}`);
    }
  }
});

test('every archive is under jsDelivr’s 20 MB per-file cap', async () => {
  const { libraries: entries } = await manifest();
  for (const [name, entry] of Object.entries(entries)) {
    assert.ok(entry.gzBytes < 20_000_000, `${name} is too large`);
  }
});
