import { createApi } from './api.js';
import { createNodeEngine } from './node.js';

const api = createApi({ createEngine: createNodeEngine });

export const createCompiler = api.createCompiler;
export { LANGUAGE_IDS, COMPILER_VERSION } from './language.js';
export {
  KotlinWasmError,
  KotlinUnsupportedError,
  KotlinStdinUnsupportedError
} from './errors.js';
