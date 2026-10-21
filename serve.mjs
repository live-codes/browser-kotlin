// Zero-dependency static server for the proof of concept.
//
// A server is required because browsers refuse ES-module workers and
// WebAssembly over file:// — but nothing is compiled server-side. The only
// non-obvious job here is sending `Content-Type: application/wasm` for .wasm:
// WebAssembly.instantiateStreaming rejects the response otherwise.
//
//   node serve.mjs [port]        ->  http://localhost:8001/

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname);
const port = Number(process.argv[2] || process.env.PORT || 8001);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const send = (res, status, headers, body) => {
  res.writeHead(status, {
    'cache-control': 'no-cache',
    'access-control-allow-origin': '*',
    ...headers
  });
  res.end(body);
};

createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  let file = resolve(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) {
    return send(res, 403, { 'content-type': 'text/plain' }, '403');
  }

  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    send(res, 200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'content-length': body.length,
    }, body);
  } catch {
    send(res, 404, { 'content-type': 'text/plain' }, '404');
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}/`));
