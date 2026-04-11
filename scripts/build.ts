/**
 * OpenClaude build script — bundles the TypeScript source into a single
 * distributable JS file using Bun's bundler.
 *
 * Handles:
 * - bun:bundle feature() flags for the open build
 * - MACRO.* globals → inlined version/build-time constants
 * - src/ path aliases
 */

import { readFileSync } from 'fs'
import { noTelemetryPlugin } from './no-telemetry-plugin'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const version = pkg.version

// Feature flags for the open build.
// Most Anthropic-internal features stay off; open-build features can be
// selectively enabled here when their full source exists in the mirror.
const featureFlags: Record<string, boolean> = {
  VOICE_MODE: false,
  PROACTIVE: false,
  KAIROS: false,
  BRIDGE_MODE: false,
  DAEMON: false,
  AGENT_TRIGGERS: false,
  MONITOR_TOOL: false,
  ABLATION_BASELINE: false,
  DUMP_SYSTEM_PROMPT: false,
  CACHED_MICROCOMPACT: false,
  COORDINATOR_MODE: false,
  CONTEXT_COLLAPSE: false,
  COMMIT_ATTRIBUTION: false,
  TEAMMEM: false,
  UDS_INBOX: false,
  BG_SESSIONS: false,
  AWAY_SUMMARY: false,
  TRANSCRIPT_CLASSIFIER: false,
  WEB_BROWSER_TOOL: false,
  MESSAGE_ACTIONS: false,
  BUDDY: true,
  CHICAGO_MCP: false,
  COWORKER_TYPE_TELEMETRY: false,
}

const result = await Bun.build({
  entrypoints: ['./src/entrypoints/cli.tsx'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  splitting: false,
  sourcemap: process.env.CI ? 'none' : 'external',
  minify: !!process.env.CI,
  naming: 'cli.mjs',
  define: {
    // MACRO.* build-time constants
    // Keep the internal compatibility version high enough to pass
    // first-party minimum-version guards, but expose the real package
    // version separately in Open Claude branding.
    'MACRO.VERSION': JSON.stringify('99.0.0'),
    'MACRO.DISPLAY_VERSION': JSON.stringify(version),
    'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'MACRO.ISSUES_EXPLAINER':
      JSON.stringify('report the issue at https://github.com/anthropics/claude-code/issues'),
    'MACRO.PACKAGE_URL': JSON.stringify('@dcywzc/ywcoder'),
    'MACRO.NATIVE_PACKAGE_URL': 'undefined',
  },
  plugins: [
    noTelemetryPlugin,
    {
      name: 'bun-bundle-shim',
      setup(build) {
        const internalFeatureStubModules = new Map([
          [
            '../daemon/workerRegistry.js',
            'export async function runDaemonWorker() { throw new Error("Daemon worker is unavailable in the open build."); }',
          ],
          [
            '../daemon/main.js',
            'export async function daemonMain() { throw new Error("Daemon mode is unavailable in the open build."); }',
          ],
          [
            '../cli/bg.js',
            `
export async function psHandler() { throw new Error("Background sessions are unavailable in the open build."); }
export async function logsHandler() { throw new Error("Background sessions are unavailable in the open build."); }
export async function attachHandler() { throw new Error("Background sessions are unavailable in the open build."); }
export async function killHandler() { throw new Error("Background sessions are unavailable in the open build."); }
export async function handleBgFlag() { throw new Error("Background sessions are unavailable in the open build."); }
`,
          ],
          [
            '../cli/handlers/templateJobs.js',
            'export async function templatesMain() { throw new Error("Template jobs are unavailable in the open build."); }',
          ],
          [
            '../environment-runner/main.js',
            'export async function environmentRunnerMain() { throw new Error("Environment runner is unavailable in the open build."); }',
          ],
          [
            '../self-hosted-runner/main.js',
            'export async function selfHostedRunnerMain() { throw new Error("Self-hosted runner is unavailable in the open build."); }',
          ],
        ] as const)

        // Resolve `import { feature } from 'bun:bundle'` to a shim
        build.onResolve({ filter: /^bun:bundle$/ }, () => ({
          path: 'bun:bundle',
          namespace: 'bun-bundle-shim',
        }))
        build.onLoad(
          { filter: /.*/, namespace: 'bun-bundle-shim' },
          () => ({
            contents: `const featureFlags = ${JSON.stringify(featureFlags)};\nexport function feature(name) { return featureFlags[name] ?? false; }`,
            loader: 'js',
          }),
        )

        build.onResolve(
          { filter: /^\.\.\/(daemon\/workerRegistry|daemon\/main|cli\/bg|cli\/handlers\/templateJobs|environment-runner\/main|self-hosted-runner\/main)\.js$/ },
          args => {
            if (!internalFeatureStubModules.has(args.path)) return null
            return {
              path: args.path,
              namespace: 'internal-feature-stub',
            }
          },
        )
        build.onLoad(
          { filter: /.*/, namespace: 'internal-feature-stub' },
          args => ({
            contents:
              internalFeatureStubModules.get(args.path) ??
              'export {}',
            loader: 'js',
          }),
        )

        // Resolve react/compiler-runtime to the standalone package
        build.onResolve({ filter: /^react\/compiler-runtime$/ }, () => ({
          path: 'react/compiler-runtime',
          namespace: 'react-compiler-shim',
        }))
        build.onLoad(
          { filter: /.*/, namespace: 'react-compiler-shim' },
          () => ({
            contents: `export function c(size) { return new Array(size).fill(Symbol.for('react.memo_cache_sentinel')); }`,
            loader: 'js',
          }),
        )

        // NOTE: @opentelemetry/* kept as external deps (too many named exports to stub)

        // ─── Cloud provider SDK stubs ──────────────────────────────────────────
        //
        // 2025-04-11: Stubbed for intranet/offline deployments.
        //
        // Background: these SDKs are used to call Claude via AWS Bedrock,
        // Google Vertex AI, or Azure. In our intranet environment all requests
        // go through a self-hosted LLM gateway, so these code paths are never
        // executed. Stubbing them removes ~35 MB from node_modules and keeps
        // the offline tgz compact.
        //
        // All imports below are *dynamic* (`await import(...)`) so the stub is
        // only reached if a user explicitly configures one of these providers.
        // If that happens they will get a clear "provider not supported" error
        // rather than a cryptic module-not-found crash.
        //
        // HOW TO RESTORE:
        //   1. Delete the four onResolve/onLoad blocks below.
        //   2. Keep the packages in the `external` array at the bottom of this
        //      file (they are still listed there — just no longer stub-loaded).
        //   3. Re-run CI — the full SDK will be bundled from node_modules.
        //
        // Files affected:
        //   src/utils/model/bedrock.ts      — AWS Bedrock client
        //   src/utils/aws.ts                — STS identity + credential cache
        //   src/utils/proxy.ts              — AWS credential-provider-node
        //   src/utils/geminiAuth.ts         — Google Vertex AI auth
        //   src/utils/auth.ts               — Google auth fallback

        // @aws-sdk/client-bedrock
        build.onResolve({ filter: /^@aws-sdk\/client-bedrock$/ }, args => ({
          path: args.path, namespace: 'cloud-sdk-stub',
        }))
        // @aws-sdk/client-bedrock-runtime
        build.onResolve({ filter: /^@aws-sdk\/client-bedrock-runtime$/ }, args => ({
          path: args.path, namespace: 'cloud-sdk-stub',
        }))
        // @aws-sdk/client-sts
        build.onResolve({ filter: /^@aws-sdk\/client-sts$/ }, args => ({
          path: args.path, namespace: 'cloud-sdk-stub',
        }))
        // @aws-sdk/credential-providers
        build.onResolve({ filter: /^@aws-sdk\/credential-providers$/ }, args => ({
          path: args.path, namespace: 'cloud-sdk-stub',
        }))
        // @aws-sdk/credential-provider-node
        build.onResolve({ filter: /^@aws-sdk\/credential-provider-node$/ }, args => ({
          path: args.path, namespace: 'cloud-sdk-stub',
        }))
        // google-auth-library
        build.onResolve({ filter: /^google-auth-library$/ }, args => ({
          path: args.path, namespace: 'cloud-sdk-stub',
        }))

        build.onLoad({ filter: /.*/, namespace: 'cloud-sdk-stub' }, (args) => {
          const stubs: Record<string, string> = {
            '@aws-sdk/client-bedrock': `
const err = () => { throw new Error('[YwCoder] AWS Bedrock provider is not supported in this intranet build. To enable it, remove the cloud-sdk stubs from scripts/build.ts and rebuild.'); };
export class BedrockClient { constructor() { err(); } send() { err(); } }
export class ListInferenceProfilesCommand { constructor() { err(); } }
export class GetInferenceProfileCommand { constructor() { err(); } }
`,
            '@aws-sdk/client-bedrock-runtime': `
const err = () => { throw new Error('[YwCoder] AWS Bedrock provider is not supported in this intranet build. To enable it, remove the cloud-sdk stubs from scripts/build.ts and rebuild.'); };
export class BedrockRuntimeClient { constructor() { err(); } send() { err(); } }
export class CountTokensCommand { constructor() { err(); } }
export class InvokeModelCommand { constructor() { err(); } }
export class InvokeModelWithResponseStreamCommand { constructor() { err(); } }
export const ResponseStream = {};
// Exception classes used by @anthropic-ai/bedrock-sdk/AWS_restJson1.mjs
export class InternalServerException extends Error { constructor(opts) { super(opts?.message); this.name = 'InternalServerException'; } }
export class ModelStreamErrorException extends Error { constructor(opts) { super(opts?.message); this.name = 'ModelStreamErrorException'; } }
export class ThrottlingException extends Error { constructor(opts) { super(opts?.message); this.name = 'ThrottlingException'; } }
export class ValidationException extends Error { constructor(opts) { super(opts?.message); this.name = 'ValidationException'; } }
`,
            '@aws-sdk/client-sts': `
const err = () => { throw new Error('[YwCoder] AWS STS is not supported in this intranet build. To enable it, remove the cloud-sdk stubs from scripts/build.ts and rebuild.'); };
export class STSClient { constructor() { err(); } send() { err(); } }
export class GetCallerIdentityCommand { constructor() { err(); } }
`,
            '@aws-sdk/credential-providers': `
const err = () => { throw new Error('[YwCoder] AWS credential providers are not supported in this intranet build. To enable them, remove the cloud-sdk stubs from scripts/build.ts and rebuild.'); };
export const fromIni = () => err;
export const fromEnv = () => err;
export const fromProcess = () => err;
`,
            '@aws-sdk/credential-provider-node': `
const err = () => { throw new Error('[YwCoder] AWS credential-provider-node is not supported in this intranet build. To enable it, remove the cloud-sdk stubs from scripts/build.ts and rebuild.'); };
export const defaultProvider = () => err;
`,
            'google-auth-library': `
const err = () => { throw new Error('[YwCoder] Google Vertex AI auth is not supported in this intranet build. To enable it, remove the cloud-sdk stubs from scripts/build.ts and rebuild.'); };
export class GoogleAuth { constructor() { err(); } getClient() { err(); } }
export class JWT { constructor() { err(); } }
export class OAuth2Client { constructor() { err(); } }
`,
          }
          return {
            contents: stubs[args.path] ?? `export default {}`,
            loader: 'js',
          }
        })

        // ─── End cloud provider SDK stubs ─────────────────────────────────────

        // Resolve native addon and missing snapshot imports to stubs
        for (const mod of [
          'audio-capture-napi',
          'audio-capture.node',
          'image-processor-napi',
          'modifiers-napi',
          'url-handler-napi',
          'color-diff-napi',
          '@anthropic-ai/mcpb',
          '@ant/claude-for-chrome-mcp',
          '@anthropic-ai/sandbox-runtime',
          'asciichart',
          'plist',
          'cacache',
          'fuse',
          'code-excerpt',
          'stack-utils',
        ]) {
          build.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({
            path: mod,
            namespace: 'native-stub',
          }))
        }
        build.onLoad(
          { filter: /.*/, namespace: 'native-stub' },
          () => ({
            // Comprehensive stub that handles any named export via Proxy
            contents: `
const noop = () => null;
const noopClass = class {};
const handler = {
  get(_, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return new Proxy({}, handler);
    if (prop === 'ExportResultCode') return { SUCCESS: 0, FAILED: 1 };
    if (prop === 'resourceFromAttributes') return () => ({});
    if (prop === 'SandboxRuntimeConfigSchema') return { parse: () => ({}) };
    return noop;
  }
};
const stub = new Proxy(noop, handler);
export default stub;
export const __stub = true;
// Named exports for all known imports
export const SandboxViolationStore = null;
export const SandboxManager = new Proxy({}, { get: () => noop });
export const SandboxRuntimeConfigSchema = { parse: () => ({}) };
export const BROWSER_TOOLS = [];
export const getMcpConfigForManifest = noop;
export const ColorDiff = null;
export const ColorFile = null;
export const getSyntaxTheme = noop;
export const plot = noop;
export const createClaudeForChromeMcpServer = noop;
// OpenTelemetry exports
export const ExportResultCode = { SUCCESS: 0, FAILED: 1 };
export const resourceFromAttributes = noop;
export const Resource = noopClass;
export const SimpleSpanProcessor = noopClass;
export const BatchSpanProcessor = noopClass;
export const NodeTracerProvider = noopClass;
export const BasicTracerProvider = noopClass;
export const OTLPTraceExporter = noopClass;
export const OTLPLogExporter = noopClass;
export const OTLPMetricExporter = noopClass;
export const PrometheusExporter = noopClass;
export const LoggerProvider = noopClass;
export const SimpleLogRecordProcessor = noopClass;
export const BatchLogRecordProcessor = noopClass;
export const MeterProvider = noopClass;
export const PeriodicExportingMetricReader = noopClass;
export const trace = { getTracer: () => ({ startSpan: () => ({ end: noop, setAttribute: noop, setStatus: noop, recordException: noop }) }) };
export const context = { active: noop, with: (_, fn) => fn() };
export const SpanStatusCode = { OK: 0, ERROR: 1, UNSET: 2 };
export const ATTR_SERVICE_NAME = 'service.name';
export const ATTR_SERVICE_VERSION = 'service.version';
export const SEMRESATTRS_SERVICE_NAME = 'service.name';
export const SEMRESATTRS_SERVICE_VERSION = 'service.version';
export const AggregationTemporality = { CUMULATIVE: 0, DELTA: 1 };
export const DataPointType = { HISTOGRAM: 0, SUM: 1, GAUGE: 2 };
export const InstrumentType = { COUNTER: 0, HISTOGRAM: 1, UP_DOWN_COUNTER: 2 };
export const PushMetricExporter = noopClass;
export const SeverityNumber = {};
`,
            loader: 'js',
          }),
        )

        // Resolve .md and .txt file imports to empty string stubs
        build.onResolve({ filter: /\.(md|txt)$/ }, (args) => ({
          path: args.path,
          namespace: 'text-stub',
        }))
        build.onLoad(
          { filter: /.*/, namespace: 'text-stub' },
          () => ({
            contents: `export default '';`,
            loader: 'js',
          }),
        )

        // Pre-scan: find all missing modules that need stubbing
        // (Bun's onResolve corrupts module graph even when returning null,
        //  so we use exact-match resolvers instead of catch-all patterns)
        const fs = require('fs')
        const pathMod = require('path')
        const srcDir = pathMod.resolve(__dirname, '..', 'src')
        const missingModules = new Set<string>()
        const missingModuleExports = new Map<string, Set<string>>()

        // Known missing external packages
        for (const pkg of [
          '@ant/computer-use-mcp',
          '@ant/computer-use-mcp/sentinelApps',
          '@ant/computer-use-mcp/types',
          '@ant/computer-use-swift',
          '@ant/computer-use-input',
        ]) {
          missingModules.add(pkg)
        }

        // Scan source to find imports that can't resolve
        function scanForMissingImports() {
          function walk(dir: string) {
            for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
              const full = pathMod.join(dir, ent.name)
              if (ent.isDirectory()) { walk(full); continue }
              if (!/\.(ts|tsx)$/.test(ent.name)) continue
              const code: string = fs.readFileSync(full, 'utf-8')
              // Collect all imports
              for (const m of code.matchAll(/import\s+(?:\{([^}]*)\}|(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from\s+['"](.*?)['"]/g)) {
                const specifier = m[4]
                const namedPart = m[1] || m[3] || ''
                const names = namedPart.split(',')
                  .map((s: string) => s.trim().replace(/^type\s+/, ''))
                  .filter((s: string) => s && !s.startsWith('type '))

                // Check src/tasks/ non-relative imports
                if (specifier.startsWith('src/tasks/')) {
                  const resolved = pathMod.resolve(__dirname, '..', specifier)
                  const candidates = [
                    resolved,
                    `${resolved}.ts`, `${resolved}.tsx`,
                    resolved.replace(/\.js$/, '.ts'), resolved.replace(/\.js$/, '.tsx'),
                    pathMod.join(resolved, 'index.ts'), pathMod.join(resolved, 'index.tsx'),
                  ]
                  if (!candidates.some((c: string) => fs.existsSync(c))) {
                    missingModules.add(specifier)
                  }
                }
                // Check relative .js imports
                else if (specifier.endsWith('.js') && (specifier.startsWith('./') || specifier.startsWith('../'))) {
                  const dir2 = pathMod.dirname(full)
                  const resolved = pathMod.resolve(dir2, specifier)
                  const tsVariant = resolved.replace(/\.js$/, '.ts')
                  const tsxVariant = resolved.replace(/\.js$/, '.tsx')
                  if (!fs.existsSync(resolved) && !fs.existsSync(tsVariant) && !fs.existsSync(tsxVariant)) {
                    missingModules.add(specifier)
                  }
                }

                // Track named exports for missing modules
                if (names.length > 0) {
                  if (!missingModuleExports.has(specifier)) missingModuleExports.set(specifier, new Set())
                  for (const n of names) missingModuleExports.get(specifier)!.add(n)
                }
              }
            }
          }
          walk(srcDir)
        }
        scanForMissingImports()

        // Register exact-match resolvers for each missing module
        for (const mod of missingModules) {
          const escaped = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({
            path: mod,
            namespace: 'missing-module-stub',
          }))
        }

        build.onLoad(
          { filter: /.*/, namespace: 'missing-module-stub' },
          (args) => {
            const names = missingModuleExports.get(args.path) ?? new Set()
            const exports = [...names].map(n => `export const ${n} = noop;`).join('\n')
            return {
              contents: `
const noop = () => null;
export default noop;
${exports}
`,
              loader: 'js',
            }
          },
        )
      },
    },
  ],
  external: [
    // OpenTelemetry — too many named exports to stub, kept external
    '@opentelemetry/api',
    '@opentelemetry/api-logs',
    '@opentelemetry/core',
    '@opentelemetry/exporter-trace-otlp-grpc',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-trace-otlp-proto',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/exporter-logs-otlp-proto',
    '@opentelemetry/exporter-logs-otlp-grpc',
    '@opentelemetry/exporter-metrics-otlp-proto',
    '@opentelemetry/exporter-metrics-otlp-grpc',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-prometheus',
    '@opentelemetry/resources',
    '@opentelemetry/sdk-trace-base',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/semantic-conventions',
    // Native image processing
    'sharp',
    // Cloud provider SDKs — stubbed for intranet builds (see build.ts cloud-sdk-stub section)
    // To restore: remove the stub blocks above and uncomment these lines, then rebuild.
    // '@aws-sdk/client-bedrock',
    // '@aws-sdk/client-bedrock-runtime',
    // '@aws-sdk/client-sts',
    // '@aws-sdk/credential-providers',
    // '@azure/identity',        // not used in src/ — safe to leave commented out
    // 'google-auth-library',
  ],
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`✓ Built openclaude v${version} → dist/cli.mjs`)
