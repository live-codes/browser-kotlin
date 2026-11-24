import assert from 'node:assert/strict';
import test from 'node:test';

import { createCompiler } from '../src/index.node.js';

// @Serializable depends on the serialization compiler plugin being baked into
// the image. The plugin cannot be loaded from a jar in a GraalVM image, so it is
// wired through a services directory; these tests pin that arrangement, because
// the failure mode is quiet: the program compiles and then throws at run time.

const SERIALIZABLE = `
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class Point(val x: Int, val y: Int)

fun main() {
    println(Json.encodeToString(Point(2, 3)))
    println(Json.decodeFromString<Point>("""{"x":2,"y":3}""").y)
}
`;

test('@Serializable encodes and decodes, not merely compiles', async () => {
  const compiler = await createCompiler({ target: 'js' });
  try {
    const result = await compiler.run(SERIALIZABLE, '', {
      timeoutMs: 60000,
      compileTimeoutMs: 180000,
    });
    const output = result.output;
    // A compiled-but-uninstrumented @Serializable throws "Serializer not found".
    assert.match(output, /\{"x":2,"y":3\}/, `encodeToString produced JSON: ${output}`);
    assert.match(output, /^3$/m, `decodeFromString read the field back: ${output}`);
  } finally {
    compiler.dispose();
  }
});

test('a program with no imports compiles without loading a library', async () => {
  const compiler = await createCompiler({ target: 'js' });
  try {
    const result = await compiler.compile('fun main() { println("ok") }');
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    // Registering the plugin is experimental, but that is our choice to make; the
    // warning must not reach the program's diagnostics.
    assert.deepEqual(
      result.errors.filter((error) => /compiler-plugin/i.test(error)),
      [],
      'our own registration warning is filtered',
    );
  } finally {
    compiler.dispose();
  }
});
