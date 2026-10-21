import { COMPILER_VERSION, LANGUAGE_IDS, resolveLanguage } from './language.js';
import { KotlinStdinUnsupportedError } from './errors.js';

// One implementation, two entries: `index.js` starts the compiler worker in a
// browser, `index.node.js` starts it in a Node worker thread.
export function createApi({ createEngine }) {
  async function createCompiler(language = 'kotlin', options = {}) {
    const resolved = resolveLanguage(language);
    const engine = await createEngine(options);
    const fileName = options.fileName || resolved.fileName;
    let disposed = false;

    return {
      /** The resolved language id, `kotlin`. */
      language: resolved.id,

      /** The name diagnostics use for the single source file. */
      fileName,

      /** The Kotlin compiler version in the vendored Web Image. */
      compilerVersion: COMPILER_VERSION,

      /** What this engine can do, for a host that routes between engines. */
      capabilities: Object.freeze({
        language: resolved.id,
        compiler: COMPILER_VERSION,
        stdin: false,
        wasmGc: true,
        analysis: false
      }),

      /**
       * Compile and run one program.
       *
       * @param {string} code - Kotlin source.
       * @param {string|Uint8Array} [input] - must be empty: Kotlin/Wasm has no stdin.
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
        const hasInput =
          input != null &&
          (typeof input === 'string' ? input.length > 0 : (input.byteLength ?? input.length ?? 0) > 0);
        if (hasInput) throw new KotlinStdinUnsupportedError();

        return engine.run({
          code,
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
