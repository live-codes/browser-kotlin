import { createApi } from './api.js';
import { createBrowserEngine } from './browser.js';
import { createInWorkerCompiler } from './in-worker.js';

const api = createApi({ createEngine: createBrowserEngine });

export const createCompiler = api.createCompiler;
export { createInWorkerCompiler };
export { LANGUAGE_IDS, COMPILER_VERSION } from './language.js';
export { KotlinWasmError, KotlinUnsupportedError } from './errors.js';
