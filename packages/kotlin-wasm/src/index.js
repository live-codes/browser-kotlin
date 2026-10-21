import { createApi } from './api.js';
import { createBrowserEngine } from './browser.js';

const api = createApi({ createEngine: createBrowserEngine });

export const createCompiler = api.createCompiler;
export { LANGUAGE_IDS, COMPILER_VERSION } from './language.js';
export {
  KotlinWasmError,
  KotlinUnsupportedError,
  KotlinStdinUnsupportedError
} from './errors.js';
