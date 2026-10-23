import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';

import {
  createCompiler,
  LANGUAGE_IDS,
  COMPILER_VERSION
} from '../src/index.node.js';

let compiler;

before(async () => {
  compiler = await createCompiler();
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
    target: 'wasm',
    stdin: true,
    wasmGc: true,
    programWasmGc: true,
    analysis: false
  });
});

test('createCompiler takes options, not a language argument', async () => {
  await assert.rejects(() => createCompiler('kotlin'), /options object/);
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

test('stdin: readln, readlnOrNull and readLine consume the supplied lines', async () => {
  const result = await compiler.run(
    `fun main() {
    println("a=" + readlnOrNull())
    println("b=" + readln())
    println("c=" + readLine())
    println("d=" + readlnOrNull())
}
`,
    'one\ntwo\nthree'
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout, 'a=one\nb=two\nc=three\nd=null\n');
});

test('stdin: CRLF input and a trailing newline are handled like Kotlin lines', async () => {
  const result = await compiler.run(
    `fun main() {
    println(readlnOrNull())
    println(readlnOrNull())
    println(readlnOrNull())
}
`,
    '1\r\n2\r\n'
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.stdout, '1\n2\nnull\n');
});

test('stdin: readln() throws at EOF', async () => {
  const result = await compiler.run(`fun main() { readln() }`);
  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join('\n'), /EOF/);
});

test('stdin: diagnostics still point at the caller’s line after the prelude', async () => {
  const result = await compiler.run(
    `import kotlin.math.PI

fun main() {
    val n: Int = "bad"
    println(n)
}
`,
    'some input'
  );

  assert.equal(result.exitCode, null);
  assert.match(result.errors[0], /^Main\.kt:4:\d+: error: Initializer type mismatch/);
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
