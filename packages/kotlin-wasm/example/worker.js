// Classic worker, the shape LiveCodes uses: importScripts the IIFE build, then
// call the same API through self.kotlinWasm. The compiler and the program run
// in nested workers, so this worker stays responsive.
importScripts('../dist/kotlin-wasm.global.js');

let compilerPromise = null;
const getCompiler = () => {
  compilerPromise ??= self.kotlinWasm.createCompiler({
    baseUrl: new URL('../assets/', self.location.href).href
  });
  return compilerPromise;
};

addEventListener('message', async (event) => {
  const { id, code, input } = event.data;
  try {
    const compiler = await getCompiler();
    const result = await compiler.run(code, input);
    postMessage({ id, result });
  } catch (error) {
    postMessage({ id, error: String(error?.stack || error) });
  }
});

getCompiler().then(
  () => postMessage({ type: 'ready' }),
  (error) => postMessage({ type: 'error', message: String(error?.stack || error) })
);
