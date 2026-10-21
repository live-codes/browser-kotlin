// Builds the IIFE bundle: one classic script, for workers and pages that cannot
// use ES modules. The output is committed, because a classic worker can only
// `importScripts()` a URL and consumers should not need a bundler to get one.
import { build } from 'esbuild';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outfile = fileURLToPath(new URL('../dist/kotlin-wasm.global.js', import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  outfile,
  bundle: true,
  format: 'iife',
  globalName: 'kotlinWasm',
  minify: true,
  platform: 'browser',
  target: 'es2022',
  legalComments: 'external',
  banner: {
    js: `/*! @live-codes/kotlin-wasm - MIT. IIFE build, sets self.kotlinWasm.
 *  importScripts('kotlin-wasm.global.js') then self.kotlinWasm.createCompiler({ baseUrl }).
 *  The real Kotlin K2 compiler built as a GraalVM Web Image; see THIRD-PARTY-NOTICES.md. */`
  }
});

console.log(
  `dist/kotlin-wasm.global.js  ${(statSync(outfile).size / 1024).toFixed(1)} KB (minified)`
);
