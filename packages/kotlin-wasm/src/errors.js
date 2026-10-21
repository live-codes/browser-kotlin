export class KotlinWasmError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'KotlinWasmError';
  }
}

/** The browser cannot run the toolchain at all. */
export class KotlinUnsupportedError extends KotlinWasmError {
  constructor(message) {
    super(message);
    this.name = 'KotlinUnsupportedError';
  }
}
