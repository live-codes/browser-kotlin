#!/usr/bin/env node
// Build/upgrade helper for the real Kotlin compiler assets.
//
//   node scripts/toolchain.mjs vendor --compiler-dist <dir>
//   node scripts/toolchain.mjs check
//   node scripts/toolchain.mjs plan
//
// `vendor` takes the output of scripts/build-toolchain.sh (or an upstream
// compilerDist), compresses/splits it, and updates the manifest, lock, receipts
// and COMPILER_VERSION. `check` validates the shipped assets against the lock.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const assetsDir = join(root, 'assets');
const lockPath = join(root, 'toolchain.lock.json');
const languagePath = join(root, 'src', 'language.js');
const MAX_PART_BYTES = 20_000_000;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

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
    stdlib = await readFile(join(dist, 'kotlin-stdlib-wasm-js.bin'));
    if (existsSync(join(dist, 'build-info.json'))) {
      buildInfo = await readJson(join(dist, 'build-info.json'));
    }
  } else {
    const webImage = join(buildDir, 'webImage');
    image = Buffer.concat([
      await readFile(join(webImage, 'kotlin-compiler.js')),
      await readFile(join(buildDir, '..', 'src', 'main', 'js', 'worker-glue.js')),
    ]);
    wasm = await readFile(join(webImage, 'kotlin-compiler.js.wasm'));
    stdlib = await readFile(join(buildDir, 'stdlib', 'kotlin-stdlib-wasm-js.bin'));
  }

  const compilerVersion =
    options['compiler-version'] || buildInfo?.compilerVersion || lock.compiler?.version;
  if (!compilerVersion) {
    throw new Error('cannot determine the Kotlin version; pass --compiler-version');
  }

  const upstream = buildInfo?.upstream || {};
  const repository =
    options['upstream-repo'] ||
    upstream.repository ||
    lock.compiler?.host?.repository ||
    'https://github.com/alex28sh/wasm-code-editor';
  const commit =
    options['upstream-commit'] || upstream.commit || lock.compiler?.host?.commit;
  if (!commit) throw new Error('cannot determine the upstream commit; pass --upstream-commit');

  const build = {
    repository,
    commit,
    graalvm: buildInfo?.graalvm || options.graalvm || 'unknown',
    binaryen: buildInfo?.binaryen || options.binaryen || 'unknown',
    tasks: buildInfo?.tasks || [':compiler-host:stdlibArchive', ':compiler-host:webImage'],
    heap: buildInfo?.heap || options.heap || 'unknown',
    built: buildInfo?.built || options.built || new Date().toISOString(),
  };

  return { compilerVersion, build, image, wasm, stdlib };
}

async function vendor(options) {
  const lock = existsSync(lockPath) ? await readJson(lockPath) : { language: 'kotlin', compiler: {} };
  const wrapper = await readFile(join(assetsDir, 'kotlin-compiler-worker.js'));
  const { compilerVersion, build, image, wasm, stdlib } = await resolveInputs(options, lock);

  for (const name of await readdir(assetsDir)) {
    if (
      name.startsWith('kotlin-compiler-worker.js.wasm.gz.') ||
      name === 'kotlin-compiler-image.js' ||
      name === 'kotlin-stdlib-wasm-js.bin.gz'
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
  const stdlibName = 'kotlin-stdlib-wasm-js.bin.gz';

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
  const nextLock = {
    language: 'kotlin',
    compiler: {
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
    },
    generatedHost: receipt('kotlin-compiler-image.js', image),
    wrapper: receipt('kotlin-compiler-worker.js', wrapper),
    manifest: receipt('kotlin-assets.json', manifestBytes),
  };
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
  console.log(`vendored Kotlin ${compilerVersion}`);
  console.log(`  image:  ${wasm.byteLength} bytes raw, ${gzip.byteLength} bytes gz in ${parts.length} part(s)`);
  console.log(`  stdlib: ${stdlib.byteLength} bytes raw, ${stdlibGzip.byteLength} bytes gz`);
  console.log(`  build:  ${build.graalvm}; ${build.binaryen}; ${build.built}`);
  console.log('  next:   npm test');
}

async function check() {
  if (!existsSync(lockPath)) throw new Error('toolchain.lock.json is missing');
  const lock = await readJson(lockPath);
  const compiler = lock.compiler || {};
  console.log(`Kotlin ${compiler.version}`);
  console.log(`source ${compiler.host?.repository}@${compiler.host?.commit}`);
  if (compiler.build) {
    console.log(
      `build ${compiler.build.graalvm}; ${compiler.build.binaryen}; heap ${compiler.build.heap}; ${compiler.build.built}`
    );
  } else if (compiler.prebuilt) {
    console.log(`prebuilt ${compiler.prebuilt.repository}@${compiler.prebuilt.commit}`);
  }
  console.log(
    `image ${compiler.assets?.compilerImage?.rawBytes} bytes raw, ${compiler.assets?.compilerImage?.gzBytes} bytes gz`
  );
  console.log(
    `stdlib ${compiler.assets?.stdlib?.rawBytes} bytes raw, ${compiler.assets?.stdlib?.gzBytes} bytes gz`
  );
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
     # default HEAP=8g; use 24g+ on a large machine. Output: .toolchain/compilerDist
  3. node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
     # updates assets/, kotlin-assets.json, toolchain.lock.json, COMPILER_VERSION, receipts
  4. npm test

Upgrade Kotlin
  KOTLIN_VERSION=2.6.0 HEAP=8g GRADLE_HEAP=1024m bash scripts/build-toolchain.sh
  node scripts/toolchain.mjs vendor --compiler-dist .toolchain/compilerDist
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
