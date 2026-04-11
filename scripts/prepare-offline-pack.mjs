#!/usr/bin/env node
/**
 * prepare-offline-pack.mjs
 *
 * Prepares the project for an offline npm pack by:
 *   1. Removing the build-time node_modules (huge, no longer needed)
 *   2. Installing only the runtime externals cli.mjs actually imports
 *   3. Rewriting package.json so `dependencies` lists just those externals
 *      and `bundledDependencies` covers every package in the minimal tree
 *
 * Why: the full node_modules is ~276MB. After Bun bundles the code, only a
 * handful of packages are still `external` and must be present at runtime.
 * Shipping just those shrinks the offline tgz from 300MB to ~15MB while
 * keeping the package self-contained for air-gapped installs.
 *
 * Runs cross-platform (mac/linux/windows) via plain Node + npm.
 */

import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

// Runtime externals that cli.mjs actually imports.
// Derived by grepping `from "<pkg>"` in dist/cli.mjs:
//   - sharp is loaded via `await import("sharp")` (dynamic)
//   - @aws-sdk/client-bedrock-runtime is a static import
//   - 7 @opentelemetry packages are static imports
// Every other "external" listed in scripts/build.ts is unreferenced at
// runtime (the no-telemetry-plugin stubs them out in src/).
const RUNTIME_DEPENDENCIES = {
  sharp: '^0.34.5',
  '@aws-sdk/client-bedrock-runtime': '*',
  '@opentelemetry/api': '1.9.1',
  '@opentelemetry/api-logs': '0.214.0',
  '@opentelemetry/resources': '2.6.1',
  '@opentelemetry/sdk-logs': '0.214.0',
  '@opentelemetry/sdk-metrics': '2.6.1',
  '@opentelemetry/sdk-trace-base': '2.6.1',
  '@opentelemetry/semantic-conventions': '1.40.0',
}

const PROJECT_ROOT = process.cwd()
const PACK_TEMP_DIR = join(PROJECT_ROOT, '.pack-deps-temp')
const NODE_MODULES = join(PROJECT_ROOT, 'node_modules')
const PACKAGE_JSON = join(PROJECT_ROOT, 'package.json')

function log(msg) {
  console.log(`[prepare-offline-pack] ${msg}`)
}

function rmrf(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true })
  }
}

// Step 1: remove the build-time node_modules
if (existsSync(NODE_MODULES)) {
  log('Removing build-time node_modules...')
  rmrf(NODE_MODULES)
}

// Step 2: install only the runtime externals in a temp directory
log('Installing runtime externals into temp directory...')
rmrf(PACK_TEMP_DIR)
mkdirSync(PACK_TEMP_DIR, { recursive: true })

const tempPackageJson = {
  name: 'pack-deps-temp',
  version: '1.0.0',
  private: true,
  dependencies: RUNTIME_DEPENDENCIES,
}
writeFileSync(
  join(PACK_TEMP_DIR, 'package.json'),
  JSON.stringify(tempPackageJson, null, 2),
)

// Use --omit=dev so npm only installs production deps. npm will auto-select
// the correct @img/sharp-* binary for the current platform via sharp's
// optionalDependencies (e.g. @img/sharp-win32-x64 on a Windows runner).
execSync('npm install --omit=dev --no-package-lock', {
  cwd: PACK_TEMP_DIR,
  stdio: 'inherit',
})

// Step 3: move the minimal node_modules into the project root
log('Moving minimal node_modules into project root...')
renameSync(join(PACK_TEMP_DIR, 'node_modules'), NODE_MODULES)
rmrf(PACK_TEMP_DIR)

// Step 4: rewrite package.json to match the minimal node_modules
// - `dependencies` is narrowed to the runtime externals only, so a consumer
//   `npm install -g the.tgz` won't try to re-resolve the full build-time tree.
// - `bundledDependencies` lists every top-level package under the minimal
//   node_modules so `npm pack` actually includes them in the tarball. (Without
//   bundledDependencies, npm ignores node_modules even if it's listed in
//   `files`.)
log('Scanning node_modules to build bundledDependencies list...')
const bundled = []
for (const entry of readdirSync(NODE_MODULES, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue
  if (entry.name.startsWith('@')) {
    const scopeDir = join(NODE_MODULES, entry.name)
    for (const sub of readdirSync(scopeDir, { withFileTypes: true })) {
      if (sub.isDirectory()) bundled.push(`${entry.name}/${sub.name}`)
    }
  } else {
    bundled.push(entry.name)
  }
}

const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'))
pkg.dependencies = { ...RUNTIME_DEPENDENCIES }
pkg.bundledDependencies = bundled
writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2))

log(`Runtime dependencies: ${Object.keys(pkg.dependencies).length}`)
log(`Bundled packages: ${bundled.length}`)
log('Ready for: npm pack --ignore-scripts')
