// Runs the compiler in the worker that is already executing, instead of starting
// a nested one. A host like LiveCodes gives every language one compile worker and
// loads the compiler into it; starting another worker from there would be a
// worker inside a worker for no gain.
//
//   self.importScripts('<baseUrl>../dist/kotlin-wasm.global.js');
//   const compiler = await self.kotlinWasm.createInWorkerCompiler({ baseUrl });
//   const { files } = await compiler.compile('fun main() { println(1) }');
//
// Classic workers only: it extends the worker's own global scope.
import { KotlinUnsupportedError, KotlinWasmError } from './errors.js';
import { compileWithLibraries } from './libraries.js';
import { formatDiagnostics } from './output.js';
import { resolveBaseUrl, rewriteImage } from './browser.js';

const DEFAULT_FILE_NAME = 'Main.kt';
const START_TIMEOUT_MS = 180000;

const isGzip = (bytes) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Fetches raw bytes. Gzip stays gzipped; only `inflate` unwraps it. */
async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new KotlinWasmError(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

// The vendored image is the generated loader *plus* the worker glue the build
// appends: a loop that waits for the host, fetches the stdlib itself and assigns
// `self.onmessage`. That is right when the image is used as a standalone worker,
// and wrong here: this worker already has a message handler (the host's), and
// the glue's own stdlib fetch targets a file we do not ship. Drop the glue and
// drive the host directly.
export const GLUE_MARKER = '// Appended by the build to the script GraalVM generates';

export function stripWorkerGlue(text) {
  const index = text.indexOf(GLUE_MARKER);
  if (index === -1) {
    // Not fatal: the host still works, but say so rather than silently coping.
    console.warn('The Kotlin compiler image has no worker glue to strip; using it as shipped.');
    return text;
  }
  return text.slice(0, index);
}

/**
 * Gunzips one complete archive. A part that is not a gzip member on its own is
 * a continuation of the previous one, so it must be returned untouched: only
 * the concatenation of all parts is a valid stream.
 */
async function inflate(bytes) {
  // A host may serve a `.gz` with `Content-Encoding: gzip`, which the browser
  // already inflated; only decompress when the magic bytes are still there.
  if (!isGzip(bytes)) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createInWorkerCompiler(options = {}) {
  if (typeof globalThis.importScripts !== 'function') {
    throw new KotlinUnsupportedError(
      'createInWorkerCompiler needs a classic Web Worker. In a page or module worker, use createCompiler.'
    );
  }
  if (typeof DecompressionStream !== 'function') {
    throw new KotlinUnsupportedError(
      'Kotlin (Wasm) needs DecompressionStream to inflate the compiler assets.'
    );
  }

  const baseUrl = resolveBaseUrl(options);
  const { onProgress } = options;
  // `target: 'js'` loads the Kotlin/JS image from `assets/js/`.
  const target = options.target === 'js' ? 'js' : 'wasm';

  const manifest = JSON.parse(
    new TextDecoder().decode(await fetchBytes(new URL('kotlin-assets.json', baseUrl)))
  );

  // Inflate both archives ourselves so we can hand the loader a Blob URL and the
  // host the stdlib as a string, without the extra worker a wrapper would start.
  // The parts are one gzip stream that the manifest split for the CDN's file
  // size cap, so they must be concatenated before inflating.
  const parts = [];
  for (const name of manifest.compiler.parts) {
    parts.push(await fetchBytes(new URL(name, baseUrl)));
  }
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  const wasm = await inflate(joined);

  const stdlib = await inflate(await fetchBytes(new URL(manifest.stdlib.file, baseUrl)));

  const wasmUrl = URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' }));
  const imageText = new TextDecoder().decode(
    await fetchBytes(new URL('kotlin-compiler-image.js', baseUrl))
  );
  const patched = rewriteImage(stripWorkerGlue(imageText), baseUrl, { wasmUrl });

  globalThis.importScripts(
    URL.createObjectURL(new Blob([patched], { type: 'text/javascript' }))
  );

  const deadline = Date.now() + START_TIMEOUT_MS;
  while (!globalThis.kotlinCompilerHost) {
    if (Date.now() > deadline) {
      throw new KotlinWasmError('The Kotlin compiler host did not start.');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const init = JSON.parse(globalThis.kotlinCompilerHost.call('init', toBase64(stdlib), ''));
  if (init.error) throw new KotlinWasmError(init.error);
  if (onProgress) onProgress(1);

  // Optional libraries are downloaded on demand, so a program that does not use
  // them pays nothing. The index is small; the archives are not.
  let libraryIndex = null;
  const loadedLibraries = new Set();

  async function ensureLibraryIndex() {
    libraryIndex ??= JSON.parse(
      new TextDecoder().decode(await fetchBytes(new URL('kotlin-libraries.json', baseUrl + 'libraries/')))
    );
    return libraryIndex;
  }

  const libraryOptions = (source) => ({
    libraries: libraryIndex.libraries,
    loaded: loadedLibraries,
    source,
    fetchArchive: async (entry) => inflate(await fetchBytes(new URL(entry.file, baseUrl + 'libraries/'))),
    install: async (name, archive) => {
      const answer = JSON.parse(
        globalThis.kotlinCompilerHost.call('addLibraries', toBase64(archive), name)
      );
      if (answer.error) throw new KotlinWasmError(answer.error);
    },
  });

  return {
    target,

    /**
     * Compile one program. Returns `{ ok, compileMs, errors, files }` with
     * `main.mjs` decoded to UTF-8 text.
     *
     * A compile that fails on one of our optional libraries transparently
     * downloads it and retries, so the user never sees the error it caused.
     */
    compile: async (code, { fileName = DEFAULT_FILE_NAME } = {}) => {
      if (typeof code !== 'string') {
        throw new KotlinWasmError('compile() needs the program source as its first argument.');
      }
      await ensureLibraryIndex();

      const answer = await compileWithLibraries(
        async () => {
          const result = JSON.parse(globalThis.kotlinCompilerHost.call('compile', code, ''));
          if (result.error) throw new KotlinWasmError(result.error);
          return result;
        },
        libraryOptions(code),
      );

      const compileMs = Number(answer.milliseconds) || 0;
      if (!answer.ok) {
        return {
          ok: false,
          compileMs,
          errors: formatDiagnostics(answer.diagnostics, code, fileName),
          files: []
        };
      }
      const decoder = new TextDecoder();
      return {
        ok: true,
        compileMs,
        errors: [],
        files: (answer.files || []).map((file) => {
          const bytes = Uint8Array.from(atob(file.content || ''), (c) => c.charCodeAt(0));
          return /\.m?js$/.test(file.name)
            ? { name: file.name, content: decoder.decode(bytes), encoding: 'utf8' }
            : { name: file.name, content: file.content, encoding: 'base64' };
        })
      };
    }
  };
}
