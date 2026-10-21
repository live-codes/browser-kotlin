// Classic-worker wrapper around the GraalVM Web Image compiler.
//
// The generated loader fetches its module as `self.location.href + ".wasm"`
// (i.e. `kotlin-compiler-worker.js.wasm`) and the stdlib as
// `./kotlin-stdlib-wasm-js.bin` relative to the worker. Both are shipped
// gzipped. This wrapper is served under the name the loader expects, patches
// `fetch` before importing the generated script, and pipes the `.gz` responses
// through DecompressionStream. The generated image is untouched.
(() => {
  const realFetch = self.fetch.bind(self);
  const COMPRESSED = /\.(wasm|bin)$/;

  self.fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

    const path = new URL(url, self.location.href).pathname;
    if (!COMPRESSED.test(path)) return realFetch(input, init);

    const gzUrl = url + '.gz';
    const response = await realFetch(gzUrl, init);
    if (!response.ok) {
      throw new Error(`cannot load ${gzUrl}: ${response.status} ${response.statusText}`);
    }

    // If a host serves the .gz with `Content-Encoding: gzip`, the browser has
    // already inflated it; do not decompress twice.
    const encoding = (response.headers.get('content-encoding') || '').toLowerCase();
    if (encoding.includes('gzip')) return response;

    if (typeof DecompressionStream !== 'function') {
      throw new Error('this browser has no DecompressionStream; cannot unpack ' + gzUrl);
    }

    return new Response(response.body.pipeThrough(new DecompressionStream('gzip')), {
      headers: {
        'content-type': path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream',
      },
    });
  };

  importScripts('./kotlin-compiler-image.js');
})();
