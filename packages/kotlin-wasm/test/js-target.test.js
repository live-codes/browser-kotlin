import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompiler } from '../src/index.node.js';

test('js target compiles to a standalone module and runs it', async () => {
  const compiler = await createCompiler({ target: 'js' });
  try {
    assert.equal(compiler.target, 'js');
    assert.equal(compiler.capabilities.target, 'js');
    assert.equal(compiler.capabilities.stdin, false);
    assert.equal(compiler.capabilities.programWasmGc, false);

    const compiled = await compiler.compile('fun main() { println("from js") }');
    assert.equal(compiled.ok, true);
    assert.equal(compiled.target, 'js');
    assert.equal(compiled.errors.length, 0);
    assert.equal(compiled.files.length, 1);
    assert.equal(compiled.files[0].name, 'main.mjs');
    assert.equal(compiled.files[0].encoding, 'utf8');
    assert.match(compiled.files[0].content, /from js/);

    const result = await compiler.run('fun main() { println("run js") }');
    assert.equal(result.stdout, 'run js\n');
    assert.equal(result.stderr, '');
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.errors, []);
  } finally {
    compiler.dispose();
  }
});

test('js target reports compiler diagnostics', async () => {
  const compiler = await createCompiler({ target: 'js' });
  try {
    const compiled = await compiler.compile('fun main() { println(missingName) }');
    assert.equal(compiled.ok, false);
    assert.equal(compiled.files.length, 0);
    assert.ok(compiled.errors.some((line) => line.includes('missingName')));
  } finally {
    compiler.dispose();
  }
});

test('the JVM conveniences run without any host hooks', async () => {
  // A host like LiveCodes runs the emitted module as a plain script and defines
  // none of the __kotlin* hooks. The shims must fall back to the console rather
  // than throw "globalThis.__kotlinWrite is not a function".
  const compiler = await createCompiler({ target: 'js' });
  try {
    const result = await compiler.run(
      `fun main() {
    System.out.println("to stdout")
    System.err.println("to stderr")
    println("readLine=" + readLine())
}`,
      '',
      { timeoutMs: 60000, compileTimeoutMs: 180000 },
    );
    assert.deepEqual(result.errors, []);
    assert.equal(result.exitCode, 0, 'the program completes');
    assert.match(result.stdout, /to stdout/);
    assert.match(result.stderr, /to stderr/);
    assert.match(result.stdout, /readLine=null/);
  } finally {
    compiler.dispose();
  }
});
