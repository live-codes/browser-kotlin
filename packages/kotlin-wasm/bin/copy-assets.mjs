#!/usr/bin/env node
// Copies the runtime assets that ship inside this package into a directory you
// serve. A page cannot read a file inside node_modules, so the browser story is
// one command and a baseUrl.
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ASSET_RECEIPTS } from '../src/asset-receipts.js';

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url));

const USAGE = `Copy the runtime assets that ship with this package into a directory you serve.

  kotlin-wasm-copy-assets [directory]

  directory      where to write them (default: ./kotlin)

  --print-path   print the packaged assets directory and exit
  --help         print this
`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(USAGE);
  process.exit(0);
}
if (args.includes('--print-path')) {
  console.log(ASSETS);
  process.exit(0);
}

const target = resolve(args.find((arg) => !arg.startsWith('-')) ?? 'kotlin');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Verify before copying: a stale pairing should fail here, not on someone's page.
for (const [name, receipt] of Object.entries(ASSET_RECEIPTS)) {
  const bytes = await readFile(resolve(ASSETS, name));
  if (bytes.byteLength !== receipt.bytes || sha256(bytes) !== receipt.sha256) {
    throw new Error(`Asset ${name} does not match its receipt; reinstall the package.`);
  }
}

await mkdir(target, { recursive: true });
for (const entry of await readdir(ASSETS, { withFileTypes: true })) {
  await cp(resolve(ASSETS, entry.name), resolve(target, entry.name), {
    recursive: true,
    force: true
  });
}

await writeFile(
  resolve(target, 'asset-receipts.json'),
  `${JSON.stringify(ASSET_RECEIPTS, null, 2)}\n`
);

console.log(`Runtime assets copied to ${target}`);
console.log('Serve that directory and pass its URL as baseUrl, for example:');
console.log("  await createCompiler({ baseUrl: new URL('/kotlin/', location.href) });");
