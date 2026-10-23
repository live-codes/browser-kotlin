#!/usr/bin/env node
// Build/upgrade helper for the real Kotlin compiler assets.
//
//   node scripts/toolchain.mjs vendor --compiler-dist <dir> [--target wasm|js]
//   node scripts/toolchain.mjs check
//   node scripts/toolchain.mjs plan
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const lockPath = join(root, 'toolchain.lock.json');
const languagePath = join(root, 'src', 'language.js');
const MAX_PART_BYTES = 20_000_000;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const targetOf = (options) => (options.target === 'js' ? 'js' : 'wasm');
const assetsDirOf = (target) => join(root, 'assets', target === 'js' ? 'js' : '');

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      options._.push(arg);
      continue;
    }
    const equals = arg.indexOf('=');
    if (equals !== -1) {
      options[arg.slice(2, equals)] = arg.slice(equals + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return { command, options };
}

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const writeJson = async (file, value) =>
  writeFile(file, `${JSON.stringify(value, null, 2)}\n`);

function receipt(file, bytes) {
  return { file, bytes: bytes.byteLength, sha256: sha256(bytes) };
}

async function resolveInputs(options, lock) {
  const target = targetOf(options);
  const isJs = target === 'js';
  const targetLock = isJs ? lock.javascript : lock.compiler;
  const buildDir = options['build-dir'] ? resolve(options['build-dir']) : null;
  const dist = options['compiler-dist'] ? resolve(options['compiler-dist']) : null;
  if (!buildDir && !dist) {
    throw new Error('pass --compiler-dist <dir> or --build-dir <compiler-host/build>');
  }

  let image;
  let wasm;
  let stdlib;
  let buildInfo = null;

  if (dist) {
    image = await readFile(join(dist, 'kotlin-compiler-worker.js'));
    wasm = await readFile(join(dist, 'kotlin-compiler-worker.js.wasm'));
    stdlib = await readFile(join(dist, isJs ? 'kotlin-stdlib-js.bin' : 'kotlin-stdlib-wasm-js.bin'));
    if (existsSync(join(dist, 'build-info.json'))) {
      buildInfo = await readJson(join(dist, 'build-info.json'));
    }
  } else {
    const base = isJs ? 'kotlin-compiler-js' : 'kotlin-compiler';
    const webImage = join(buildDir, isJs ? 'jsImage' : 'webImage');
    image = Buffer.concat([
      await readFile(join(webImage, `${base}.js`)),
      await readFile(join(buildDir, '..', 'src', 'main', 'js', 'worker-glue.js')),
    ]);
    wasm = await readFile(join(webImage, `${base}.js.wasm`));
    stdlib = await readFile(
      join(buildDir, isJs ? 'stdlib-js/kotlin-stdlib-js.bin' : 'stdlib/kotlin-stdlib-wasm-js.bin')
    );
  }

  const compilerVersion =
    options['compiler-version'] ||
    buildInfo?.compilerVersion ||
    targetLock?.version ||
    lock.compiler?.version;
  if (!compilerVersion) {
    throw new Error('cannot determine the Kotlin version; pass --compiler-version');
  }

  const upstream = buildInfo?.upstream || {};
  const repository =
    options['upstream-repo'] ||
    upstream.repository ||
    targetLock?.host?.repository ||
    lock.compiler?.host?.repository ||
    'https://github.com/alex28sh/wasm-code-editor';
  const commit =
    options['upstream-commit'] ||
    upstream.commit ||
    targetLock?.host?.commit ||
    lock.compiler?.host?.commit;
  if (!commit) throw new Error('cannot determine the upstream commit; pass --upstream-commit');

  const build = {
    repository,
    commit,
    graalvm: buildInfo?.graalvm || options.graalvm || 'unknown',
    binaryen: buildInfo?.binaryen || options.binaryen || 'unknown',
    tasks: buildInfo?.tasks || (isJs
      ? [':compiler-host:jsJvmScenario', ':compiler-host:jsWebImage']
      : [':compiler-host:stdlibArchive', ':compiler-host:webImage']),
    heap: buildInfo?.heap || options.heap || 'unknown',
    built: buildInfo?.built || options.built || new Date().toISOString(),
  };

  return { target, compilerVersion, build, image, wasm, stdlib };
}

async function vendor(options) {
  const target = targetOf(options);
  const isJs = target === 'js';
  const assetsDir = assetsDirOf(target);
  const lock = existsSync(lockPath) ? await readJson(lockPath) : { language: 'kotlin', compiler: {} };

  if (isJs) {
    await mkdir(assetsDir, { recursive: true });
    if (!existsSync(join(assetsDir, 'kotlin-compiler-worker.js'))) {
      await writeFile(
        join(assetsDir, 'kotlin-compiler-worker.js'),
        await readFile(join(root, 'assets', 'kotlin-compiler-worker.js'))
      );
    }
  }

  const wrapper = await readFile(join(assetsDir, 'kotlin-compiler-worker.js'));
  const { compilerVersion, build, image, wasm, stdlib } = await resolveInputs(options, lock);
  const stdlibName = isJs ? 'kotlin-stdlib-js.bin.gz' : 'kotlin-stdlib-wasm-js.bin.gz';

  for (const name of await readdir(assetsDir)) {
    if (
      name.startsWith('kotlin-compiler-worker.js.wasm.gz.') ||
      name === 'kotlin-compiler-image.js' ||
      name === stdlibName
    ) {
      await rm(join(assetsDir, name));
    }
  }

  const gzip = gzipSync(wasm, { level: 9 });
  const partCount = Math.max(1, Math.ceil(gzip.byteLength / MAX_PART_BYTES));
  const partSize = Math.ceil(gzip.byteLength / partCount);
  const parts = [];
  for (let index = 0; index < partCount; index += 1) {
    const bytes = gzip.subarray(index * partSize, (index + 1) * partSize);
    const name = `kotlin-compiler-worker.js.wasm.gz.${index}`;
    await writeFile(join(assetsDir, name), bytes);
    parts.push({ name, bytes });
  }

  const stdlibGzip = gzipSync(stdlib, { level: 9 });
  await writeFile(join(assetsDir, 'kotlin-compiler-image.js'), image);
  await writeFile(join(assetsDir, stdlibName), stdlibGzip);

  const manifest = {
    compiler: {
      parts: parts.map((part) => part.name),
      gzBytes: gzip.byteLength,
      rawBytes: wasm.byteLength,
      rawSha256: sha256(wasm),
    },
    stdlib: {
      file: stdlibName,
      gzBytes: stdlibGzip.byteLength,
      rawBytes: stdlib.byteLength,
      rawSha256: sha256(stdlib),
    },
  };
  await writeJson(join(assetsDir, 'kotlin-assets.json'), manifest);

  const manifestBytes = await readFile(join(assetsDir, 'kotlin-assets.json'));
  const block = {
    version: compilerVersion,
    host: { repository: build.repository, commit: build.commit },
    build,
    assets: {
      compilerImage: {
        gzParts: parts.map((part) => ({
          file: part.name,
          bytes: part.bytes.byteLength,
          sha256: sha256(part.bytes),
        })),
        gzBytes: gzip.byteLength,
        rawBytes: wasm.byteLength,
        rawSha256: sha256(wasm),
      },
      stdlib: {
        file: stdlibName,
        gzBytes: stdlibGzip.byteLength,
        rawBytes: stdlib.byteLength,
        rawSha256: sha256(stdlib),
      },
    },
    generatedHost: receipt('kotlin-compiler-image.js', image),
    wrapper: receipt('kotlin-compiler-worker.js', wrapper),
    manifest: receipt('kotlin-assets.json', manifestBytes),
  };

  const nextLock = { ...lock, language: 'kotlin' };
  if (isJs) {
    nextLock.javascript = block;
  } else {
    nextLock.compiler = {
      version: block.version,
      host: block.host,
      build: block.build,
      assets: block.assets,
    };
    nextLock.generatedHost = block.generatedHost;
    nextLock.wrapper = block.wrapper;
    nextLock.manifest = block.manifest;
  }
  await writeJson(lockPath, nextLock);

  const language = await readFile(languagePath, 'utf8');
  const updated = language.replace(
    /export const COMPILER_VERSION = '.*?';/,
    `export const COMPILER_VERSION = '${compilerVersion}';`
  );
  if (updated === language && !language.includes(`'${compilerVersion}'`)) {
    throw new Error('could not update COMPILER_VERSION in src/language.js');
  }
  await writeFile(languagePath, updated);

  const receipts = spawnSync(process.execPath, [join(root, 'scripts', 'asset-receipts.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (receipts.status !== 0) throw new Error('asset receipts do not match the new assets');

  console.log('');
  console.log(`vendored Kotlin ${compilerVersion} (${target})`);
  console.log(`  image:  ${wasm.byteLength} bytes raw, ${gzip.byteLength} bytes gz in ${parts.length} part(s)`);
  console.log(`  stdlib: ${stdlib.byteLength} bytes raw, ${stdlibGzip.byteLength} bytes gz`);
  console.log(`  build:  ${build.graalvm}; ${build.binaryen}; ${build.built}`);
  console.log('  next:   npm test');
}

function printTarget(name, target, pins) {
  if (!target) return;
  console.log(`${name}: Kotlin ${target.version}`);
  console.log(`  source ${target.host?.repository}@${target.host?.commit}`);
  if (target.build) {
    console.log(
      `  build ${target.build.graalvm}; ${target.build.binaryen}; heap ${target.build.heap}; ${target.build.built}`
    );
  }
  console.log(
    `  image ${target.assets?.compilerImage?.rawBytes} bytes raw, ${target.assets?.compilerImage?.gzBytes} bytes gz`
  );
  console.log(
    `  stdlib ${target.assets?.stdlib?.rawBytes} bytes raw, ${target.assets?.stdlib?.gzBytes} bytes gz`
  );
  if (pins) console.log(`  host ${pins.generatedHost?.file}; wrapper ${pins.wrapper?.file}`);
}

async function check() {
  if (!existsSync(lockPath)) throw new Error('toolchain.lock.json is missing');
  const lock = await readJson(lockPath);
  printTarget('wasm', lock.compiler, lock);
  printTarget('js', lock.javascript, lock.javascript);
  const graalvm = process.env.GRAALVM_HOME;
  if (graalvm) {
    const nativeImage = join(graalvm, 'bin', process.platform === 'win32' ? 'native-image.cmd' : 'native-image');
    const version = spawnSync(nativeImage, ['--version'], { encoding: 'utf8' });
    if (version.status === 0) console.log(version.stdout.split('\n')[0]);
  }
  const wasmAs = spawnSync('wasm-as', ['--version'], { encoding: 'utf8' });
  if (wasmAs.status === 0) console.log(wasmAs.stdout.trim());

  const receipts = spawnSync(process.execPath, [join(root, 'scripts', 'asset-receipts.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  if (receipts.status !== 0) process.exitCode = receipts.status;
}

function plan() {
  console.log(`Build and provenance
  1. bash scripts/fetch-toolchain.sh --accept-license
     # Oracle GraalVM + Binaryen (wasm-as); use GRAALVM_HOME/BINARYEN_HOME if already installed.
  2. HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 bash scripts/build-toolchain.sh
     # wasm target; default HEAP=8g. Output: .toolchain/compilerDist
     TARGET=js HEAP=8g GRADLE_HEAP=1024m GRADLE_WORKERS=2 bash scripts/build-toolchain.sh
     # js target. Output: .toolchain/js-compilerDist
  3. node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
     node scripts/toolchain.mjs vendor --target js --compiler-dist .toolchain/js-compilerDist
     # updates the target's assets, manifest, lock, COMPILER_VERSION, receipts
  4. npm test

Upgrade Kotlin
  KOTLIN_VERSION=2.6.0 HEAP=8g GRADLE_HEAP=1024m bash scripts/build-toolchain.sh
  KOTLIN_VERSION=2.6.0 TARGET=js HEAP=8g GRADLE_HEAP=1024m bash scripts/build-toolchain.sh
  node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
  node scripts/toolchain.mjs vendor --target js --compiler-dist .toolchain/js-compilerDist
  npm test

Windows
  Run the build in WSL (recommended). Native Windows needs Visual Studio 2022
  Build Tools (vswhere/MSVC), Binaryen, and the same GraalVM.`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'vendor') return vendor(options);
  if (command === 'check') return check(options);
  if (command === 'plan') return plan();
  if (command === 'build') {
    throw new Error('run bash scripts/build-toolchain.sh (Linux/WSL); see scripts/toolchain.mjs plan');
  }
  throw new Error('usage: toolchain.mjs <vendor|check|plan>');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
