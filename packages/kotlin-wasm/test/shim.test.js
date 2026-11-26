import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCompatShims, COMPAT_SHIMS } from '../src/shim.js';

// The shims are compiled alongside every program, so their shape matters: they must
// never shadow a stdlib name, never recurse into themselves, and stay valid Kotlin.

test('supplies the APIs tutorials expect', () => {
  const shims = buildCompatShims('fun main() {}', 'js');
  const listed = COMPAT_SHIMS.join(' | ');
  for (const name of [
    'System.currentTimeMillis()',
    'System.arraycopy()',
    'String.format()',
    'Math',
    'Integer',
    'Character',
    'Arrays',
    'Collections',
    'Thread and thread()',
  ]) {
    assert.ok(listed.includes(name), `missing from COMPAT_SHIMS: ${name}`);
  }
  assert.match(shims, /fun String\.format/);
  assert.match(shims, /object Math \{/);
});

test('never declares a type that would shadow a kotlin.* name', () => {
  // `object Double` would hide kotlin.Double and break every Double in the program.
  // This is not hypothetical: it broke 14 of 14 probes when tried.
  const shims = buildCompatShims('fun main() {}', 'js') + buildCompatShims('fun main() {}', 'wasm');
  for (const name of ['Double', 'Float', 'Long', 'Int', 'Short', 'Byte', 'Boolean', 'String']) {
    assert.doesNotMatch(shims, new RegExp(`\\bobject\\s+${name}\\b`));
    assert.doesNotMatch(shims, new RegExp(`\\bclass\\s+${name}\\b`));
  }
});

test('matches how System already exists per target', () => {
  // js: the host declares `object System`, so members are extensions.
  const js = buildCompatShims('fun main() {}', 'js');
  assert.match(js, /fun System\.currentTimeMillis\(\): Long/);
  assert.doesNotMatch(js, /object System/);

  // wasm: there is no System at all, so it is declared whole, with its streams.
  const wasm = buildCompatShims('fun main() {}', 'wasm');
  assert.match(wasm, /object System \{/);
  assert.match(wasm, /val out: __KotlinPrintStream/);
  assert.match(wasm, /fun exit\(status: Int\)/);
  assert.match(wasm, /fun currentTimeMillis\(\): Long/);
});

test('the wasm print-stream type is public, since System.out exposes it', () => {
  // Kotlin rejects a public property whose type is private.
  const wasm = buildCompatShims('fun main() {}', 'wasm');
  assert.doesNotMatch(wasm, /private class __KotlinPrintStream/);
  assert.match(wasm, /^class __KotlinPrintStream/m);
});

test('host hooks are used instead of kotlin.math, which is not imported', () => {
  // `kotlin.math` is not in Kotlin's default imports and an appended file cannot add
  // an import; its functions are also extensions, so they cannot be fully qualified.
  // @JsFun works on both targets, and stops Math.sqrt resolving to itself.
  const shims = buildCompatShims('fun main() {}', 'js');
  assert.match(shims, /@JsFun\("\(v\) => Math\.sqrt\(v\)"\)/);
  assert.match(shims, /external fun __kotlinSqrt/);
  assert.doesNotMatch(shims, /kotlin\.math\./);
  assert.doesNotMatch(shims, /=\s*sqrt\(/);
  assert.doesNotMatch(shims, /=\s*abs\(/);
});

test('a program that declares its own version keeps it', () => {
  const own = 'fun main() {}\nfun printf(format: String) { }\nobject Math';
  const shims = buildCompatShims(own, 'js');
  assert.doesNotMatch(shims, /^object Math \{/m);
  // Everything else is still supplied.
  assert.match(shims, /fun String\.format/);
});

test('no hook or object is declared twice', () => {
  // Two `external fun __kotlinNowMs` declarations would not compile.
  for (const target of ['js', 'wasm']) {
    const shims = buildCompatShims('fun main() {}', target);
    assert.equal(shims.match(/external fun __kotlinNowMs/g)?.length ?? 0, 1, target);
    assert.equal(shims.match(/object Math \{/g)?.length ?? 0, 1, target);
    assert.equal(shims.match(/fun String\.format\(/g)?.length ?? 0, 1, target);
  }
});

test('every format specifier maps to an implementation', () => {
  const shims = buildCompatShims('fun main() {}', 'js');
  for (const specifier of ["'d'", "'f'", "'e'", "'x'", "'X'", "'o'", "'c'", "'b'"]) {
    assert.ok(shims.includes(specifier), `missing branch ${specifier}`);
  }
  assert.match(shims, /conversion == 'n'/);
});

test('reference-array arraycopy avoids the uncastable Array<*> assignment', () => {
  // `Array<*>` cannot be cast to `Array<Any?>` element-wise without the suppression.
  const shims = buildCompatShims('fun main() {}', 'js');
  assert.match(shims, /src is Array<\*> && dest is Array<\*>/);
  assert.match(shims, /@Suppress\("UNCHECKED_CAST"\)/);
});

test('the output is Kotlin for the program to append, never an import block', () => {
  // An appended file cannot carry `import`, or every compile would fail.
  for (const target of ['js', 'wasm']) {
    const shims = buildCompatShims('fun main() {}', target);
    assert.doesNotMatch(shims, /^\s*import\s+/m, target);
    assert.doesNotMatch(shims, /^\s*package\s+/m, target);
  }
});
