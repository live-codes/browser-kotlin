#!/usr/bin/env node
// Fetches the optional Kotlin/JS libraries and packs each into the archive format
// the compiler host reads: a count, then the name, size and bytes of every file.
//
//   node scripts/fetch-libraries.mjs
//
// Re-run after changing a version in kotlin-libraries.json, or when adding a
// library. The committed archives let a clone run without this step.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'assets', 'js', 'libraries');
const manifestPath = join(out, 'kotlin-libraries.json');
const M2 = 'https://repo1.maven.org/maven2';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// group, artifact, version. The artifact ends in -js because these are the
// Kotlin/JS variants; kotlin-dom-api-compat is a plain artifact name.
//
// `importRoots` are the package roots the library provides. A compile that says
// `unresolved reference 'kotlinx'` is matched against them to decide what to
// fetch, so they must cover what user code imports.
const LIBRARIES = [
  { name: 'kotlin-dom-api-compat', group: 'org.jetbrains.kotlin', artifact: 'kotlin-dom-api-compat', version: '2.5.0-RC', dependsOn: [], importRoots: ['kotlin'] },
  { name: 'kotlinx-browser', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-browser-js', version: '0.5.0', dependsOn: ['kotlin-dom-api-compat'], importRoots: ['kotlinx.browser'] },
  { name: 'kotlinx-html', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-html-js', version: '0.12.0', dependsOn: ['kotlin-dom-api-compat'], importRoots: ['kotlinx.html'] },
  { name: 'atomicfu', group: 'org.jetbrains.kotlinx', artifact: 'atomicfu-js', version: '0.33.0', dependsOn: ['kotlin-dom-api-compat'], importRoots: ['kotlinx.atomicfu'] },
  { name: 'kotlinx-coroutines-core', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-coroutines-core-js', version: '1.11.0', dependsOn: ['kotlin-dom-api-compat', 'atomicfu'], importRoots: ['kotlinx.coroutines'] },
  { name: 'kotlinx-collections-immutable', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-collections-immutable-js', version: '0.5.2', dependsOn: ['kotlin-dom-api-compat'], importRoots: ['kotlinx.collections.immutable'] },
  { name: 'kotlinx-serialization-core', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-serialization-core-js', version: '1.13.0', dependsOn: [], importRoots: ['kotlinx.serialization'] },
  { name: 'kotlinx-serialization-json', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-serialization-json-js', version: '1.13.0', dependsOn: ['kotlinx-serialization-core'], importRoots: ['kotlinx.serialization.json'] },
  { name: 'kotlinx-datetime', group: 'org.jetbrains.kotlinx', artifact: 'kotlinx-datetime-js', version: '0.8.0', dependsOn: ['kotlinx-serialization-core', 'kotlin-dom-api-compat'], importRoots: ['kotlinx.datetime'] },
  { name: 'kotlin-test', group: 'org.jetbrains.kotlin', artifact: 'kotlin-test-js', version: '2.5.0-RC', dependsOn: [], importRoots: ['kotlin.test'] },
];

const work = join(out, '.download');
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

/** Packs one unpacked klib directory into the host's archive format. */
async function pack(dir) {
  const files = [];
  const walk = async (current, prefix) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path, name);
      else files.push({ name, bytes: await readFile(path) });
    }
  };
  await walk(dir, '');
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const chunks = [];
  const count = Buffer.alloc(4);
  count.writeInt32BE(files.length);
  chunks.push(count);
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    if (name.length > 0xffff) throw new Error(`entry name too long: ${file.name}`);
    const nameLength = Buffer.alloc(2);
    nameLength.writeUInt16BE(name.length);
    const size = Buffer.alloc(4);
    size.writeInt32BE(file.bytes.length);
    chunks.push(nameLength, name, size, file.bytes);
  }
  return Buffer.concat(chunks);
}

const manifest = { libraries: {} };
for (const library of LIBRARIES) {
  const { group, artifact, version, name, dependsOn, importRoots } = library;
  const url = `${M2}/${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.klib`;
  const klib = join(work, `${name}.klib`);
  console.log(`${name} ${version}`);
  execFileSync('curl', ['-sS', '--fail', '--retry', '3', '-o', klib, url], { stdio: 'inherit' });

  const unpacked = join(work, name);
  await mkdir(unpacked, { recursive: true });
  execFileSync('tar', ['-xf', klib, '-C', unpacked], { stdio: 'inherit' });

  const raw = await pack(unpacked);
  const gz = gzipSync(raw, { level: 9 });
  await writeFile(join(out, `${name}.bin.gz`), gz);
  manifest.libraries[name] = {
    version,
    dependsOn,
    importRoots,
    file: `${name}.bin.gz`,
    gzBytes: gz.byteLength,
    rawBytes: raw.byteLength,
    rawSha256: sha256(raw),
  };
  console.log(`  ${raw.byteLength} raw, ${gz.byteLength} gz`);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await rm(work, { recursive: true, force: true });
console.log(`\nwrote ${Object.keys(manifest.libraries).length} libraries to ${out}`);
