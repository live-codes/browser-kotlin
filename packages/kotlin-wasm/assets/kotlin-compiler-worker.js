// Classic-worker wrapper around the GraalVM Web Image compiler.
//
// The generated loader fetches its module as `self.location.href + ".wasm"`
// (i.e. `kotlin-compiler-worker.js.wasm`) and the stdlib as
// `./kotlin-stdlib-wasm-js.bin` relative to the worker. Both are shipped
// gzipped, and the compiler image is split into parts under 20 MB so a CDN with
// a per-file cap (jsDelivr) can host it. This wrapper is served under the name
// the loader expects; it patches `fetch` before importing the generated script,
// concatenates the parts, and inflates them with DecompressionStream. The
// generated image is untouched.
(() => {
  const realFetch = self.fetch.bind(self);
  const COMPRESSED = /\.(wasm|bin)$/;
  const isGzip = (bytes) => bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

  let manifestPromise = null;
  const loadManifest = () => {
    if (!manifestPromise) {
      manifestPromise = realFetch(new URL('./kotlin-assets.json', self.location.href))
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null);
    }
    return manifestPromise;
  };

  // The package forwards these to its `onProgress` callback. A page that uses
  // the worker directly can ignore them.
  const report = (file, loaded, total) =>
    self.postMessage({ type: 'asset-progress', file, loaded, total });

  async function readParts(urls, file, totalHint) {
    const chunks = [];
    let loaded = 0;
    const total = totalHint || 0;
    for (const url of urls) {
      const response = await realFetch(url);
      if (!response.ok) {
        throw new Error(`cannot load ${url}: ${response.status} ${response.statusText}`);
      }
      if (!response.body) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        chunks.push(bytes);
        loaded += bytes.byteLength;
        report(file, loaded, total || loaded);
        continue;
      }
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        report(file, loaded, total || loaded);
      }
    }
    return new Blob(chunks);
  }

  self.fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const parsed = new URL(url, self.location.href);
    const path = parsed.pathname;

    if (!COMPRESSED.test(path)) return realFetch(input, init);

    try {
      const isWasm = path.endsWith('.wasm');
      const manifest = await loadManifest();
      const spec = isWasm ? manifest?.compiler : manifest?.stdlib;
      const fallbackName = path.split('/').pop() + '.gz';

      const names = isWasm ? spec?.parts ?? [fallbackName] : [spec?.file ?? fallbackName];
      const base = new URL('.', parsed);
      const urls = names.map((name) => new URL(name, base).href);
      const file = isWasm ? 'compiler' : 'stdlib';

      const blob = await readParts(urls, file, spec?.gzBytes || 0);
      const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());

      if (!isGzip(head)) {
        // A host that serves `.gz` with `Content-Encoding: gzip` has already
        // inflated it; do not decompress twice.
        return new Response(blob, {
          headers: { 'content-type': isWasm ? 'application/wasm' : 'application/octet-stream' },
        });
      }

      if (typeof DecompressionStream !== 'function') {
        throw new Error('this browser has no DecompressionStream; cannot unpack the Kotlin compiler');
      }

      return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip')), {
        headers: { 'content-type': isWasm ? 'application/wasm' : 'application/octet-stream' },
      });
    } catch (error) {
      self.postMessage({ type: 'asset-error', message: String(error?.stack || error) });
      throw error;
    }
  };

  importScripts('./kotlin-compiler-image.js');
})();
