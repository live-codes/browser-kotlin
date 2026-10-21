import { COMPILER_VERSION, DEFAULT_FILE_NAME, LANGUAGE_IDS } from './language.js';

function normalizeInput(input) {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (input instanceof Uint8Array) return new TextDecoder().decode(input);
  if (input instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(input));
  if (ArrayBuffer.isView(input)) {
    return new TextDecoder().decode(
      new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    );
  }
  throw new Error('run() input must be a string, Uint8Array or ArrayBuffer.');
}

// One implementation, two entries: `index.js` starts the compiler worker in a
// browser, `index.node.js` starts it in a Node worker thread.
export function createApi({ createEngine }) {
  async function createCompiler(options = {}) {
    if (typeof options === 'string') {
      throw new Error(
        'createCompiler takes an options object; Kotlin is the only language. ' +
          'Call createCompiler({ baseUrl }).'
      );
    }

    const engine = await createEngine(options);
    const fileName = options.fileName || DEFAULT_FILE_NAME;
    let disposed = false;

    return {
      /** The only language this package runs. */
      language: 'kotlin',

      /** The name diagnostics use for the single source file. */
      fileName,

      /** The Kotlin compiler version in the vendored Web Image. */
      compilerVersion: COMPILER_VERSION,

      /** What this engine can do, for a host that routes between engines. */
      capabilities: Object.freeze({
        language: 'kotlin',
        compiler: COMPILER_VERSION,
        stdin: true,
        wasmGc: true,
        analysis: false
      }),

      /**
       * Compile and run one program.
       *
       * @param {string} code - Kotlin source.
       * @param {string|Uint8Array|ArrayBuffer} [input] - lines pre-supplied to
       *   `readln()` / `readlnOrNull()` / `readLine()`. Not interactive.
       * @param {object} [runOptions]
       * @param {number} [runOptions.timeoutMs] - how long the program may run.
       * @param {string} [runOptions.fileName] - name used in diagnostics.
       * @returns {Promise<{stdout: string, stderr: string, output: string, errors: string[],
       *   exitCode: number|null, compileMs: number, runMs: number|null}>}
       */
      async run(code, input, runOptions = {}) {
        if (disposed) throw new Error('This compiler has been disposed.');
        if (typeof code !== 'string') {
          throw new Error('run() needs the program source as its first argument.');
        }

        return engine.run({
          code,
          input: normalizeInput(input),
          fileName: runOptions.fileName || fileName,
          timeoutMs: runOptions.timeoutMs,
          compileTimeoutMs: runOptions.compileTimeoutMs
        });
      },

      /**
       * Compile a throwaway program so the first user run pays less. Optional;
       * `createCompiler` has already loaded the toolchain.
       */
      warm() {
        if (disposed) throw new Error('This compiler has been disposed.');
        return engine.warm();
      },

      /** Release this compiler's hold on the shared toolchain. */
      dispose() {
        if (disposed) return;
        disposed = true;
        engine.dispose();
      }
    };
  }

  return { createCompiler, LANGUAGE_IDS, compilerVersion: COMPILER_VERSION };
}
