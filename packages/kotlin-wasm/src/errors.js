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

/** This engine has no console input; the caller should route to a fallback. */
export class KotlinStdinUnsupportedError extends KotlinWasmError {
  constructor() {
    super(
      'Kotlin (Wasm) does not support stdin. Run this program without input, or use a ' +
        'stdin-capable Kotlin engine.'
    );
    this.name = 'KotlinStdinUnsupportedError';
  }
}
