---
name: arch-analyze
description: 当用户要求分析代码库架构、生成架构分析报告、理解陌生项目结构、进行代码库拆解、或需要工程分析报告时触发。触发关键词包括：架构分析、代码库分析、项目结构分析、生成架构报告、arch analyze、architecture analysis、codebase analysis、项目拆解、工程分析
---

# arch-analyze

面向工程师的陌生代码库深度拆解工具。执行四阶段分析后，生成可在浏览器直接打开的工程分析报告。

**文件命名**：`arch-{项目名}-{YYYYMMDD-HHmm}.html`，输出到当前工作区根目录。

---

## Phase 1 — 识别

**默认动作**（必须执行）：
1. 读取根目录结构（深度 3 层）
2. 读取包管理文件（`package.json` / `go.mod` / `pyproject.toml` / `Cargo.toml`，存在则读）
3. 读取 1~2 个构建配置文件（`vite.config.*`、`tsconfig.json`、`webpack.config.*` 等）
4. 判定**项目类型**，确定后续分析重心

**语义扩展触发**（满足以下任一条件时追加读取）：
- 包管理文件中出现未知依赖，无法判定项目类型 → 追读 `README.md`
- 根目录存在 `packages/` 或 `apps/` → 追读子包的 `package.json`（判断 monorepo 边界）
- 存在多个可能的入口文件（如同时有 `main.ts` 和 `server.ts`）→ 追读两个入口的前 30 行
- 类型判定为 `unknown` → 追读最大的 2 个目录下的 `index.ts` / `index.js`

| 类型 ID | 识别特征 | 分析重心 |
|---|---|---|
| `electron` | `electron` 在依赖中 | Main/Renderer/IPC 边界、preload 安全链路 |
| `react-spa` | React + 路由库，无 SSR | 组件架构、状态管理、路由权限 |
| `node-api` | Express/Fastify/Koa/NestJS | 中间件链、DB 层、认证授权 |
| `fullstack` | Next.js/Nuxt/Remix | SSR/SSG 边界、数据获取层、API 路由 |
| `ai-agent` | openai/anthropic/langchain SDK | Tool calling 链路、上下文管理、流式事件 |
| `monorepo` | workspaces/turbo/nx | 包依赖关系、共享层、构建边界 |
| `unknown` | 无法明确判定 | 通用分析，标注所有不确定项 |

---

## Phase 2 — 精读

采用**双 Pass** 策略，Pass A 建骨架，Pass B 闭合关键链路。

### Pass A — 骨架读取（必须执行）

按项目类型优先读取以下类别（每类 2~4 个，选"骨架层"文件）：

1. **入口文件**：`main.ts`、`index.ts`、`app.ts`、`server.ts` 等
2. **类型定义**：`types.ts`、`*.d.ts`——用于推断架构意图，**优先读**
3. **路由/IPC/事件注册**：路由文件、ipcMain 注册、事件总线定义
4. **状态管理**：Zustand/Redux/Pinia store 文件
5. **核心 Service/Controller**：最重要的业务逻辑层文件（各选 1~2 个代表）
6. **配置/部署**（可选）：CI 配置、env 文件、Docker

Pass A 完成后，在脑中（或草稿中）初步勾勒 `MODULES` 和 `LAYERS`。

### Pass B — 关键链路闭合（按需执行）

检查以下 6 类链路是否已有完整证据；缺哪条补读哪条：

| 链路类型 | 闭合条件 | 典型补读目标 |
|---|---|---|
| IPC / 进程通信 | 收发两端都有代码证据 | preload.ts、ipcMain 处理函数 |
| 请求-响应 | 从入口到数据返回路径清晰 | controller + service + DB 层 |
| 认证 / 权限 | 有拦截点证据 | middleware/auth、guard、decorator |
| Tool Calling | AI → Tool → 结果回写路径清晰 | toolService、tool 定义文件 |
| 事件流 / 流式输出 | 生产者 + 消费者都有证据 | stream 处理、SSE/WebSocket handler |
| 状态管理 | store 写入触发点和读取方都读到 | store actions、组件中的 useStore |

- 每条链路标注：`closed`（已闭合）/ `partial`（部分）/ `open`（未闭合，需在 COVERAGE 中说明）
- Pass B **无固定文件数上限**，以闭合链路为目标；但如闭合一条链路需追读 >5 个文件，先补一条 `open` 链路条目，输出中标注"建议人工验证"

**大型项目 fallback**（文件数 >100）：
- Pass A 只读骨架层（入口 + 类型定义 + 注册文件），跳过具体实现文件
- 在分析结果中将 `PROJECT.analyzed` 设为 `"skeleton"`
- 骨架分析**必须**包含：项目类型与系统概览、顶层目录与核心模块划分、主要分层结构、关键请求链路骨架、已识别的重要风险点
- 每个未深入分析的模块，在其 `details` 字段注明"⚠️ 仅分析骨架，未读取实现代码"
- Pass B 仅闭合最关键的 1~2 条链路

---

## Phase 3 — 分析与标注

每条分析结论**必须标注**以下证据类型之一：

- `confirmed`（证据）：代码中直接读到的事实
- `inferred`（推断）：基于命名规范/模式/惯例推断，需在 `details` 中注明依据
- `unverified`（未确认）：无代码证据，仅猜测，用户需自行核实

分析产出（填入下方 DATA LAYER）：
1. `PROJECT`：类型、技术栈、规模、复杂度评级 1~5
2. `LAYERS`：各架构层（名称、职责、包含模块）
3. `MODULES`：每个核心模块（名称、职责、入口文件、依赖、复杂度、证据类型）
4. `FLOWS`：核心流程（请求链路/事件链路/数据流），数量不限，以分析到的为准
5. `RISKS`：风险点（高/中/低/待验证，含文件路径和验证建议）
6. `DEV_GUIDE`：3~5 个二次开发场景（从哪改/影响什么/不要动哪里）
7. `COVERAGE`：分析覆盖报告（已读文件、链路闭合状态、未闭合链路说明、建议追读）

---

## Phase 4 — 生成 HTML

使用以下完整模板，**只填写 DATA LAYER 区域**（`/* ===DATA=== */` 和 `/* ===/DATA=== */` 之间的 7 个数据对象），其余代码原样保留。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>架构分析 · <!-- PROJECT.name --></title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
:root {
  --bg: #0f1117; --bg2: #161b22; --bg3: #21262d;
  --border: #30363d; --text: #e6edf3; --text2: #8b949e;
  --accent: #58a6ff; --green: #3fb950; --yellow: #d29922;
  --red: #f85149; --orange: #db6d28; --purple: #bc8cff;
  --easy: #3fb950; --medium: #d29922; --hard: #f85149;
  --sidebar-w: 220px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; line-height: 1.6; display: flex; min-height: 100vh; }

/* Sidebar */
#sidebar { width: var(--sidebar-w); background: var(--bg2); border-right: 1px solid var(--border); position: fixed; top: 0; left: 0; height: 100vh; overflow-y: auto; padding: 20px 0; z-index: 100; display: flex; flex-direction: column; }
#sidebar .logo { padding: 0 16px 20px; font-weight: 700; font-size: 13px; color: var(--accent); border-bottom: 1px solid var(--border); margin-bottom: 12px; }
#sidebar .logo span { display: block; color: var(--text2); font-weight: 400; font-size: 11px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#sidebar nav a { display: flex; align-items: center; gap: 8px; padding: 7px 16px; color: var(--text2); text-decoration: none; font-size: 13px; border-left: 2px solid transparent; transition: all .15s; }
#sidebar nav a:hover, #sidebar nav a.active { color: var(--text); background: var(--bg3); border-left-color: var(--accent); }
#sidebar nav .section-label { padding: 12px 16px 4px; font-size: 11px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .8px; }
#sidebar .meta { margin-top: auto; padding: 16px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text2); }

/* Main */
#main { margin-left: var(--sidebar-w); flex: 1; padding: 40px 48px 80px; max-width: 1100px; }
section { padding-top: 60px; margin-bottom: 20px; scroll-margin-top: 20px; }
section > h2 { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
section > .section-desc { color: var(--text2); font-size: 13px; margin-bottom: 28px; }
.back-link { display: inline-flex; align-items: center; gap: 4px; color: var(--text2); text-decoration: none; font-size: 12px; margin-bottom: 24px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 6px; transition: all .15s; }
.back-link:hover { color: var(--accent); border-color: var(--accent); }

/* Hero */
#hero { padding-top: 0 !important; margin-bottom: 48px; }
.hero-card { background: linear-gradient(135deg, var(--bg2) 0%, var(--bg3) 100%); border: 1px solid var(--border); border-radius: 12px; padding: 32px; position: relative; overflow: hidden; }
.hero-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--accent), var(--purple)); }
.hero-name { font-size: 28px; font-weight: 800; color: var(--text); margin-bottom: 8px; }
.hero-type { font-size: 13px; color: var(--accent); font-weight: 600; margin-bottom: 16px; }
.hero-stack { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 500; background: var(--bg3); border: 1px solid var(--border); color: var(--text2); }
.hero-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 16px; margin-top: 20px; }
.stat { text-align: center; background: var(--bg); border-radius: 8px; padding: 12px; }
.stat .val { font-size: 22px; font-weight: 700; color: var(--accent); }
.stat .lbl { font-size: 11px; color: var(--text2); margin-top: 2px; }
.skeleton-banner { background: rgba(219,109,40,.12); border: 1px solid var(--orange); border-radius: 8px; padding: 10px 14px; margin-top: 16px; font-size: 13px; color: var(--orange); }

/* Complexity stars */
.complexity { display: flex; gap: 2px; }
.complexity span { width: 8px; height: 8px; border-radius: 2px; background: var(--border); }
.complexity[data-v="1"] span:nth-child(-n+1),
.complexity[data-v="2"] span:nth-child(-n+2),
.complexity[data-v="3"] span:nth-child(-n+3),
.complexity[data-v="4"] span:nth-child(-n+4),
.complexity[data-v="5"] span:nth-child(-n+5) { background: var(--accent); }

/* Layers */
.layers-grid { display: flex; flex-direction: column; gap: 2px; }
.layer-row { display: flex; align-items: stretch; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
.layer-label { width: 160px; flex-shrink: 0; padding: 12px 16px; font-weight: 600; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
.layer-label small { font-weight: 400; font-size: 11px; opacity: .7; }
.layer-modules { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; padding: 12px; background: var(--bg2); align-items: center; }
.layer-mod-chip { padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; border: 1px solid var(--border); color: var(--text2); transition: all .15s; }
.layer-mod-chip:hover { color: var(--text); border-color: var(--accent); }

/* Modules */
.modules-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.module-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.module-header { padding: 14px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background .15s; }
.module-header:hover { background: var(--bg3); }
.module-header .mname { font-weight: 600; font-size: 14px; flex: 1; }
.module-header .mrole { font-size: 12px; color: var(--text2); }
.module-badges { display: flex; gap: 6px; align-items: center; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge-easy { background: rgba(63,185,80,.15); color: var(--easy); }
.badge-medium { background: rgba(210,153,34,.15); color: var(--medium); }
.badge-hard { background: rgba(248,81,73,.15); color: var(--hard); }
.badge-confirmed { background: rgba(63,185,80,.1); color: var(--green); }
.badge-inferred { background: rgba(210,153,34,.1); color: var(--yellow); }
.badge-unverified { background: rgba(248,81,73,.1); color: var(--red); }
.chevron { color: var(--text2); transition: transform .2s; font-size: 12px; }
.module-body { padding: 0 16px; max-height: 0; overflow: hidden; transition: max-height .3s ease, padding .3s; }
.module-body.open { max-height: 600px; padding: 0 16px 14px; }
.module-body .files { margin-top: 8px; }
.module-body .files code { display: block; font-family: 'SF Mono', Consolas, monospace; font-size: 11px; color: var(--accent); background: var(--bg); padding: 2px 6px; border-radius: 3px; margin-bottom: 2px; }
.module-body .deps { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.module-body p { color: var(--text2); font-size: 13px; margin-top: 8px; }
.expand-toggle.open .chevron { transform: rotate(90deg); }

/* Graph */
#dep-graph { width: 100%; height: 420px; background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; margin-top: 16px; }

/* Flows */
.flow-block { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
.flow-title { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
.flow-desc { color: var(--text2); font-size: 13px; margin-bottom: 16px; }
.flow-steps { display: flex; flex-direction: column; gap: 0; }
.flow-step { display: flex; gap: 12px; position: relative; }
.flow-step:not(:last-child) .step-line { width: 2px; background: var(--border); position: absolute; left: 11px; top: 24px; bottom: -4px; }
.step-dot { width: 24px; height: 24px; border-radius: 50%; background: var(--bg3); border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 2px; color: var(--accent); border-color: var(--accent); z-index: 1; }
.step-content { flex: 1; padding-bottom: 16px; }
.step-actor { font-size: 11px; font-weight: 600; color: var(--accent); text-transform: uppercase; letter-spacing: .5px; }
.step-action { font-size: 13px; color: var(--text); }
.step-note { font-size: 12px; color: var(--text2); margin-top: 2px; font-style: italic; }

/* Risks */
.risk-table { width: 100%; border-collapse: collapse; }
.risk-table th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--text2); border-bottom: 1px solid var(--border); }
.risk-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; font-size: 13px; }
.risk-table tr:last-child td { border-bottom: none; }
.risk-level { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.risk-high { background: rgba(248,81,73,.15); color: var(--red); }
.risk-medium { background: rgba(210,153,34,.15); color: var(--yellow); }
.risk-low { background: rgba(63,185,80,.15); color: var(--green); }
.risk-verify { background: rgba(88,166,255,.15); color: var(--accent); }
.risk-files { font-family: 'SF Mono', Consolas, monospace; font-size: 11px; color: var(--text2); }

/* Dev Guide */
.guide-cards { display: flex; flex-direction: column; gap: 12px; }
.guide-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px; }
.guide-scenario { font-weight: 600; font-size: 15px; margin-bottom: 12px; }
.guide-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: flex-start; }
.guide-row .glabel { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; width: 70px; flex-shrink: 0; padding-top: 2px; }
.guide-row .gval { font-size: 13px; color: var(--text2); }
.guide-row .gval code { font-family: 'SF Mono', Consolas, monospace; font-size: 11px; color: var(--accent); background: var(--bg); padding: 1px 5px; border-radius: 3px; margin: 2px; display: inline-block; }
.guide-row .gval .avoid { color: var(--red); }
.guide-tip { margin-top: 10px; padding: 8px 12px; background: rgba(88,166,255,.08); border-left: 3px solid var(--accent); border-radius: 0 4px 4px 0; font-size: 13px; color: var(--text2); }

/* Coverage */
.coverage-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.coverage-panel { background: var(--bg2); border: 1px solid var(--border); border-radius: 8px; padding: 16px 18px; }
.coverage-panel h3 { font-size: 13px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 12px; }
.coverage-files { display: flex; flex-wrap: wrap; gap: 4px; }
.coverage-files code { font-family: 'SF Mono', Consolas, monospace; font-size: 11px; color: var(--accent); background: var(--bg); padding: 2px 6px; border-radius: 3px; }
.chain-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.chain-item:last-child { border-bottom: none; }
.chain-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
.chain-closed { background: var(--green); }
.chain-open { background: var(--red); }
.chain-gap { color: var(--text2); font-size: 12px; margin-top: 2px; }
.next-read-item { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
.next-read-item:last-child { border-bottom: none; }
.next-read-item code { font-family: 'SF Mono', Consolas, monospace; font-size: 11px; color: var(--accent); background: var(--bg); padding: 1px 5px; border-radius: 3px; display: block; margin-bottom: 3px; }
.next-read-item .reason { color: var(--text2); font-size: 12px; }
@media (max-width: 900px) { .coverage-grid { grid-template-columns: 1fr; } }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

@media (max-width: 768px) {
  #sidebar { transform: translateX(-100%); }
  #main { margin-left: 0; padding: 24px 20px; }
}
</style>
</head>
<body>

<aside id="sidebar">
  <div class="logo">
    ⬡ arch-analyze
    <span id="sb-project-name">—</span>
  </div>
  <nav id="sb-nav"></nav>
  <div class="meta" id="sb-meta"></div>
</aside>

<main id="main">
  <section id="hero"></section>
  <section id="overview">
    <h2>🏗️ 系统架构</h2>
    <p class="section-desc">各层职责划分与核心模块归属</p>
    <a href="#hero" class="back-link">↑ 返回总览</a>
    <div id="layers-container"></div>
  </section>
  <section id="modules">
    <h2>📦 核心模块</h2>
    <p class="section-desc">点击模块卡片展开详细信息；依赖图展示模块间关系</p>
    <a href="#hero" class="back-link">↑ 返回总览</a>
    <div id="modules-container" class="modules-grid"></div>
    <div id="dep-graph"></div>
  </section>
  <section id="lifecycle">
    <h2>🔄 核心流程</h2>
    <p class="section-desc">关键请求 / 事件链路</p>
    <a href="#hero" class="back-link">↑ 返回总览</a>
    <div id="flows-container"></div>
  </section>
  <section id="risks">
    <h2>⚠️ 风险 &amp; 验证清单</h2>
    <p class="section-desc">已识别的风险点与建议验证方式；标注证据来源</p>
    <a href="#hero" class="back-link">↑ 返回总览</a>
    <table class="risk-table" id="risk-table">
      <thead><tr><th>等级</th><th>风险</th><th>相关文件</th><th>建议验证</th><th>来源</th></tr></thead>
      <tbody id="risk-tbody"></tbody>
    </table>
  </section>
  <section id="devguide">
    <h2>🧭 二次开发导航</h2>
    <p class="section-desc">常见改动场景：从哪里开始 / 会影响什么 / 不要轻动哪里</p>
    <a href="#hero" class="back-link">↑ 返回总览</a>
    <div id="guide-container" class="guide-cards"></div>
  </section>
  <section id="coverage">
    <h2>🔍 覆盖报告</h2>
    <p class="section-desc">本次分析已读文件、链路闭合状态与建议追读</p>
    <a href="#hero" class="back-link">↑ 返回总览</a>
    <div id="coverage-container"></div>
  </section>
</main>

<script>
/* ===DATA=== */
/* 【说明】以下 7 个对象是 Claude 需要填写的唯一内容。
   其余所有代码原样保留，不要修改。 */

const PROJECT = {
  name: 'ProjectName',
  type: 'unknown',                         // 项目类型 ID
  stack: ['TypeScript', 'React'],          // 技术栈标签
  scale: { files: 0, estimate: 'medium' }, // estimate: small / medium / large
  complexity: 3,                           // 1~5
  analyzed: 'full',                        // full | skeleton
  skeletonNote: '',                        // analyzed=skeleton 时填写未分析的范围
};

const LAYERS = [
  // 示例：
  // { id: 'ui', name: 'UI 层', description: '用户界面与交互', color: '#58a6ff', moduleIds: ['mod-app', 'mod-router'] },
  // { id: 'service', name: 'Service 层', description: '业务逻辑处理', color: '#3fb950', moduleIds: ['mod-auth'] },
];

const MODULES = [
  // 示例：
  // {
  //   id: 'mod-auth',
  //   name: 'AuthService',
  //   role: '认证与权限管理',
  //   files: ['src/services/auth.ts', 'src/middleware/auth.ts'],
  //   complexity: 'medium',              // easy | medium | hard
  //   deps: ['mod-db', 'mod-cache'],     // 依赖的其他 module id
  //   evidence: 'confirmed',             // confirmed | inferred | unverified
  //   details: '基于 JWT 认证，token 有效期 24h。[证据] src/services/auth.ts:L42',
  // },
];

const FLOWS = [
  // 示例：
  // {
  //   title: '用户登录流程',
  //   description: '从前端提交到 JWT 返回的完整链路',
  //   steps: [
  //     { actor: 'Browser', action: 'POST /api/auth/login', note: '含 username + password' },
  //     { actor: 'AuthMiddleware', action: '校验请求体格式' },
  //     { actor: 'AuthService', action: '查询用户，bcrypt 验证密码' },
  //     { actor: 'AuthService', action: '签发 JWT，写入 Redis session', note: '[推断] 基于 redis 依赖和 session 配置' },
  //     { actor: 'Browser', action: '收到 token，存入 localStorage' },
  //   ],
  // },
];

const RISKS = [
  // 示例：
  // {
  //   level: 'high',          // high | medium | low | verify
  //   title: 'JWT secret 硬编码',
  //   description: '在 auth.ts 中发现 secret 直接写在代码里，未使用环境变量',
  //   files: ['src/services/auth.ts'],
  //   suggestion: '检查是否有生产环境配置覆盖；建议迁移到 process.env.JWT_SECRET',
  //   evidence: 'confirmed',
  // },
];

const DEV_GUIDE = [
  // 示例：
  // {
  //   scenario: '我想新增一个 API 接口',
  //   startFiles: ['src/routes/index.ts', 'src/controllers/'],
  //   impacts: ['mod-router', 'mod-auth'],
  //   avoidFiles: ['src/middleware/rateLimit.ts'],
  //   tips: '新增路由后需在 index.ts 注册，认证中间件会自动应用到 /api/* 前缀路由',
  // },
];

const COVERAGE = {
  // 已读取的文件列表
  analyzedFiles: [
    // 示例：'src/main.ts', 'src/shared/types.ts'
  ],
  // 已闭合的链路（Pass B 闭合表）
  closedChains: [
    // 示例：'IPC/进程通信', '请求-响应', '认证/权限'
  ],
  // 未闭合链路（需说明缺口）
  openChains: [
    // 示例：{ name: '事件流/流式输出', gap: '仅读到生产者 streamService，未找到消费者侧处理' }
  ],
  // 建议人工追读的文件（未读但可能影响分析准确性）
  nextReads: [
    // 示例：{ file: 'src/middleware/auth.ts', reason: '认证链路未闭合，该文件可能包含 guard 实现' }
  ],
};

/* ===/DATA=== */


/* ===TEMPLATE ENGINE (勿改)=== */

const EVIDENCE_LABEL = { confirmed: '证据', inferred: '推断', unverified: '未确认' };
const EVIDENCE_CLASS = { confirmed: 'badge-confirmed', inferred: 'badge-inferred', unverified: 'badge-unverified' };
const LEVEL_CLASS = { high: 'risk-high', medium: 'risk-medium', low: 'risk-low', verify: 'risk-verify' };
const LEVEL_LABEL = { high: '🔴 高风险', medium: '🟡 中风险', low: '🟢 低风险', verify: '🔵 待验证' };
const TYPE_LABEL = {
  electron: 'Electron App', 'react-spa': 'React SPA', 'node-api': 'Node.js API',
  fullstack: 'Full-stack', 'ai-agent': 'AI Agent 系统', monorepo: 'Monorepo', unknown: '未知类型',
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function renderHero() {
  const s = document.getElementById('hero');
  const skeletonBanner = PROJECT.analyzed === 'skeleton'
    ? `<div class="skeleton-banner">⚠️ 大型项目 · 骨架级分析${PROJECT.skeletonNote ? '：' + PROJECT.skeletonNote : ''}</div>` : '';
  const tags = PROJECT.stack.map(t => `<span class="tag">${t}</span>`).join('');
  const stars = Array.from({ length: 5 }, (_, i) => `<span></span>`).join('');
  s.innerHTML = `
    <div class="hero-card">
      <div class="hero-name">${PROJECT.name}</div>
      <div class="hero-type">${TYPE_LABEL[PROJECT.type] || PROJECT.type}</div>
      <div class="hero-stack">${tags}</div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:12px;color:var(--text2)">复杂度</span>
        <div class="complexity" data-v="${PROJECT.complexity}">${stars}</div>
        <span style="font-size:12px;color:var(--text2)">${PROJECT.complexity}/5</span>
      </div>
      <div class="hero-stats">
        <div class="stat"><div class="val">${PROJECT.scale.files || '—'}</div><div class="lbl">文件数</div></div>
        <div class="stat"><div class="val">${PROJECT.scale.estimate || '—'}</div><div class="lbl">规模</div></div>
        <div class="stat"><div class="val">${MODULES.length}</div><div class="lbl">核心模块</div></div>
        <div class="stat"><div class="val">${RISKS.filter(r=>r.level==='high').length}</div><div class="lbl">高风险项</div></div>
      </div>
      ${skeletonBanner}
      <div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:10px;">
        <a href="#overview" style="text-decoration:none;padding:6px 16px;background:var(--accent);color:#000;border-radius:6px;font-size:13px;font-weight:600;">架构总览 →</a>
        <a href="#modules" style="text-decoration:none;padding:6px 16px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;">核心模块</a>
        <a href="#lifecycle" style="text-decoration:none;padding:6px 16px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;">核心流程</a>
        <a href="#risks" style="text-decoration:none;padding:6px 16px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;">风险清单</a>
        <a href="#devguide" style="text-decoration:none;padding:6px 16px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;">开发导航</a>
        <a href="#coverage" style="text-decoration:none;padding:6px 16px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px;">覆盖报告</a>
      </div>
    </div>`;
}

function renderLayers() {
  const c = document.getElementById('layers-container');
  if (!LAYERS.length) { c.innerHTML = '<p style="color:var(--text2);font-size:13px;">未识别到明确的分层结构</p>'; return; }
  const modMap = Object.fromEntries(MODULES.map(m => [m.id, m]));
  c.innerHTML = '';
  const grid = el('div', 'layers-grid');
  LAYERS.forEach(layer => {
    const chips = (layer.moduleIds || []).map(mid => {
      const m = modMap[mid];
      return `<span class="layer-mod-chip" onclick="scrollToModule('${mid}')">${m ? m.name : mid}</span>`;
    }).join('');
    const row = el('div', 'layer-row');
    row.innerHTML = `
      <div class="layer-label" style="background:${layer.color}22;border-right:3px solid ${layer.color}">
        <span style="color:${layer.color}">${layer.name}</span>
        <small>${layer.description}</small>
      </div>
      <div class="layer-modules">${chips || '<span style="color:var(--text2);font-size:12px">无模块</span>'}</div>`;
    grid.appendChild(row);
  });
  c.appendChild(grid);
}

function renderModules() {
  const c = document.getElementById('modules-container');
  c.innerHTML = '';
  MODULES.forEach(m => {
    const card = el('div', 'module-card');
    card.id = 'mod-' + m.id;
    const filesHtml = (m.files || []).map(f => `<code>${f}</code>`).join('');
    const depsHtml = (m.deps || []).map(d => {
      const dm = MODULES.find(x => x.id === d);
      return `<span class="layer-mod-chip" style="font-size:11px" onclick="scrollToModule('${d}')">${dm ? dm.name : d}</span>`;
    }).join('');
    card.innerHTML = `
      <div class="module-header expand-toggle" onclick="toggleModule(this)">
        <div>
          <div class="mname">${m.name}</div>
          <div class="mrole">${m.role}</div>
        </div>
        <div class="module-badges">
          <span class="badge badge-${m.complexity}">${m.complexity}</span>
          <span class="badge ${EVIDENCE_CLASS[m.evidence]}">${EVIDENCE_LABEL[m.evidence] || m.evidence}</span>
        </div>
        <span class="chevron">▶</span>
      </div>
      <div class="module-body">
        ${m.files?.length ? `<div class="files">${filesHtml}</div>` : ''}
        ${m.deps?.length ? `<div style="margin-top:8px;font-size:11px;color:var(--text2);margin-bottom:4px;">依赖</div><div class="deps">${depsHtml}</div>` : ''}
        ${m.details ? `<p>${m.details}</p>` : ''}
      </div>`;
    c.appendChild(card);
  });
}

function renderFlows() {
  const c = document.getElementById('flows-container');
  c.innerHTML = '';
  if (!FLOWS.length) { c.innerHTML = '<p style="color:var(--text2);font-size:13px;">未分析到核心流程</p>'; return; }
  FLOWS.forEach(flow => {
    const stepsHtml = flow.steps.map((s, i) => `
      <div class="flow-step">
        <div class="step-line"></div>
        <div class="step-dot">${i + 1}</div>
        <div class="step-content">
          <div class="step-actor">${s.actor}</div>
          <div class="step-action">${s.action}</div>
          ${s.note ? `<div class="step-note">${s.note}</div>` : ''}
        </div>
      </div>`).join('');
    const block = el('div', 'flow-block');
    block.innerHTML = `<div class="flow-title">${flow.title}</div><div class="flow-desc">${flow.description || ''}</div><div class="flow-steps">${stepsHtml}</div>`;
    c.appendChild(block);
  });
}

function renderRisks() {
  const tbody = document.getElementById('risk-tbody');
  if (!RISKS.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text2);text-align:center;padding:20px">未识别到明确风险点</td></tr>'; return; }
  const sorted = [...RISKS].sort((a, b) => ['high','medium','low','verify'].indexOf(a.level) - ['high','medium','low','verify'].indexOf(b.level));
  tbody.innerHTML = sorted.map(r => `
    <tr>
      <td><span class="risk-level ${LEVEL_CLASS[r.level]}">${LEVEL_LABEL[r.level]}</span></td>
      <td><strong style="font-size:13px">${r.title}</strong><br><span style="color:var(--text2);font-size:12px">${r.description}</span></td>
      <td class="risk-files">${(r.files || []).map(f => `<div>${f}</div>`).join('')}</td>
      <td style="color:var(--text2);font-size:12px">${r.suggestion}</td>
      <td><span class="badge ${EVIDENCE_CLASS[r.evidence]}">${EVIDENCE_LABEL[r.evidence] || ''}</span></td>
    </tr>`).join('');
}

function renderDevGuide() {
  const c = document.getElementById('guide-container');
  if (!DEV_GUIDE.length) { c.innerHTML = '<p style="color:var(--text2);font-size:13px;">暂无二次开发场景分析</p>'; return; }
  const modMap = Object.fromEntries(MODULES.map(m => [m.id, m]));
  DEV_GUIDE.forEach(g => {
    const card = el('div', 'guide-card');
    const startCode = (g.startFiles || []).map(f => `<code>${f}</code>`).join('');
    const impactChips = (g.impacts || []).map(id => {
      const m = modMap[id];
      return `<code>${m ? m.name : id}</code>`;
    }).join('');
    const avoidCode = (g.avoidFiles || []).map(f => `<code class="avoid">${f}</code>`).join('');
    card.innerHTML = `
      <div class="guide-scenario">💡 ${g.scenario}</div>
      ${startCode ? `<div class="guide-row"><span class="glabel">从这里</span><div class="gval">${startCode}</div></div>` : ''}
      ${impactChips ? `<div class="guide-row"><span class="glabel">影响范围</span><div class="gval">${impactChips}</div></div>` : ''}
      ${avoidCode ? `<div class="guide-row"><span class="glabel">不要动</span><div class="gval">${avoidCode}</div></div>` : ''}
      ${g.tips ? `<div class="guide-tip">${g.tips}</div>` : ''}`;
    c.appendChild(card);
  });
}

function renderCoverage() {
  const c = document.getElementById('coverage-container');
  const filesHtml = (COVERAGE.analyzedFiles || []).map(f => `<code>${f}</code>`).join('');
  const closedHtml = (COVERAGE.closedChains || []).map(name =>
    `<div class="chain-item"><div class="chain-dot chain-closed"></div><span>${name}</span></div>`).join('');
  const openHtml = (COVERAGE.openChains || []).map(ch =>
    `<div class="chain-item"><div class="chain-dot chain-open"></div><div><div>${ch.name}</div><div class="chain-gap">${ch.gap}</div></div></div>`).join('');
  const nextHtml = (COVERAGE.nextReads || []).map(n =>
    `<div class="next-read-item"><code>${n.file}</code><div class="reason">${n.reason}</div></div>`).join('');
  c.innerHTML = `<div class="coverage-grid">
    <div class="coverage-panel"><h3>已读文件（${(COVERAGE.analyzedFiles||[]).length}）</h3><div class="coverage-files">${filesHtml || '<span style="color:var(--text2);font-size:13px">未记录</span>'}</div></div>
    <div class="coverage-panel"><h3>链路闭合状态</h3>${closedHtml || ''}${openHtml || (!closedHtml ? '<p style="color:var(--text2);font-size:13px">未填写</p>' : '')}</div>
    ${nextHtml ? `<div class="coverage-panel" style="grid-column:1/-1"><h3>建议追读</h3>${nextHtml}</div>` : ''}
  </div>`;
}

function renderSidebar() {
  document.getElementById('sb-project-name').textContent = PROJECT.name;
  const nav = document.getElementById('sb-nav');
  const links = [
    { href: '#hero', icon: '⬡', label: '项目总览' },
    { href: '#overview', icon: '🏗️', label: '系统架构' },
    { href: '#modules', icon: '📦', label: '核心模块' },
    { href: '#lifecycle', icon: '🔄', label: '核心流程' },
    { href: '#risks', icon: '⚠️', label: '风险清单' },
    { href: '#devguide', icon: '🧭', label: '开发导航' },
    { href: '#coverage', icon: '🔍', label: '覆盖报告' },
  ];
  nav.innerHTML = links.map(l =>
    `<a href="${l.href}">${l.icon} ${l.label}</a>`).join('');
  const meta = document.getElementById('sb-meta');
  const ts = new Date().toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  meta.innerHTML = `分析时间<br>${ts}`;
}


/* ===CHARTS (勿改)=== */
function initDepGraph() {
  const container = document.getElementById('dep-graph');
  if (!MODULES.length) { container.style.display = 'none'; return; }
  const chart = echarts.init(container, 'dark');
  const modMap = Object.fromEntries(MODULES.map(m => [m.id, m]));
  const layerColorMap = Object.fromEntries(LAYERS.map(l => l.moduleIds.map(id => [id, l.color])).flat());
  const complexitySize = { easy: 30, medium: 42, hard: 56 };
  const nodes = MODULES.map(m => ({
    id: m.id, name: m.name,
    symbolSize: complexitySize[m.complexity] || 38,
    itemStyle: { color: layerColorMap[m.id] || '#58a6ff', borderColor: '#30363d', borderWidth: 1 },
    label: { fontSize: 11, color: '#e6edf3' },
    tooltip: { formatter: `${m.name}<br>${m.role}` },
  }));
  const edges = MODULES.flatMap(m =>
    (m.deps || []).filter(d => modMap[d]).map(d => ({
      source: m.id, target: d,
      lineStyle: { color: '#30363d', width: 1.5, curveness: .1 },
    }))
  );
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', backgroundColor: '#161b22', borderColor: '#30363d', textStyle: { color: '#e6edf3', fontSize: 12 } },
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true,
      data: nodes, links: edges,
      force: { repulsion: 160, gravity: 0.05, edgeLength: [80, 200], layoutAnimation: true },
      emphasis: { focus: 'adjacency', lineStyle: { width: 2 } },
    }],
  });
  window.addEventListener('resize', () => chart.resize());
}


/* ===INTERACTIONS (勿改)=== */
function toggleModule(header) {
  const body = header.nextElementSibling;
  const isOpen = body.classList.contains('open');
  document.querySelectorAll('.module-body.open').forEach(b => {
    b.classList.remove('open');
    b.previousElementSibling.classList.remove('open');
  });
  if (!isOpen) { body.classList.add('open'); header.classList.add('open'); }
}

function scrollToModule(id) {
  const el = document.getElementById('mod-' + id);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.outline = '2px solid var(--accent)'; setTimeout(() => el.style.outline = '', 1500); }
  history.pushState(null, '', '#modules');
}

function initScrollSpy() {
  const sections = document.querySelectorAll('section[id]');
  const links = document.querySelectorAll('#sb-nav a');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + e.target.id));
      }
    });
  }, { threshold: 0.2, rootMargin: '-60px 0px -60% 0px' });
  sections.forEach(s => obs.observe(s));
}


/* ===BOOT=== */
document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  renderHero();
  renderLayers();
  renderModules();
  renderFlows();
  renderRisks();
  renderDevGuide();
  renderCoverage();
  initDepGraph();
  initScrollSpy();
});
</script>
</body>
</html>
```

---

## 规则与约束

### 证据标注规则
- `details` 字段中引用代码时，格式为：`[证据] src/path/file.ts:L行号`
- 推断内容必须注明依据，格式为：`[推断] 基于 XXX 模式/命名/配置`
- 无证据的内容标为 `evidence: 'unverified'`，在 `details` 中注明"需用户核实"

### 大型项目规则
- `PROJECT.analyzed = 'skeleton'` 时，`skeletonNote` 必须写明哪些模块/目录未读
- 未读的模块 `details` 中必须包含：`⚠️ 仅分析骨架，未读取实现代码`
- 骨架分析的 5 个必输项即使不完整也要尽力输出，不可全部留空

### DATA LAYER 填写规则
- 每个数组至少填 1 条有意义的数据（不要全部留示例注释）
- `LAYERS` 中所有 `moduleIds` 必须在 `MODULES` 中有对应 `id`
- `MODULES` 中 `deps` 只引用已存在的 `moduleId`
- `DEV_GUIDE` 中 `impacts` 只引用已存在的 `moduleId`
- 文件路径使用相对于项目根目录的路径

### COVERAGE 填写规则
- `analyzedFiles`：列出 Phase 2 中实际读取的所有文件路径
- `closedChains`：仅列出已完整闭合的链路名（与 Pass B 闭合表一致）
- `openChains`：每条未闭合链路必须填写 `gap`（缺少什么证据）
- `nextReads`：推荐 1~3 个优先级最高的追读目标（不要超过 5 个）
- 骨架分析时，`openChains` 可多条，不视为错误；需注明 `"骨架模式，未追读实现层"`
