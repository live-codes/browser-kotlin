// Node smoke test: compile and execute Kotlin with the vendored toolchain.
//
//   node test/smoke.mjs
//
// Needs a Node with WasmGC support for the generated module (Node 22+).

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

import { makeHostEnv } from '../vendor/minikotlin/engine/host-imports.mjs';
import { makeMathImports } from '../vendor/minikotlin/engine/math-runtime.mjs';
import { makeCharImports } from '../vendor/minikotlin/engine/char-runtime.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'vendor', 'minikotlin');

const createMinikotlin = createRequire(import.meta.url)(join(assets, 'minikotlin.js'));
const module = await createMinikotlin({ locateFile: (path) => join(assets, path) });

const cw = (name, result, args) => module.cwrap(name, result, args);
const compileRaw = cw('mkc_compile_buffer', 'number', ['string', 'string', 'number', 'number', 'number']);
const resultFree = cw('mkc_result_free', null, ['number']);
const errorCount = cw('mkc_error_count', 'number', ['number']);
const errorMessage = cw('mkc_error_message', 'string', ['number', 'number']);
const errorLine = cw('mkc_error_line', 'number', ['number', 'number']);
const errorCol = cw('mkc_error_col', 'number', ['number', 'number']);

function compile(source) {
  const wasmPtrPtr = module._malloc(4);
  const wasmLenPtr = module._malloc(4);
  let result = 0;
  try {
    result = compileRaw(source, 'Main.kt', 0, wasmPtrPtr, wasmLenPtr);
    const errors = [];
    for (let i = 0, n = errorCount(result); i < n; i++) {
      errors.push({
        message: errorMessage(result, i),
        line: errorLine(result, i),
        col: errorCol(result, i),
      });
    }
    let wasm = null;
    if (!errors.length) {
      wasm = new Uint8Array(
        module.HEAPU8.buffer,
        module.getValue(wasmPtrPtr, '*'),
        module.getValue(wasmLenPtr, 'i32'),
      ).slice();
    }
    return { wasm, errors };
  } finally {
    module._free(wasmPtrPtr);
    module._free(wasmLenPtr);
    if (result) resultFree(result);
  }
}

let mathImports;
let charImports;

async function run(source) {
  const { wasm, errors } = compile(source);
  if (errors.length) return { errors };

  const output = [];
  let instance;
  let memory;
  let pending = 0;
  let resolveIdle = null;

  const env = makeHostEnv({
    getMemory: () => memory,
    write: (text) => output.push(text),
    getResume: () => instance && instance.exports.__co_resume,
    onTimerScheduled: () => { pending++; },
    onTimerFired: () => {
      if (--pending === 0 && resolveIdle) {
        const resolve = resolveIdle;
        resolveIdle = null;
        resolve();
      }
    },
  });

  mathImports ??= makeMathImports(await readFile(join(assets, 'engine', 'kotlin_math_rt.wasm')));
  charImports ??= makeCharImports(await readFile(join(assets, 'engine', 'kotlin_char_rt.wasm')));
  Object.assign(env, await mathImports, await charImports);

  instance = (await WebAssembly.instantiate(wasm, { env })).instance;
  memory = instance.exports.memory;
  instance.exports.__mk_init?.();
  instance.exports.main?.();

  if (pending > 0) {
    await new Promise((resolve) => {
      resolveIdle = resolve;
      setTimeout(resolve, 5000);
    });
  }

  return { output: output.join(''), bytes: wasm.byteLength };
}

const hello = `
data class Point(val x: Int, val y: Int)

fun main() {
    println("hello from Kotlin")
    val p = Point(2, 3)
    println("sum = \${p.x + p.y}")
}
`;

const result = await run(hello);
assert.equal(result.errors, undefined, 'hello program should compile');
assert.equal(result.output, 'hello from Kotlin\nsum = 5\n');
assert.ok(result.bytes > 0, 'compiler should emit a wasm module');

const broken = await run('fun main() { println(missingName) }');
assert.ok(broken.errors?.length > 0, 'broken program should report diagnostics');
assert.match(broken.errors[0].message, /missingName/);

console.log('smoke test passed');
console.log('  hello: ' + result.output.trim().replace(/\n/g, ' | '));
console.log('  wasm: ' + result.bytes + ' bytes');
console.log('  diagnostics: ' + broken.errors[0].message);
