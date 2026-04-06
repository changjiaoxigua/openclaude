/**
 * OpenClaude startup screen — banner-style header.
 * Called once at CLI startup before the Ink UI renders.
 */

declare const MACRO: { VERSION: string; DISPLAY_VERSION?: string }

const ESC = '\x1b['
const RESET = `${ESC}0m`

type RGB = [number, number, number]
// ESC[49m resets the background to the terminal default before applying a
// foreground colour.  Without it, macOS Terminal.app adds an implicit grey
// background shading behind any 24-bit RGB foreground colour.
const rgb = (r: number, g: number, b: number) => `${ESC}49m${ESC}38;2;${r};${g};${b}m`

// ─── Colors ───────────────────────────────────────────────────────────────────
// All colours chosen to remain legible on both dark and light terminal themes.

const ACCENT: RGB  = [240, 148, 96]   // sunset orange  — banner line & highlights
// NOTE: b=100 is avoided intentionally. macOS Terminal parses the last SGR
// parameter independently, so ESC[38;2;r;g;100m also triggers ESC[100m]
// (bright-black / dark-grey background).  b=96 is visually identical but
// falls outside the 8-colour background range (40-47 / 100-107).
const CREAM: RGB   = [220, 195, 170]  // warm cream     — value text
const LABEL: RGB   = [160, 145, 130]  // medium warm    — label text (was DIMCOL, brightened)
const BORDER: RGB  = [160, 130, 110]  // medium brown   — box borders (was too dark)

// ─── Provider detection ───────────────────────────────────────────────────────

function detectProvider(): { name: string; model: string; baseUrl: string; isLocal: boolean } {
  const useGemini = process.env.CLAUDE_CODE_USE_GEMINI === '1' || process.env.CLAUDE_CODE_USE_GEMINI === 'true'
  const useGithub = process.env.CLAUDE_CODE_USE_GITHUB === '1' || process.env.CLAUDE_CODE_USE_GITHUB === 'true'
  const useOpenAI = process.env.CLAUDE_CODE_USE_OPENAI === '1' || process.env.CLAUDE_CODE_USE_OPENAI === 'true'

  if (useGemini) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    const baseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai'
    return { name: 'Google Gemini', model, baseUrl, isLocal: false }
  }

  if (useGithub) {
    const model = process.env.OPENAI_MODEL || 'github:copilot'
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://models.github.ai/inference'
    return { name: 'GitHub Models', model, baseUrl, isLocal: false }
  }

  if (useOpenAI) {
    const rawModel = process.env.OPENAI_MODEL || 'gpt-4o'
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(baseUrl)
    let name = 'OpenAI'
    if (/deepseek/i.test(baseUrl) || /deepseek/i.test(rawModel))     name = 'DeepSeek'
    else if (/openrouter/i.test(baseUrl))                             name = 'OpenRouter'
    else if (/together/i.test(baseUrl))                               name = 'Together AI'
    else if (/groq/i.test(baseUrl))                                   name = 'Groq'
    else if (/mistral/i.test(baseUrl) || /mistral/i.test(rawModel))   name = 'Mistral'
    else if (/azure/i.test(baseUrl))                                  name = 'Azure OpenAI'
    else if (/localhost:11434/i.test(baseUrl))                        name = 'Ollama'
    else if (/localhost:1234/i.test(baseUrl))                         name = 'LM Studio'
    else if (/llama/i.test(rawModel))                                  name = 'Meta Llama'
    else if (isLocal)                                                  name = 'Local'

    let displayModel = rawModel
    const codexAliases: Record<string, { model: string; reasoningEffort?: string }> = {
      codexplan:           { model: 'gpt-5.4',            reasoningEffort: 'high' },
      'gpt-5.4':           { model: 'gpt-5.4',            reasoningEffort: 'high' },
      'gpt-5.3-codex':     { model: 'gpt-5.3-codex',     reasoningEffort: 'high' },
      'gpt-5.3-codex-spark': { model: 'gpt-5.3-codex-spark' },
      codexspark:          { model: 'gpt-5.3-codex-spark' },
      'gpt-5.2-codex':     { model: 'gpt-5.2-codex',     reasoningEffort: 'high' },
      'gpt-5.1-codex-max': { model: 'gpt-5.1-codex-max', reasoningEffort: 'high' },
      'gpt-5.1-codex-mini':{ model: 'gpt-5.1-codex-mini' },
      'gpt-5.4-mini':      { model: 'gpt-5.4-mini',      reasoningEffort: 'medium' },
      'gpt-5.2':           { model: 'gpt-5.2',            reasoningEffort: 'medium' },
    }
    const alias = rawModel.toLowerCase()
    if (alias in codexAliases) {
      const resolved = codexAliases[alias]
      displayModel = resolved.model
      if (resolved.reasoningEffort) displayModel = `${displayModel} (${resolved.reasoningEffort})`
    }

    return { name, model: displayModel, baseUrl, isLocal }
  }

  const model = process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL || 'claude-sonnet-4-6'
  return { name: 'Anthropic', model, baseUrl: 'https://api.anthropic.com', isLocal: false }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Each line starts with RESET so no colour state bleeds from previous lines.
const line = (...parts: string[]) => RESET + parts.join('') + RESET

function boxRow(content: string, width: number, rawLen: number): string {
  const pad = Math.max(0, width - 2 - rawLen)
  return line(
    rgb(...BORDER), '\u2502',   // │
    RESET, content,
    ' '.repeat(pad),
    rgb(...BORDER), '\u2502',   // │
  )
}

function lbl(k: string, v: string, c: RGB = CREAM): [string, number] {
  const padK = k.padEnd(9)
  // No DIM — dim attribute adds a grey shading overlay in macOS Terminal.
  return [
    ` ${rgb(...LABEL)}${padK}${RESET} ${rgb(...c)}${v}${RESET}`,
    ` ${padK} ${v}`.length,
  ]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function printStartupScreen(): void {
  // Skip in non-interactive / CI / piped mode
  if (process.env.CI || !process.stdout.isTTY) return

  const p = detectProvider()
  const version = MACRO.DISPLAY_VERSION ?? MACRO.VERSION
  const W = 62
  const out: string[] = []

  out.push('')

  // ── Banner ─────────────────────────────────────────────────────────────────
  // "── OpenClaude v0.1.7 ──  Any model. Every tool. Zero limits.  ──"
  // Only ASCII-safe box-drawing U+2500 ─ (East-Asian width = Narrow, always 1 col).
  const H    = '\u2500'           // ─
  const title   = ` OpenClaude v${version} `
  const tagline = ` Any model. Every tool. Zero limits. `
  const cols    = process.stdout.columns ?? 80
  const inner   = title.length + 2 + tagline.length   // 2 for the ── separator
  const side    = Math.max(2, Math.floor((cols - inner) / 2))
  const rside   = Math.max(0, cols - side - inner)

  out.push(line(
    rgb(...ACCENT), H.repeat(side),
    rgb(...ACCENT), title,
    rgb(...ACCENT), H.repeat(2),
    rgb(...LABEL),  tagline,
    rgb(...ACCENT), H.repeat(rside),
  ))

  out.push('')

  // ── Provider info box ──────────────────────────────────────────────────────
  out.push(line(rgb(...BORDER), '\u2554' + '\u2550'.repeat(W - 2) + '\u2557'))  // ╔══╗

  let [r, l] = lbl('Provider', p.name, p.isLocal ? [130, 200, 130] : ACCENT)
  out.push(boxRow(r, W, l))
  ;[r, l] = lbl('Model', p.model)
  out.push(boxRow(r, W, l))
  const ep = p.baseUrl.length > 38 ? p.baseUrl.slice(0, 35) + '...' : p.baseUrl
  ;[r, l] = lbl('Endpoint', ep)
  out.push(boxRow(r, W, l))

  out.push(line(rgb(...BORDER), '\u2560' + '\u2550'.repeat(W - 2) + '\u2563'))  // ╠══╣

  const dot   = p.isLocal ? [130, 200, 130] as RGB : ACCENT
  const mode  = p.isLocal ? 'local' : 'cloud'
  const sRow  = ` ${rgb(...dot)}\u25cf${RESET} ${rgb(...LABEL)}${mode}${RESET}    ${rgb(...LABEL)}Ready \u2014 type ${RESET}${rgb(...ACCENT)}/help${RESET}${rgb(...LABEL)} to begin${RESET}`
  const sLen  = ` \u25cf ${mode}    Ready \u2014 type /help to begin`.length
  out.push(boxRow(sRow, W, sLen))

  out.push(line(rgb(...BORDER), '\u255a' + '\u2550'.repeat(W - 2) + '\u255d'))  // ╚══╝
  out.push(line(rgb(...LABEL), '  openclaude ', rgb(...ACCENT), `v${version}`))
  out.push('')

  process.stdout.write(out.join('\n') + '\n')
}
