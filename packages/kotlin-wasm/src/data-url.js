// Script and binary payloads as URLs a worker can load.
//
// `blob:` URLs cannot be relied on here. A compile worker is often itself created
// from a `data:` URL, which gives it a null origin, and `URL.createObjectURL`
// inside it yields `blob:null/<uuid>` — a URL with no origin to resolve against.
// `importScripts` on one of those fails with "NetworkError: The script at
// 'blob:null/…' failed to load", which is what a deployed build hit.
//
// A `data:` URL carries its own content, so it has nothing to resolve and no origin
// to belong to. It works from a null-origin worker, a blob worker and a page alike.

/**
 * A `data:` URL for a JavaScript source string.
 *
 * Percent-encoded rather than base64: the payloads here are already text, and this
 * avoids a round trip through `btoa` on a multi-megabyte string. `encodeURIComponent`
 * escapes everything that would end or break the URL.
 */
export function scriptDataUrl(text) {
  return 'data:text/javascript;charset=utf-8,' + encodeURIComponent(text);
}

/**
 * A `data:` URL for binary content, which must be base64: percent-encoding bytes
 * would triple the size and is not what `fetch` expects for `application/wasm`.
 */
export function binaryDataUrl(bytes, type) {
  return `data:${type};base64,` + toBase64(bytes);
}

/** Base64 without blowing the call stack on a multi-megabyte archive. */
export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
