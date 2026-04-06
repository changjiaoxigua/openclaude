# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

OpenClaude is a fork of Claude Code that adds an OpenAI-compatible provider shim, enabling it to run against GPT-4o, DeepSeek, Gemini, Ollama, Codex, Atomic Chat (Apple Silicon), and any OpenAI chat completions-compatible API. The rest of Claude Code's tool system is unchanged — the shim is transparent to the main codebase.

## Build & Development Commands

**Requires Bun** (not npm/node for building). Install from [bun.sh](https://bun.sh).

```bash
bun run build          # Bundle TypeScript → dist/cli.mjs (uses scripts/build.ts)
bun run smoke          # Build + run --version (quick sanity check)
bun run typecheck      # TypeScript type check only (no emit)
bun run dev            # Build then launch with node
```

**Running with a specific provider:**
```bash
bun run dev:openai     # Launch with OpenAI profile
bun run dev:ollama     # Launch with Ollama profile
bun run dev:gemini     # Launch with Gemini profile
bun run dev:codex      # Launch with Codex profile
bun run dev:atomic-chat  # Launch with Atomic Chat (Apple Silicon)
bun run dev:profile    # Launch using auto-detected profile
```

**Provider profile management:**
```bash
bun run profile:init   # Bootstrap a provider profile interactively
bun run profile:auto   # Auto-detect best available provider and apply
bun run profile:recommend  # Show recommendation without applying
```

**Running tests:**
```bash
bun run test:provider  # Test OpenAI shim + context utilities
bun run test:provider-recommendation  # Test provider selection logic
bun test src/services/api/openaiShim.test.ts  # Single test file
```

**System diagnostics:**
```bash
bun run doctor:runtime  # Check environment, dependencies, provider connectivity
bun run doctor:runtime:json  # Same, JSON output
```

## Architecture

### Provider Routing

Provider selection happens via environment variables, resolved in `src/utils/model/providers.ts:getAPIProvider()`:

| Env var | Provider |
|---|---|
| `CLAUDE_CODE_USE_OPENAI=1` | `openai` (or `codex` if model is codexplan/codexspark) |
| `CLAUDE_CODE_USE_GEMINI=1` | `gemini` |
| `CLAUDE_CODE_USE_GITHUB=1` | `github` (GitHub Models) |
| `CLAUDE_CODE_USE_BEDROCK=1` | `bedrock` |
| `CLAUDE_CODE_USE_VERTEX=1` | `vertex` |
| `CLAUDE_CODE_USE_FOUNDRY=1` | `foundry` |
| _(none)_ | `firstParty` (Anthropic API) |

### The OpenAI Shim (`src/services/api/openaiShim.ts`)

This is the core addition. It duck-types the Anthropic SDK interface and translates:
- Anthropic message blocks → OpenAI chat messages
- Anthropic `tool_use`/`tool_result` → OpenAI function calls
- OpenAI SSE streaming → Anthropic stream events
- Anthropic system prompt arrays → OpenAI system string

`src/services/api/client.ts` routes to the shim when a non-firstParty provider is active.

Additional shim files: `src/services/api/codexShim.ts` (Codex backend), `src/services/api/providerConfig.ts` (URL/credential resolution).

### Provider Profiles

Profiles are stored as `.openclaude-profile.json` in the working directory. The profile file captures which provider env vars to inject at launch. Logic lives in `src/utils/providerProfile.ts`. The profile launcher (`scripts/provider-launch.ts`) reads this file and spawns the CLI with the correct environment.

### Build System

`scripts/build.ts` uses Bun's bundler to produce a single `dist/cli.mjs`. Key behaviors:
- All `bun:bundle` `feature()` flags are stubbed to `false` (disables Anthropic-internal features like voice, daemon, bridge mode)
- Several native addons and internal modules are stubbed out
- `MACRO.*` globals are inlined at build time (version, build timestamp)
- OpenTelemetry packages are kept as external deps (too many named exports to stub)

### Modified Files from Upstream

Only 6 files were changed from the original Claude Code source:
- `src/services/api/openaiShim.ts` — NEW (the shim)
- `src/services/api/client.ts` — routes to shim
- `src/utils/model/providers.ts` — added `openai`/`gemini`/`github`/`codex` provider types
- `src/utils/model/configs.ts` — added OpenAI model mappings
- `src/utils/model/model.ts` — respects `OPENAI_MODEL` for defaults
- `src/utils/auth.ts` — recognizes OpenAI as valid third-party provider

When pulling upstream changes, conflicts will be limited to these files.

## Key Environment Variables

```bash
CLAUDE_CODE_USE_OPENAI=1    # Enable OpenAI-compatible provider
OPENAI_API_KEY=sk-...       # API key
OPENAI_BASE_URL=...         # Base URL (default: https://api.openai.com/v1)
OPENAI_MODEL=gpt-4o         # Model name
FIRECRAWL_API_KEY=...       # Optional: enables WebSearch + JS-rendered WebFetch
CLAUDE_CODE_USE_GEMINI=1    # Enable Gemini provider
GEMINI_API_KEY=...
CLAUDE_CODE_USE_GITHUB=1    # Enable GitHub Models (use GITHUB_TOKEN or GH_TOKEN)
```

## Python Scripts

`atomic_chat_provider.py`, `ollama_provider.py`, and `smart_router.py` are standalone provider proxy scripts, not part of the main TypeScript build. Test them directly with `bun test test_*.py` or `python test_*.py`.

## Communication Preferences

- 与用户的所有对话请全部使用中文回复
