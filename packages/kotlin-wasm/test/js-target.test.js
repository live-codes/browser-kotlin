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
