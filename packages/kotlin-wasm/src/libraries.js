/**
 * Optional Kotlin/JS libraries, downloaded on demand.
 *
 * A program that imports `kotlinx.serialization` or `kotlinx.browser` needs the
 * library's klib, which the compiler image does not carry. Fetching every
 * library up front would cost ~5 MB for a program that uses none, so instead a
 * failed compile is inspected: if it failed on a package one of our libraries
 * provides, that library and its dependencies are fetched and the compile is
 * retried. The user only ever sees the final attempt's diagnostics.
 *
 * This lives outside the in-worker loader because every engine needs it: the
 * standalone browser engine drives the same `addLibraries`/`compile` host
 * operations through its worker.
 */

/**
 * Picks and ranks the libraries a failed compile was missing.
 *
 * The compiler reports only the segment that failed, and which one that is
 * depends on how much else resolved. `import kotlinx.browser.document` reports
 * `kotlinx`, while `import kotlinx.serialization.Serializable` reports
 * `serialization` — the same library reached from a different depth. So a root
 * matches when the report is a prefix of it (`kotlinx` → `kotlinx.browser`), a
 * suffix of it (`serialization` → `kotlinx.serialization`), or equal to it.
 *
 * Several libraries can match one report, so they are ranked by segment count:
 * the shallowest root is the likelier target, and its closure covers the rest.
 */
export function missingLibraries(diagnostics, libraries, loaded) {
  const text = (diagnostics || [])
    .filter((diagnostic) => diagnostic.severity === 'ERROR')
    .map((diagnostic) => diagnostic.message)
    .join('\n');
  // The compiler capitalises the message: "Unresolved reference 'kotlinx'."
  const reported = [...text.matchAll(/unresolved reference '([\w.]+)'/gi)].map((m) => m[1]);
  if (!reported.length) return [];

  const candidates = [];
  for (const reference of reported) {
    for (const [name, entry] of Object.entries(libraries)) {
      if (loaded.has(name)) continue;
      const root = entry.importRoots.find(
        (importRoot) =>
          importRoot === reference ||
          importRoot.startsWith(reference + '.') ||
          importRoot.endsWith('.' + reference),
      );
      if (root) candidates.push({ name, segments: root.split('.').length });
    }
  }
  candidates.sort((a, b) => a.segments - b.segments);
  return [...new Set(candidates.map((candidate) => candidate.name))];
}

/**
 * The libraries a program's `import` lines ask for, most specific first.
 *
 * This is the reliable signal: a diagnostic only names the segment that failed
 * (`kotlinx`), which is a prefix of every `kotlinx.*` library and cannot pick one.
 * An import names the package exactly, and the longest matching root wins, so
 * `kotlinx.serialization.json.Json` selects the json library rather than core.
 */
export function librariesFromImports(source, libraries) {
  const matches = new Map();
  for (const [, path] of String(source).matchAll(/^\s*import\s+([\w.]+)/gm)) {
    for (const [name, entry] of Object.entries(libraries)) {
      for (const root of entry.importRoots || []) {
        if (path === root || path.startsWith(root + '.')) {
          // Keep the longest matching root per library: json beats core.
          matches.set(name, Math.max(matches.get(name) ?? 0, root.length));
        }
      }
    }
  }
  return [...matches.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/**
 * Fetches and installs one library, dependencies first.
 *
 * `install(name, archive)` hands the inflated bytes to the compiler host; it
 * differs per engine, so it is a parameter. Each library must be installed under
 * its own name — the host keeps one root per name, and reusing one would make
 * each library overwrite the previous.
 */
export async function loadLibrary(name, { libraries, loaded, fetchArchive, install }) {
  if (loaded.has(name)) return;
  const entry = libraries[name];
  if (!entry) throw new Error(`Unknown Kotlin library '${name}'.`);
  for (const dependency of entry.dependsOn) {
    await loadLibrary(dependency, { libraries, loaded, fetchArchive, install });
  }
  await install(name, await fetchArchive(entry));
  loaded.add(name);
}

/**
 * Runs `compile`, fetching libraries the program needs and retrying.
 *
 * Imports are read first, because they are exact; a program that imports nothing
 * downloads nothing and compiles once. Diagnostics then cover what an import
 * cannot express (a fully-qualified reference with no import), one candidate per
 * attempt, because a single truncated report can name several libraries and
 * loading them all would download megabytes for one.
 */
export async function compileWithLibraries(
  compile,
  { libraries, loaded, fetchArchive, install, source, attempts = 6 },
) {
  const options = { libraries, loaded, fetchArchive, install };
  for (const name of librariesFromImports(source ?? '', libraries)) {
    await loadLibrary(name, options);
  }

  let answer = await compile();
  for (let attempt = 0; !answer.ok && attempt < attempts; attempt += 1) {
    const [name] = missingLibraries(answer.diagnostics, libraries, loaded);
    if (!name) break;
    await loadLibrary(name, options);
    answer = await compile();
  }
  return answer;
}
