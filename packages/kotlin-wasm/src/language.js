// Kotlin is one language and one compiler here: the real K2 compiler built for
// the Wasm target. There is no standard to choose and no dialect.
const LANGUAGES = {
  kotlin: {
    fileName: 'Main.kt'
  }
};

const ALIASES = new Map([
  ['kotlin', 'kotlin'],
  ['kt', 'kotlin'],
  ['kotlin-wasm', 'kotlin']
]);

export const LANGUAGE_IDS = Object.freeze(Object.keys(LANGUAGES));

export const COMPILER_VERSION = '2.5.0-dev-9169';

export function resolveLanguage(value = 'kotlin') {
  const id = ALIASES.get(String(value ?? '').trim().toLowerCase());
  if (!id) {
    throw new Error(
      `Unknown language ${JSON.stringify(value)}. Expected one of: ${LANGUAGE_IDS.join(', ')}.`
    );
  }
  return Object.freeze({ id, ...LANGUAGES[id] });
}
