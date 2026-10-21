import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import {
  createCompiler,
  LANGUAGE_IDS,
  COMPILER_VERSION,
  KotlinStdinUnsupportedError
} from '../src/index.node.js';

let compiler;

before(async () => {
  compiler = await createCompiler('kotlin');
  // Pay the image's JIT warm-up once, outside the tests.
  await compiler.warm();
});

after(() => {
  compiler?.dispose();
});

test('there is one language and the compiler is the pinned K2 build', () => {
  assert.deepEqual([...LANGUAGE_IDS], ['kotlin']);
  assert.equal(COMPILER_VERSION, '2.5.0-dev-9169');
  assert.deepEqual(compiler.capabilities, {
    language: 'kotlin',
    compiler: '2.5.0-dev-9169',
    stdin: false,
    wasmGc: true,
    analysis: false
  });
});

test('an unknown language is rejected with the list of valid ones', async () => {
  await assert.rejects(() => createCompiler('scala'), /Unknown language/);
});

test('hello: print and println keep their exact newlines', async () => {
  const result = await compiler.run(`fun main() {
    print("a")
    print("b")
    println("c")
    println("d")
}
`);

  assert.deepEqual(Object.keys(result).sort(), [
    'compileMs',
    'errors',
    'exitCode',
    'output',
    'runMs',
    'stderr',
    'stdout'
  ]);
  assert.equal(result.stdout, 'abc\nd\n');
  assert.equal(result.stderr, '');
  assert.equal(result.output, 'abc\nd\n');
  assert.deepEqual(result.errors, []);
  assert.equal(result.exitCode, 0);
  assert.ok(result.compileMs >= 0);
  assert.ok(result.runMs >= 0);
});

test('data classes and the stdlib collections work', async () => {
  const result = await compiler.run(`
data class Person(val name: String, val age: Int)

fun main() {
    val people = listOf(
        Person("Alice", 29), Person("Bob", 31),
        Person("Carol", 24), Person("Dave", 31),
    )
    val byAge = people.groupBy { it.age }
    println(byAge)
    println(people.maxBy { it.age })
    println(people.sortedBy { it.name }.map { it.name.uppercase() })
    println("average = " + people.map { it.age }.average())
}
`);

  assert.deepEqual(result.errors, []);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /oldest|Person\(name=Bob/);
  assert.match(result.stdout, /\[ALICE, BOB, CAROL, DAVE\]/);
  assert.match(result.stdout, /average = 28\.75/);
});

test('a type error comes back as a located diagnostic, not a throw', async () => {
  const result = await compiler.run(`fun main() {
    val count: Int = "three"
    println(count)
}
`);

  assert.equal(result.exitCode, null);
  assert.equal(result.runMs, null);
  assert.equal(result.stdout, '');
  assert.ok(result.errors.length >= 1);
  assert.match(result.errors[0], /^Main\.kt:2:\d+: error: Initializer type mismatch/);
});

test('a runtime exception is reported with exit code 1', async () => {
  const result = await compiler.run(`fun main() {
    error("boom")
}
`);

  assert.equal(result.exitCode, 1);
  assert.ok(result.errors.length >= 1);
  assert.match(result.errors[0], /boom/);
});

test('stdin is refused with a typed error before compiling', async () => {
  await assert.rejects(
    () => compiler.run('fun main() {}', 'input'),
    (error) => error instanceof KotlinStdinUnsupportedError
  );
});

test('a runaway program is stopped and the next run works', { timeout: 180000 }, async () => {
  const timedOut = await compiler.run('fun main() { while (true) {} }', '', { timeoutMs: 1000 });
  assert.equal(timedOut.exitCode, 1);
  assert.match(timedOut.errors.join('\n'), /did not finish/);

  const after = await compiler.run('fun main() { println("after") }');
  assert.deepEqual(after.errors, []);
  assert.equal(after.exitCode, 0);
  assert.equal(after.stdout, 'after\n');
});
