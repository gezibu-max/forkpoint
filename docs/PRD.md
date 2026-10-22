# Forkpoint 产品文档（PRD）

- 版本：v0.2（求职作品集版）
- 日期：2026-10-21
- 状态：Pre-alpha，已实现 record / strict replay / verify / fork / diff / export；流式与成本估算未实现
- 前身：AgentTape v0.1 草稿（2026-10-21）
- 项目性质：单人、3 周、开源、求职作品集
- 仓库：https://github.com/gezibu-max/forkpoint
- npm 包名：`forkpoint`（2026-10-21 查询未被占用）
- 许可：Apache-2.0

---

## 0. 一句话定位

**Forkpoint 是 Agent 的可复现运行层：录制一次真实运行，离线严格重放；换模型、改 prompt、改 tool schema 后，指出第一次分歧发生在哪一步。**

Slogan：**Record once. Replay deterministically. Find the fork.**

它不训练模型、不调用模型做重放、不做托管平台。它把一次运行里的外部世界钉死，让程序本身可复现；在需要对比时，只让被改动的变量重新决策。

---

## 1. 为什么做

### 1.1 个人起点

在 Text2SQL Harness 的实践中遇到过一次偶发失败：同一句问题，第一次生成了错误的 JOIN，重跑三次有两次是对的。trace 能看到调用链，但看不到三个关键事实：

- 当时模型收到的完整上下文是什么；
- 它为什么选了那张表；
- 换一个模型或改一版 prompt，行为会从哪一步开始不同。

重跑要烧 token，而且跑出的是另一条路径。这不是一个靠加日志能解决的问题。

### 1.2 问题定义

Agent 的行为由「LLM 采样 + 工具返回 + 运行时状态」共同决定，任意一环变化都会让结果漂移。当前 JS/TS 工程实践缺三样东西：

1. **不可复现**：偶发失败（工具超时、选错工具、生成后修复失败）无法原样再跑一遍。
2. **不可对比**：换模型、改 prompt、升级 tool schema 后，只能看整体成功率，无法回答「哪个 case 从哪一步开始变差」。
3. **不可回归**：没有稳定的离线运行基线，CI 里无法对 Agent 行为做 diff。

### 1.3 目标函数：这是作品集，不是创业

明确写下评价标准，避免后续决策跑偏：

- **首要目标**：产出一个能在面试里讲 30 分钟、经得起追问的工程作品。
- **次要目标**：验证是否有 3 个外部真实使用者、1 个外部 issue/PR。
- **不追求**：star 数、融资、商业化、双许可、托管服务。

这个目标直接决定范围：**宁可少做一个功能，不可多写一句没验证的话。** 竞品密度不是否决项，能否展示判断力才是。

---

## 2. 目标与非目标

### 2.1 v0.1 目标

| 编号 | 目标 | 优先级 |
|---|---|---|
| G1 | 用 `wrapOpenAI` + `tool()` 包装一次 Agent 运行，录制 LLM、工具、时钟、随机数、环境快照 | P0 |
| G2 | 断网、无 API key 环境下 `replay --strict`，事件序列与最终输出和录制时一致 | P0 |
| G3 | `fork` 替换模型 / 温度 / system prompt，生成 variant run，定位 first divergence | P0 |
| G4 | 输出 Markdown diff 报告，含分歧点、步数、token、成本、延迟对比 | P0 |
| G5 | `npx forkpoint` 可运行；单文件 cassette；无遥测、无外部服务 | P0 |
| G6 | 作品集交付：README、GIF、设计决策、能力边界、prior art、benchmark 数字、技术博客 | P0 |

### 2.2 非目标（v0.1 明确不做）

- 不做托管服务、Web 看板、账号体系。
- 不做生产 APM / 全链路可观测平台。
- 不做 OS 级沙箱，不拦截任意文件系统与任意网络。
- 不做多进程 / 分布式 Agent 的全局因果追踪。
- 不保证工具写副作用的自动回滚（strict 模式不执行写工具，并显式告警）。
- 不做通用 eval 数据集管理、断言 DSL、测试报告体系。
- 不做 Python SDK（本版本只做 TypeScript）。
- 不录 MCP 协议层（stdio / SSE / streamable HTTP / JSON-RPC / sampling / elicitation）。
- 不做 `repair` / `merge` 这类“补 fixture”的交互式修复（理由见 §7.3）。
- 不做 LangGraph / Vercel AI SDK / OpenAI Agents SDK 的专用适配（v0.2 候选）。
- 不做 HTTP 层的通用拦截（v0.2 候选；v0.1 用 `tool()` 覆盖网络调用）。
- 不接实时 pricing API（破坏离线优先；用录制时 pricing 快照）。
- 不做 Web UI。

---

## 3. 用户与场景

### 3.1 用户

| 类型 | 描述 | 关系 |
|---|---|---|
| A｜JS/TS Agent 开发者 | 用 OpenAI Node SDK、Vercel AI SDK 或自研工具链；线上偶发失败难复现 | 主用户 |
| B｜AI 应用团队 Tech Lead | 需要评估模型迁移、prompt 迭代对存量 case 的影响，希望进 CI | 次用户 |
| C｜面试官 / 招聘方 | 作品集的真实读者；关心取舍、边界、验证方法 | 作品集受众，明确纳入设计 |

### 3.2 核心场景

| 编号 | 场景 | 描述 | 优先级 |
|---|---|---|---|
| S1 | 离线复现失败 | 录制一次失败运行，断网重放，不花 token，定位坏在哪一步 | P0 |
| S2 | 模型迁移对比 | 同一批真实 run 用新模型 fork，报告哪些 case 结论变了、成本/延迟变化 | P0 |
| S3 | Prompt 迭代 | 改 system prompt 后 fork，找到第一次行为分歧的事件 | P0 |
| S4 | Tool schema / MCP description 变化 | 工具描述变化导致选错工具；用 fork + diff 定位到具体步骤 | P1 |
| S5 | CI 行为回归 | 把关键 run 作为金标，CI 重放并 diff，不一致则失败 | P1 |
| S6 | 事故复盘 / 审计 | 导出脱敏后的完整调用链，供团队复盘 | P1 |

### 3.3 用户旅程

#### 首次成功路径（目标：5 分钟）

1. `npm install -D forkpoint`
2. 用 `new Forkpoint()` 创建实例，`wrapOpenAI(new OpenAI())` 包装客户端，用 `tool()` 包装工具。
3. `npx forkpoint record --name sql-agent-fail -- tsx examples/sql-agent.ts`
4. 删掉 API key、断网，执行 `npx forkpoint replay <run_id> --strict [--fail-on-env-change]`。
5. 看到与录制时一致的输出，以及事件列表。

README 的第一屏必须能完成这条路径。任何需要读三页文档才能接入的设计都视为失败。

#### 失败恢复路径

strict 重放失败时，错误信息必须包含：

- `run_id`、`seq`、`callsite`（`file:line`）、事件类型；
- 期望的 fixture key；
- 最近邻的 3 个已录制 key，以及差异字段；
- 下一步建议：重录、检查未插桩代码、或使用 `--allow-live`（P1 hybrid）。

**不提供交互式 `repair`，不提供 `merge`。** 半真半假的 cassette 会摧毁“严格重放”这个唯一卖点。宁可失败，不造假。

#### Cassette 生命周期

- 默认存储 `.forkpoint/`，内置 `.gitignore` 模板。
- 默认保留最近 20 条 run，超出时提示，不自动删除。
- 单条 cassette 超过 50 MB 时告警（blobs 去重后仍超限）。
- 分享前必须 `export --redact`，并人工检查扫描结果。
- 不做自动上传、不做遥测。

---

## 4. Prior art 与差异化

### 4.1 已有实现（2026-10-21 核实）

| 项目 | 已实现 | 与 Forkpoint 的关系 |
|---|---|---|
| `clay-good/agent-replay` | 本地 SQLite CLI；通过 hooks/OTel 录制 LLM、tool、**time** 边界；replay、fork、diff、CI gates；“100% local” | 重叠度最高。它已经覆盖 time 边界与 fork/diff/CI；未明确承诺 RNG/env 控制，也未明确做 step 级 first-divergence |
| `Ishan-sa/agent-tape`（npm `agenttape` 0.5.1） | 录制/重放/diff/回归测试 Claude Code agent session | **同名同品类**，但绑定 Claude Code session，不是通用 SDK 边界 |
| `ajayvnkt/agent-vcr`（npm `agent-vcr` 0.4.0） | TypeScript；golden tool-call traces、policy assertions、多轮场景、run-to-run variance、context-compaction contracts | 同语言近品类，偏“测试断言/可靠性测试”，不是“严格重放 + 分歧定位” |
| `agrepl`（arXiv 2607.16200，2026-04） | 在传输层用 MITM proxy 拦截所有外部交互；Go / MIT | 网络覆盖更全；不解决 tool 语义与步骤定位 |
| MLflow / AgentOps / LangSmith / Langfuse | tracing、eval、部分 time-travel / replay 能力 | 平台级、重可观测、轻严格确定性；不是本地单文件工具 |
| vcrpy / Polly.js | HTTP 层录制回放 | 不理解 LLM / tool 语义；无分歧定位 |

### 4.2 剩下的缺口

1. **严格确定性边界**：不仅“记录”时间/RNG/env，而是在重放时**控制**它们；现有项目对 RNG/env 的承诺不明确。
2. **自动 callsite + first-divergence**：不要求用户手写 `step_label`，从栈帧自动取 `file:line`，并把首次分歧定位到具体步骤。
3. **本地单文件 + 零原生依赖 + `npx`**：开发者不需要起服务、不需要账号。
4. **显式失败**：请求不匹配时立即报错并给最近邻，不静默返回错误 fixture。

### 4.3 我们只押两点

- **严格确定性**：clock / RNG / env 纳入边界，并在重放时受控。
- **变更定位**：first divergence + 自动 callsite + 分歧类型分类。

注意用词：是**定位**，不是“归因”。工具回答“从哪一步开始不一样”，不回答“为什么”。因果解释属于使用者。

### 4.4 我们明确不做

- 不做框架无关的自动 time-travel（agent-replay 已占据）。
- 不做 Claude Code session 录制（agenttape 已占据）。
- 不做断言 DSL / 测试框架（agent-vcr 已占据）。
- 不做传输层 MITM（agrepl 已占据）。
- 不做平台化 tracing（LangSmith / Langfuse 已占据）。

### 4.5 诚实声明

> 这不是空白赛道。2026 年已经有至少三个项目覆盖了录制/重放/diff 的大部分能力。Forkpoint 的赌注是：在 TypeScript Agent 的 SDK 边界上，把“严格确定性 + 首次分歧定位”做透，并公开说明自己不做什么。

这段话应原样进入 README 的 Prior art 小节。面试官会问“这不是有人做了吗”，这段就是答案的起点。

---

## 5. 核心概念

| 概念 | 定义 |
|---|---|
| Run | 一次完整的 Agent 执行，含配置、环境快照、事件序列 |
| Event | 边界事件：`llm.request/response`、`tool.call/result/error`、`clock.now`、`rng.value`、`env.snapshot`、`run.start/end`、`replay.warning` |
| Cassette | 一次 Run 的全部 fixture 与元数据，SQLite 单文件（可选 JSONL 导出） |
| Fixture | 某个边界请求对应的录制结果，按规范化请求指纹索引 |
| Replay | 用 cassette 替代真实外部调用，重新执行同一份 Agent 代码 |
| Fork | 以某个 Run 为基线，覆盖模型 / prompt / 参数后重放，生成 variant Run |
| Divergence | 重放过程中第一次出现请求指纹不一致、fixture 缺失或输出变化的位置 |
| Callsite | 自动从栈帧提取的 `相对路径:行:列`，作为步骤标签 |
| Strict | 只读 cassette，阻断真实调用，任何不匹配即失败 |
| Hybrid | 首次分歧前只读，之后允许真实调用（P1） |
| Verify | 同一 run 连续重放两次，比较事件哈希，检测未受控随机性 |

---

## 6. 功能需求

### FR-1 录制（P0）

- 提供 TypeScript SDK：`new Forkpoint({ store })`、`fp.run(name, fn)`、`fp.wrapOpenAI(client)`、`tool(name, fn, opts)`。
- 录制 LLM 请求/响应（含流式重组）、工具调用/结果/异常、时钟读数、随机数序列、环境变量白名单。
- 运行元数据：git SHA、Node 版本、启动命令、cwd、平台、依赖锁文件 hash、随机种子。
- 默认脱敏 `Authorization`、`api-key`、`Cookie` 等 header。
- 录制开销（不含模型与工具本身耗时）P95 < 5%。

**验收**：demo 录制后，事件数与边界调用数一致；假 API key 不出现在任何存储文件中。

### FR-2 严格重放（P0）

- `forkpoint replay <run_id> --strict [--fail-on-env-change]`：spawn 原启动命令，注入重放上下文。
- 默认禁止真实 LLM / 网络调用（guard），只从 cassette 取数。
- 请求按指纹匹配；失败立即报错，输出 `seq`、`callsite`、期望 key、最近邻候选。
- 校验重放事件序列哈希与录制一致；不一致输出首个差异事件。
- `--allow-live`（P1）在分歧后允许真实调用。

**验收**：断网、未设置 API key 时重放 demo 成功，文本输出逐字节一致，事件哈希一致。

### FR-3 反事实 Fork（P0）

- `forkpoint fork <run_id> --model <model> [--temperature <n>] [--system-prompt-file <path>]`。
- 至少一个覆盖项；否则用法错误。
- v0.1 覆盖是全局的：所有 LLM 步骤调用真实模型；工具使用基线 fixture（closed-world）。
- variant run 记录 `parent_run_id` 与覆盖项；重放该 forked run 时自动复用存储的覆盖项，对 forked run 再 fork 时继承覆盖项且新覆盖项优先。
- 对齐使用 callsite label，不使用 `step_index`。
- 工具在 fork 中不真实执行；fork 开始时写入一条 `FORK_TOOLS_FROZEN` 告警。

**验收**：同一基线 fork 新模型后，报告给出结论变化与首次分歧事件；未覆盖的工具调用不产生真实副作用。

### FR-4 Diff 与定位（P0）

- `forkpoint diff <base> <variant>`：比较两条 run。
- 指标：最终输出差异、首次分歧事件、分歧类型、步数、LLM 调用次数、token、延迟；v0.1 不做成本估算。
- 分歧类型：`fixture_miss`、`request_mismatch`、`tool_exception`、`output_changed`、`nondeterminism_leak`。
- 输出 Markdown；P1 输出 JSON 供 CI 断言。
- **不把“模型正常换答案”误报为 `nondeterminism_leak`。**

**验收**：报告能准确指出 first divergence；`output_changed` 被标记为正常反事实结果，不是错误。

### FR-5 CLI（P0）

```bash
forkpoint record --name "sql-agent-fail" -- tsx examples/sql-agent.ts
forkpoint ls
forkpoint show <run_id>
forkpoint replay <run_id> --strict [--fail-on-env-change]
forkpoint fork <run_id> --model gpt-4.1-mini --system-prompt-file prompts/v2.md
forkpoint diff <base_run_id> <variant_run_id> -o reports/v1-v2.md
forkpoint verify <run_id>
forkpoint export <run_id> --redact
```

退出码：`0` 成功；`1` 重放/校验失败；`2` 用法错误。

### FR-6 脱敏与隐私（P0）

- 录制时不写入 LLM 传输字段（headers、fetch 等）；env 只录白名单，并跳过 `*_KEY` / `*_TOKEN` / `*_SECRET` / `*_PASSWORD`。默认 header 脱敏由此成立。
- 支持自定义正则规则与 env 白名单。自定义规则随 run 持久化，variant run 继承 baseline 规则。
- cassette 存本地 `.forkpoint/`；无遥测。cassette 仍可能含业务数据，分享必须走 `export --redact`。
- `export --redact` 强制要求 `--redact`；对 meta / event / fixture 应用内置 header、env 与自定义规则，输出 JSONL，再扫描 `sk-`、`ghp_`、`AKIA` 等模式给出告警。命中只报告，不自动删除。
- 导出文件标注 `replayable: false`；脱敏改变了请求内容，不提供导入与重放。

**验收**：设置假 API key 录制后，全库 grep 不到该值；导出文件同样干净；故意植入的 `sk-test-...` 能被扫描报告定位到行号与字段。

### FR-7 CI 集成（P1）

- 提供 GitHub Actions composite action 示例：还原脱敏 cassette，执行 replay + diff，输出报告 artifact，失败时非零退出。
- 文档给出“金标 run 如何维护”的最小工作流。

### FR-8 Mutation Benchmark（P0，开发工具，不是产品功能）

- 取 20 条真实 run，注入已知改动：5 条改 prompt、5 条换模型、5 条替换工具输出、5 条改 tool schema。
- 对每条记录期望的首次分歧 callsite。
- 输出：重放成功率、first-divergence 定位准确率（top-1 / top-3）、误报率、分类准确率。
- 数字进入 README；样本量写清楚，不宣称是行业 benchmark。

---

## 7. 技术方案

### 7.1 技术栈决策

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript（ESM） | 目标用户是 JS/TS Agent 开发者；类型化事件模型适合展示设计能力 |
| 运行时 | Node.js >= 24 | `node:sqlite` 可用，零原生依赖；24 为当前 LTS |
| 存储 | `node:sqlite`（`DatabaseSync`） | 单文件 cassette，Windows 无需编译原生模块 |
| 上下文 | `AsyncLocalStorage` | 包装器透明，不把实例一路传参 |
| CLI | `commander` | 轻量、成熟 |
| 构建 | `tsup` | ESM 输出、类型声明 |
| 测试 | `vitest` | 快、TS 原生 |
| 包管理 | npm | `npx forkpoint` 是最短路径 |
| LLM 依赖 | `openai` 作为 peer/dev dependency | 不捆绑，避免版本冲突 |
| 许可 | Apache-2.0 | 含专利授权，适合基础设施类工具 |

**已知代价**：Python 生态的 Agent 框架更多；本项目的“框架无关”只覆盖 JS/TS。这一点写进 README 的限制，不在面试中回避。

### 7.2 架构

```
┌────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  Agent 代码     │────▶│  Instrumentation │────▶│   Recorder     │
│  (OpenAI SDK)  │     │  LLM/Tool/Clock  │     │  (node:sqlite) │
└────────────────┘     │  RNG/Env         │     └───────┬────────┘
                       └────────┬─────────┘             │
                                │ replay                 │
                       ┌────────▼─────────┐     ┌───────▼────────┐
                       │ Fixture Resolver │◀────│    Cassette    │
                       │ strict / fork    │     └────────────────┘
                       └────────┬─────────┘
                                │
                       ┌────────▼─────────┐
                       │  Diff / Report   │
                       └──────────────────┘
```

```
src/
  index.ts                 # 公共 API：Forkpoint, tool
  core/
    context.ts             # AsyncLocalStorage：runId, spanId, parentSpanId, mode
    events.ts              # 事件判别联合类型
    fingerprint.ts         # canonical JSON + sha256
    callsite.ts            # 栈帧 -> 相对路径:行:列
    ids.ts                 # run id / span id
  boundaries/
    openai.ts              # 包装 chat.completions / responses，含流式
    tool.ts                # tool(name, fn, opts) 高阶函数
    time.ts                # Date / Date.now / performance.now
    random.ts              # Math.random / crypto.randomUUID / getRandomValues
    env.ts                 # 白名单快照
  store/
    db.ts                  # node:sqlite、schema_version、自动迁移 + 备份
    blobs.ts               # 大对象去重
    cassette.ts            # run/event/fixture 读写
  replay/
    resolver.ts            # strict / fork 匹配、occurrence
    guard.ts               # 阻断真实 LLM / fetch
    stream.ts              # 重放 async iterable
    clock.ts               # 虚拟时钟
    rng.ts                 # 随机序列
  diff/
    align.ts               # callsite + seq + LCS 对齐
    divergence.ts          # 首次分歧与分类
    report.ts              # Markdown / JSON
    pricing.ts             # pricing 快照与成本估算
  cli/
    index.ts
    commands/              # record, ls, show, replay, fork, diff, verify, export
examples/sql-agent/
tests/
docs/
  PRD.md
  SRS.md
  decisions.md
  limits.md
  prior-art.md
```

### 7.3 录制边界

| 边界 | 捕获方式 | v0.1 |
|---|---|---|
| LLM | `wrapOpenAI(client)` 包装请求/响应，流式 tee + 重组 | 支持 |
| Tool | `tool(name, fn, opts)` 高阶函数 | 支持 |
| 时钟 | patch `Date`（无参构造）、`Date.now`、`performance.now` | 支持 |
| 随机 | patch `Math.random`、`crypto.randomUUID`、`crypto.getRandomValues` | 支持（best-effort） |
| 环境 | 运行开始时快照白名单 env + 依赖 hash | 支持 |
| 网络 | 不通用拦截；网络调用必须包在 `tool()` 里 | 部分（显式约定） |
| 数据库 | 工具级录制 SQL 与结果；不做驱动拦截 | 部分 |
| 文件系统 | 不拦截；读文件应包在 `tool()` 里 | 不支持 |
| 并发 | 单进程；span_id/parent_span_id；并行只读工具可重放 | 有限 |
| MCP | 不录协议；MCP client 调用应包在 `tool()` 里 | 不支持 |
| 多进程 | 不支持 | 不支持 |

**接入规则（三条）**：

1. 任何会读外部状态、产生副作用、或网络访问的函数，都包进 `tool()`。
2. 启动时读的配置，放进环境快照白名单；运行中读的配置，包进 `tool()`。
3. 绕过包装器的调用，在 strict 重放中会被 guard 拦截或导致 fixture miss；不会静默通过。

### 7.4 非确定性来源与对策

| 来源 | 录制内容 | 重放策略 | v0.1 |
|---|---|---|---|
| LLM 采样 | 请求 + 完整响应 + usage + finish_reason | 直接回放，不调用模型；指纹校验 | 支持 |
| 模型版本漂移 | model id + response id + 时间 | 严格模式下校验；用于提示“跨模型对比” | 支持 |
| 工具返回 | name + args + result + 异常 | 回放 fixture；写工具显式标注并告警 | 支持 |
| 时钟 | 每次读取的值 | 按序列回放；耗尽后冻结在最后一个值并告警 | 支持 |
| 随机 / UUID | 输出序列 | 按序回放；耗尽即失败 | 支持 |
| 环境变量 | 白名单快照 | 不一致时告警；`--fail-on-env-change` 可失败 | 支持 |
| 并发调度 | span_id + 逻辑序号 | 按 callsite + 指纹回放；写工具顺序不保证 | 有限 |
| 文件系统 / 外部进程 | — | 不承诺；必须包进 `tool()` | 不支持 |
| 数据库写 | SQL + 结果 / 写意图 | 只记录 + 告警，不回滚 | 有限 |

**原则**：宁可显式失败，也不静默产出“看起来重放成功”的假结果。

### 7.5 指纹规范

LLM fixture key：

```
sha256(canonicalJson({
  model,
  messages,
  tools: sortedByName(tools),
  sampling: { temperature, top_p, max_tokens, ... },
  responseFormat
}))
```

- canonical JSON：对象 key 按字典序排序；数组保持顺序；数字使用固定格式；`undefined` 在对象中省略、在数组中转 `null`；拒绝 `NaN` / `Infinity`。
- **只剥离传输元数据**：headers、request-id、时间戳、代理信息。
- **不剥离 message 内容中的时间戳或 id**：message 是语义内容，静默归一化会掩盖真实差异。
- tools 按 `name` 排序后再 hash；每个 schema 内部同样 canonical。
- key 不含 `step_index`；用 `(fingerprint, occurrence)` 区分重复请求。
- `occurrence` 在请求**发出时**同步分配，不在响应返回时分配；这样并发下的分配顺序由代码发起顺序决定。
- Fork 对齐：优先 `callsite`，其次 `(fingerprint, occurrence)`；不使用 `seq` 硬对齐。

Tool fixture key：`sha256(toolName + canonicalJson(args))`，同样带 `occurrence`。

### 7.6 重放模式

| 模式 | 行为 |
|---|---|
| `strict`（默认） | 只读 cassette；阻断真实 LLM / fetch；任何不匹配即失败 |
| `hybrid`（P1） | 首次分歧前只读；之后允许真实调用，live 事件显式标记 |
| `verify` | 同一 run 连续重放两次，比较事件哈希，检测未受控随机性 |

### 7.7 Fork 语义

- 覆盖项：model、temperature、system prompt。
- v0.1 的覆盖是全局的：所有 LLM 调用都使用新配置，因此实际上所有 LLM 步骤都会真实调用模型。`--only-step` 不在 v0.1。
- 被覆盖的 LLM 步骤：真实调用模型，结果写入 variant cassette。
- 未覆盖的 LLM 步骤（为未来 `--only-step` 预留的语义）与工具：使用基线 fixture（closed-world）。
- 上游输出变化导致下游请求变化时，按 callsite 对齐到基线 fixture，并高亮请求差异；这是“只让被改变的变量重新决策”的代价，写进报告。
- 若新路径调用了基线不存在的工具参数，产生 `fixture_miss`，记录为首次分歧；hybrid 模式可继续真实调用。

### 7.8 Diff 与分歧分类

事件对齐：按 `callsite` + `seq`；Fork 模式允许插入/删除事件，用 LCS 对齐后定位 first divergence。

| 类型 | 含义 | 是否错误 |
|---|---|---|
| `fixture_miss` | 请求未被录制 | 是 |
| `request_mismatch` | 同位置请求参数不同 | 是（strict）/ 预期（fork） |
| `tool_exception` | 录制时有异常 / 重放时异常不一致 | 是 |
| `output_changed` | 请求一致但下游结论不同 | 否，正常反事实结果 |
| `nondeterminism_leak` | strict 模式下仍出现未受控随机性 | 是 |

语义 diff：

- 文本：行级 diff + 空白归一化；
- JSON：结构 diff（key 路径）；
- SQL（P2）：`sqlglot` 等价物（TS 侧暂不做）。

### 7.9 数据模型（SQLite）

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  parent_run_id TEXT,
  mode TEXT NOT NULL,              -- recorded | replayed | forked
  status TEXT NOT NULL,            -- recorded | replayed | failed
  command TEXT,
  cwd TEXT,
  git_sha TEXT,
  node_version TEXT,
  platform TEXT,
  config_json TEXT,
  env_json TEXT,
  seed INTEGER,
  metrics_json TEXT
);

CREATE TABLE events (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  span_id TEXT,
  parent_span_id TEXT,
  ts REAL NOT NULL,
  duration_ms REAL,
  callsite TEXT,
  request_hash TEXT,
  response_hash TEXT,
  payload BLOB,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE fixtures (
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,              -- llm | tool | clock | rng | env
  fixture_key TEXT NOT NULL,
  occurrence INTEGER NOT NULL,
  callsite TEXT,
  request_json TEXT,
  response_blob BLOB,
  meta_json TEXT,
  PRIMARY KEY (run_id, kind, fixture_key, occurrence)
);

CREATE TABLE blobs (
  hash TEXT PRIMARY KEY,
  content BLOB NOT NULL,
  encoding TEXT NOT NULL
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  base_run_id TEXT NOT NULL,
  variant_run_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  format TEXT NOT NULL,
  content TEXT NOT NULL,
  summary_json TEXT
);

CREATE INDEX idx_events_run_seq ON events(run_id, seq);
CREATE INDEX idx_fixtures_lookup ON fixtures(run_id, kind, fixture_key);
```

- `meta.schema_version` 记录格式版本。
- 打开旧 cassette 时自动迁移，迁移前写 `.bak` 文件。
- 大对象（长文本、图片）入 `blobs`，事件里存 hash 引用。

### 7.10 CLI 执行模型

- `record` / `replay` / `fork` 都通过 **spawn 原命令** 执行，而不是在 CLI 进程内重跑 Agent。
- 父进程设置环境变量：`FORKPOINT_MODE=record|replay|fork`、`FORKPOINT_RUN_ID`、`FORKPOINT_STORE`、`FORKPOINT_OVERRIDES`。
- 子进程中的 SDK 读取环境变量，切换录制/重放模式。
- 这样“重放的是同一次运行”，而不是“另写一个入口函数”。
- 子进程退出码透传；stderr 保留原始错误，stdout 用于 CLI 结果。

### 7.11 流式处理

- 录制：对 `stream: true` 的响应做 tee；保存 chunk 数组到 blob，重组完整文本与 tool calls；记录 usage 与 finish_reason。
- 重放：返回一个 async iterable，按录制顺序 yield chunk 对象；保持 `for await` 语义。
- 消费者提前 `break`：记录 `stream.aborted`，只保存已消费的 chunk；重放只 yield 这些 chunk，并在报告中标注。
- 流式中的 tool calls 需要按 index 聚合；与 OpenAI SDK 的分片格式保持一致。

### 7.12 全局 patch 与限制

- 安装时 patch：`Date`（无参构造）、`Date.now`、`performance.now`、`Math.random`、`crypto.randomUUID`、`crypto.getRandomValues`。
- 在 patch 之前缓存的函数引用不会被拦截；写进 `limits.md`。
- `new Date(fixed)` 与显式时间参数不受影响。
- 卸载时恢复原函数；支持嵌套安装（栈式）。
- 不在 patch 层做静默吞错；patch 安装失败时启动即失败。

### 7.13 脱敏

- 默认 header：`Authorization`、`api-key`、`x-api-key`、`Cookie`、`Set-Cookie`；录制阶段不写入 headers，导出阶段再按 key 兜底替换。
- env 白名单：`NODE_ENV`、`PATH`、`SHELL` 等；默认不录 `*_KEY`、`*_TOKEN`、`*_SECRET`、`*_PASSWORD`。
- 自定义规则：`{ name, pattern, replacement }`；规则随 run 保存为 `{ name, source, flags, replacement }`，replay / fork 的 variant 继承 baseline 规则。
- 自定义规则在导出时应用，不在录制时改写请求；否则请求指纹变化会破坏 replay / fork 的 fixture 匹配。
- `export --redact` 先应用内置与自定义规则，再扫描 `sk-`、`ghp_`、`AKIA`、`xox[baprs]-` 等模式；命中则列出 JSONL 行号与字段，不自动删除。
- 导出文件标注 `replayable: false`，不提供导入。
- 文档明确：cassette 可能含业务数据，分享前必须人工检查；扫描是安全网，不是 DLP 保证。

### 7.14 分发

- npm 包名 `forkpoint`，2026-10-22 已发布 0.1.0；`npx forkpoint` 可直接运行；`engines.node >= 24`。
- 不做 postinstall 脚本；不下载二进制。
- GitHub repo：`gezibu-max/forkpoint`，public，Apache-2.0。

---

## 8. 非功能需求

| 项 | 要求 |
|---|---|
| 兼容性 | Node.js >= 24；Windows / macOS / Linux |
| 录制开销 | 除模型/工具本身耗时外，P95 < 5% |
| 重放开销 | 单次 fixture 解析 < 5 ms；10k 事件纯重放 < 5 s（不含真实工具执行） |
| 启动开销 | 打开 cassette < 200 ms |
| 可靠性 | strict 模式禁止静默降级；所有不支持边界显式告警 |
| 可移植性 | cassette 单文件可拷贝；跨机器重放不依赖原环境（除 Agent 代码本身） |
| 可观测性 | 错误包含 `run_id`、`seq`、`callsite`、期望/实际指纹 |
| 隐私 | 默认脱敏、无遥测、可完全离线 |
| 可维护性 | 事件使用判别联合类型；无原生依赖；核心模块单测覆盖 |
| 打包 | ESM；`tsup` 构建；不捆绑 `openai` |

---

## 9. 验收标准（v0.1 Definition of Done）

| 编号 | 标准 |
|---|---|
| A1 | 断网、未设置 API key 时 `replay --strict` 成功，文本输出与录制时一致 |
| A2 | `verify` 连续两次重放，事件序列哈希一致；出现未受控随机性时报 `nondeterminism_leak` |
| A3 | `fork --model X` 生成 variant，报告给出 first divergence、结论 diff、token/成本/延迟对比 |
| A4 | 请求参数变化被识别为 `request_mismatch`；结论正常变化标记为 `output_changed`，不误报 |
| A5 | 假 API key、Authorization header 不出现在 cassette 与导出文件中 |
| A6 | strict 重放时写工具不真实执行，并产生显式告警事件 |
| A7 | GitHub Action 示例在 diff 不一致时非零退出，并上传报告 artifact（P1） |
| A8 | README 5 分钟内跑通 quickstart；`docs/limits.md` 列出全部不承诺项 |
| A9 | 20 条 mutation benchmark 产出数字：重放成功率、top-1/top-3 定位准确率、误报率 |
| A10 | `docs/prior-art.md` 点名至少 3 个现有项目，说明重叠与差异 |
| A11 | D14 时 demo 可演示、README 可读、博客初稿完成 |
| A12 | README 中每一条能力声明都能在 demo 中复现；没有未验证的数字或“归因”措辞 |

---

## 10. Mutation Benchmark

### 10.1 设计

- 样本：20 条真实 run（demo agent + 至少 1 个非玩具用例）。
- 注入改动：
  - 5 条：修改 system prompt 中的一句约束；
  - 5 条：替换模型（同厂商不同型号 / 跨厂商）；
  - 5 条：替换工具输出（模拟上游数据变化）；
  - 5 条：修改 tool schema / description（模拟 MCP 工具升级）。
- 每条预先人工标注期望的首次分歧 callsite。

### 10.2 指标

| 指标 | 定义 |
|---|---|
| Replay success | strict 重放成功数 / 20 |
| Top-1 accuracy | 首次分歧 callsite 与标注完全一致 |
| Top-3 accuracy | 标注 callsite 出现在前 3 个候选事件中 |
| False positive rate | 把 `output_changed` 误报为 `nondeterminism_leak` 的比例 |
| Classification accuracy | 分歧类型判断正确的比例 |

### 10.3 报告模板

README 只放一张表 + 一句限制说明：

> 20 条样本，单人标注，不是行业 benchmark；数字用于说明工具在作者自己的用例上是否有效。

---

## 11. 里程碑（3 周，单人）

| 阶段 | 时间 | 交付 |
|---|---|---|
| M1 地基 | D1–D3 | 建仓、schema v1、canonical fingerprint + golden 单测、真实 Text2SQL demo agent、record 骨架 |
| M2 录制 | D4–D7 | OpenAI 包装（含流式）、tool 包装、clock/RNG/env、脱敏、第一条 cassette |
| M3 重放 | D8–D10 | strict replay、guard、最近邻报错、verify；**D10 止损检查** |
| M4 对比 | D11–D14 | fork、diff 报告、20 条 benchmark、README/GIF、decisions/limits/prior-art——**D14 可投** |
| M5 发布 | D15–D21 | 博客、3 分钟视频、GitHub Action、npm 发布、buffer |

**D10 止损**：20 条真实 run 的 strict 重放成功率 < 80%，砍掉 fork，只发 record/replay/diff 的 v0.1。

**D14 门槛**：demo 能在 5 分钟内演示；README、limits、prior-art 完成；否则不写博客，先补核心。

---

## 12. 风险与止损

| 风险 | 影响 | 触发信号 | 应对 |
|---|---|---|---|
| Prior art 挤压 | 差异化被质疑 | 面试官指出已有项目 | 用 §4.5 的诚实声明；只讲严格确定性与定位；README 主动列 prior art |
| npm 名称冲突 | 无法 `npx` | 发布前查询被占 | 备选：`agent-tape`、`tracefork`、`cassette-agent`；先占名再开发 |
| 接入成本高 | 用户放弃 | 外部盲测 README > 30 分钟 | 简化 API：只保留 `wrapOpenAI` + `tool()`；砍掉自定义 adapter |
| 重放不可靠 | 核心价值崩塌 | D10 成功率 < 80% | 砍 fork；只发 strict replay；把限制写清楚 |
| 未插桩随机性 | 假重放 | `verify` 报 leak | 扩大 patch 覆盖；`limits.md` 明确；不承诺文件系统 |
| 流式边界 | 重放卡死/输出不一致 | demo 中流式场景失败 | 先做非流式；流式放 D5，失败则 v0.1 只支持非流式并明说 |
| Windows 兼容 | 无法本地开发 | 路径/换行差异 | 指纹用相对路径 + `/`；CI 跑 Windows |
| 范围膨胀 | 烂尾 | D10 仍在做非 P0 功能 | 严格执行 §2.2；D14 门槛 |
| Overclaim | 面试反噬 | README 出现未验证数字/“归因” | A12 检查；每条声明对应 demo |

---

## 13. 分发与面试叙事

### 13.1 仓库交付物

- `README.md`：一句话、10 秒 GIF（断网重放）、三条命令、prior art、能力边界、benchmark 表。
- `docs/PRD.md`：本文档。
- `docs/SRS.md`：需求说明书。
- `docs/decisions.md`：关键取舍（TS、node:sqlite、不做 MCP、不做 repair）。
- `docs/limits.md`：不承诺项。
- `docs/prior-art.md`：与 agent-replay / agenttape / agent-vcr / agrepl 的对比。
- 技术博客：一次真实 Text2SQL 失败的复现与定位。
- 3 分钟视频：断网重放 + fork + diff。

### 13.2 面试问答准备

**Q：这不是有人做了吗？**

> 有。agent-replay 已经做了本地 SQLite、time 边界、fork/diff/CI；npm 上的 agenttape 做 Claude Code session 的录制回放；agent-vcr 做 TS 的 golden tool-call 断言。我读过它们的 README，也确认了 agent-replay 把 time 列为录制边界。Forkpoint 只押两件事：一是时钟/RNG/env 在重放时受控，而不只是被记录；二是自动 callsite + 首次分歧定位。框架无关的 time-travel 我不做，3 周做不完。

**Q：为什么用 TypeScript？**

> 目标用户是 JS/TS Agent 开发者；`node:sqlite` 零原生依赖，`npx` 在 Windows 上直接跑；`AsyncLocalStorage` 让包装透明；栈帧能自动给出 `file:line`，不需要用户手写步骤标签。代价是 Python 生态覆盖不到，这一点写在 limits 里。

**Q：LLM 是概率采样，怎么能重放？**

> 不重放模型，重放事实。录制时模型的输出已经发生，按请求指纹存下来；重放时不调用模型，只回放。fork 时才调用新模型，而且只让被改的那一步重新决策，其他世界冻结。

**Q：为什么不做 repair / merge？**

> 半真半假的 cassette 会破坏“严格重放”这个唯一卖点。缺失就报错，给最近邻；要么重录，要么 `--allow-live` 探索新路径。

**Q：这个项目的边界是什么？**

> 文件系统、外部进程、MCP 协议、多进程因果、写副作用回滚都不承诺。绕过包装器的调用会被 guard 拦住，不会静默通过。

### 13.3 简历 bullets

**后端向**

- 设计并实现 TypeScript Agent 确定性重放工具 Forkpoint：SQLite 单文件事件存储、canonical JSON 请求指纹、`(fingerprint, occurrence)` 消歧、schema 自动迁移。
- 实现 strict 重放与 live-call guard，断网环境下 20 条真实 run 重放成功率 X/20；首次分歧 top-1 定位准确率 X/20。
- 用 `AsyncLocalStorage` 实现透明上下文传播，支持并行只读工具；Windows/macOS/Linux 通过 CI。

**AI 应用向**

- 实现 LLM/tool/clock/RNG/env 五类边界的录制与重放，覆盖流式响应重组与异常路径。
- 设计 fork + diff：同一基线下替换模型/prompt，自动定位首次分歧并输出成本、延迟对比。
- 构建 20 条 mutation benchmark，量化重放成功率与分歧定位准确率。

---

## 14. 待确认问题

| 编号 | 问题 | 建议 |
|---|---|---|
| Q1 | 招牌 demo 用 Text2SQL 还是客服 Agent | Text2SQL：复用既有经历，能快速做出非玩具失败用例 |
| Q2 | 是否在 v0.1 支持 Vercel AI SDK | 不做；v0.2 候选 |
| Q3 | npm 发布时机 | D21 发 v0.1.0；若 D14 已稳定，可提前发 alpha |
| Q4 | 许可 | Apache-2.0（已定） |
| Q5 | 是否做 HTTP 拦截 | 不做；v0.2 候选，v0.1 用 `tool()` 覆盖 |

---

## 附录 A：事件示例

```json
{
  "seq": 7,
  "runId": "r_01j9z3k2",
  "spanId": "s_7",
  "parentSpanId": "s_3",
  "type": "tool.result",
  "ts": 1761100000.123,
  "durationMs": 12,
  "callsite": "examples/sql-agent/agent.ts:48:9",
  "payload": {
    "name": "list_tables",
    "args": { "db": "sales" },
    "result": ["orders", "customers", "products"],
    "isWrite": false
  }
}
```

## 附录 B：CLI 示例

```bash
# 录制一次失败
npx forkpoint record --name "sql-agent-fail" -- tsx examples/sql-agent.ts

# 断网重放
npx forkpoint replay r_01jabc... --strict

# 换模型做反事实对比
npx forkpoint fork r_01jabc... --model gpt-4.1-mini --system-prompt-file prompts/v2.md
npx forkpoint diff r_01jabc... r_01jabd... -o reports/model-swap.md

# 自检
npx forkpoint verify r_01jabc...

# 脱敏导出
npx forkpoint export r_01jabc... --redact -o exports/sql-agent-fail.jsonl
```

## 附录 C：Prior art 核实记录（2026-10-21）

| 项目 | 核实内容 |
|---|---|
| `clay-good/agent-replay` | 仓库存在；README 表述 "records LLM, tool, and time boundaries via hooks/OTel"；支持 replay、fork、diff、CI gates、本地 SQLite |
| npm `agenttape` 0.5.1 | "Record, replay, diff, and regression-test Claude Code agent sessions"；仓库 `Ishan-sa/agent-tape` |
| npm `agent-vcr` 0.4.0 | "Reliability testing for AI agents in TypeScript..."；仓库 `ajayvnkt/agent-vcr` |
| arXiv 2607.16200 | R. Mudasiru，2026-04-30；MITM proxy 在传输层拦截外部交互；Go / MIT |
| npm `forkpoint` | 未被占用（404） |
| Node `node:sqlite` | 本机 Node 24.15 验证可用，零原生依赖 |
