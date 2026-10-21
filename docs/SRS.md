# Forkpoint 需求说明书（SRS）

- 版本：v0.1
- 日期：2026-10-21
- 状态：Draft
- 对应产品文档：`docs/PRD.md` v0.2
- 适用范围：v0.1（TypeScript SDK + CLI，Node.js >= 24）
- 读者：实现者、代码评审者、面试中的技术追问者

---

## 1. 引言

### 1.1 目的

本文档把 `docs/PRD.md` 中的产品目标转化为可实现、可测试的需求。每条功能需求包含输入、处理、输出、异常与验收标准；每条需求都能追溯到验收项（§7）。

### 1.2 范围

Forkpoint v0.1 交付：

- 一个 TypeScript SDK：包装 OpenAI 兼容客户端与工具函数，录制一次 Agent 运行。
- 一个 CLI：`record` / `ls` / `show` / `replay` / `fork` / `diff` / `verify` / `export`。
- 一个本地 cassette 格式：SQLite 单文件，带 `schema_version` 与自动迁移。
- 一套严格重放与 fork/diff 能力。
- 一组面向作品集的文档与 benchmark。

不在范围内：托管服务、Web UI、Python SDK、MCP 协议录制、HTTP 通用拦截、多进程因果追踪、工具副作用回滚、`repair` / `merge`。

### 1.3 术语

| 术语 | 定义 |
|---|---|
| Run | 一次完整 Agent 执行，由 `fp.run(name, fn)` 界定 |
| Event | 边界事件，按 `seq` 单调递增写入 |
| Fixture | 某个边界请求对应的录制结果 |
| Cassette | 一次 Run 的全部事件、fixture 与元数据（SQLite 单文件） |
| Fingerprint | 请求的规范化 SHA-256 |
| Occurrence | 同一 fingerprint 在同一次 Run 中的第几次出现（从 0 开始） |
| Callsite | 从栈帧提取的 `相对路径:行:列` |
| Strict | 只读 cassette、阻断真实调用、不匹配即失败 |
| Fork | 以基线 Run 为基础，覆盖 LLM 配置后重新执行 LLM 步骤 |
| First divergence | 两条 Run 对齐后第一个不一致的事件 |

### 1.4 参考文档

- `docs/PRD.md` v0.2
- OpenAI Node SDK 文档（`chat.completions`、`responses`、streaming）
- Node.js `node:sqlite` 文档
- arXiv 2607.16200，Deterministic Replay for AI Agent Systems
- `clay-good/agent-replay`、npm `agenttape`、npm `agent-vcr` 的 README

### 1.5 读者对象

实现者按 §3、§4 编码；评审者按 §5、§7 验收；面试官可按 §2、§8 快速理解边界。

---

## 2. 总体描述

### 2.1 产品视角

Forkpoint 是一个**进程内 SDK + 本地 CLI**：

```
Agent 进程（子进程）
  ├── Forkpoint SDK（录制/重放/守护）
  └── OpenAI SDK / 工具函数
          │
          ▼
    .forkpoint/cassette.sqlite
          ▲
          │
Forkpoint CLI（父进程：record / replay / fork / diff / verify / export）
```

- 父进程负责生命周期、cassette 管理、报告生成。
- 子进程负责执行 Agent 代码；通过环境变量切换模式。
- 无服务端、无遥测、无外部依赖。

### 2.2 用户类别

| 类别 | 使用方式 | 关键诉求 |
|---|---|---|
| Agent 开发者 | SDK + CLI | 5 分钟接入；失败可复现；不烧 token |
| Tech Lead | CLI + CI | 模型/prompt 变更可对比；CI 可卡住回归 |
| 面试官 / 评审者 | README + 文档 + demo | 取舍清楚；边界诚实；数字可验证 |

### 2.3 运行环境

- Node.js >= 24（依赖内置 `node:sqlite`）。
- ESM 包；不支持 CommonJS `require`（v0.1）。
- Windows / macOS / Linux。
- 本地文件系统可写。
- 无需网络即可重放；录制与 fork 需要网络与 API key。

### 2.4 约束

- 不引入原生依赖（避免 Windows 编译工具链）。
- 不引入重量级框架；`openai` 作为 peer dependency。
- cassette 必须是单文件；不能依赖 `-wal` / `-shm` 旁文件长期存在。
- 所有存储默认本地；不得自动上传。
- 核心逻辑不得依赖全局单例以外的隐式状态；并发通过 `AsyncLocalStorage` 传播。

### 2.5 假设与依赖

- Agent 代码可由同一条命令重复启动，且启动入口确定。
- 所有外部状态访问都通过 LLM 客户端或 `tool()` 包装；未包装的访问不在承诺范围内。
- 工具参数与返回值可 JSON 序列化。
- 录制时使用的模型仍可通过 fork 访问；否则 fork 失败并报错。
- `git` 可选；无 git 时元数据为 `null`，不阻塞录制。

### 2.6 设计原则

1. **显式失败**：任何无法保证一致的情况都必须报错或告警，不静默降级。
2. **边界而非全局**：只对声明支持的边界负责；文件系统、外部进程、MCP 协议不承诺。
3. **不造假**：不提供交互式补 fixture、不合并两条 Run 的因果链。
4. **本地优先**：零遥测、单文件、可离线。
5. **可解释**：错误信息必须能让使用者定位到 `seq` 与 `callsite`。

---

## 3. 功能需求

优先级：P0 = v0.1 必须；P1 = v0.1 尽量；P2 = 后续版本。

### FR-001 Run 生命周期与公共 API

- **优先级**：P0
- **描述**：提供 `Forkpoint` 类与 `tool()` 工厂；一次进程内只允许一个活动 Run。
- **输入**：
  - `new Forkpoint(options)`：`store?: string`（默认 `.forkpoint`）、`mode?: "record" | "replay" | "fork" | "off"`、`redact?: RedactionRule[]`、`envWhitelist?: string[]`、`pricing?: PricingTable`。
  - `fp.run<T>(name: string, fn: () => Promise<T>): Promise<T>`。
- **处理**：
  - 模式解析顺序：构造参数 > 环境变量 `FORKPOINT_MODE` > `"off"`。
  - `off`：所有包装器直接透传，不写文件、不装 guard。
  - `record`：创建 `runs` 行，写 `run.start`，采集元数据；Run 结束写 `run.end`（含状态与 metrics）。
  - `replay` / `fork`：`FORKPOINT_RUN_ID` 是本次新写入的 variant Run，`FORKPOINT_BASELINE_RUN_ID` 是只读基线；从基线加载 fixture，事件写入 variant；结束写 `run.end`。baseline 不被修改，variant 的 `parent_run_id` 指向 baseline，最终状态为 `replayed`。
  - 嵌套 `fp.run` 抛出 `NestedRunError`。
- **输出**：`fn` 的返回值原样返回；cassette 落盘。Run ID 格式为 `r_` + 26 位 Crockford Base32（ULID），由 CLI 父进程在安装时钟 patch 之前生成。
- **异常**：
  - 无活动 Run 时调用包装边界 → `NoActiveRunError`（`record` / `replay` 模式）。
  - Run 内未捕获异常：记录 `run.end` 状态 `failed`，原样抛出。
- **验收**：demo 录制后 `runs` 有 1 行、`events` 首尾为 `run.start` / `run.end`；`off` 模式不创建 `.forkpoint`。

### FR-002 OpenAI 客户端包装（非流式）

- **优先级**：P0
- **描述**：`fp.wrapOpenAI(client)` 返回一个代理对象，拦截 `chat.completions.create` 与 `responses.create`（若存在）。
- **输入**：OpenAI 兼容客户端实例；请求参数对象。
- **处理**：
  - 保留原 `this` 与返回类型；不修改调用方传入的对象。
  - 计算请求指纹（§4.4），分配 `occurrence`（FR-010）。
  - 记录 `llm.request` 事件；真实调用；记录 `llm.response` 事件（完整响应 JSON、usage、finish_reason、response id、耗时）。
  - `AbortSignal` 中止：记录 `llm.error`（`AbortError`），原样抛出；重放时在同一位置抛出相同错误。
  - replay 模式：按 `(fingerprint, occurrence)` 查 fixture；命中则返回深拷贝；未命中抛 `FixtureMissError`（FR-013），**不得调用真实客户端**。
- **输出**：与原始 SDK 兼容的响应对象。
- **异常**：`FixtureMissError`、`LiveCallBlockedError`、`NonSerializableError`。
- **验收**：同一请求重放返回逐字段相同的响应；断网时可完成；请求对象未被修改。

### FR-003 流式响应录制与重放

- **优先级**：P0
- **描述**：支持 `stream: true` 的 `chat.completions.create` 与 `responses.create`。
- **输入**：流式请求；消费者通过 `for await` 读取。
- **处理**：
  - 录制：对原始流做 tee；保存 chunk 数组到 `blobs`；聚合完整文本与 tool calls；记录 usage 与 finish_reason。
  - 返回对象需兼容：`[Symbol.asyncIterator]`、`controller`（AbortController）。
  - 消费者提前 `break`：记录 `stream.aborted` 事件；仅保存已消费 chunk；重放只 yield 这些 chunk，并在报告中标注。
  - 重放：返回 async iterable，按序 yield 录制 chunk 的深拷贝；不发起网络请求。
  - 流中错误：记录 `llm.error`；重放时在相同 chunk 之后抛出相同错误。
- **输出**：与录制时相同顺序与内容的 chunk 序列。
- **异常**：`FixtureMissError`；不支持的流式方法（如 `tee()` 之外的 SDK 扩展）给出 `UnsupportedStreamMethodError`。
- **验收**：
  - 非流式与流式 demo 各 1 个通过；
  - 提前 break 的 Run 可重放，且报告标注 `stream.aborted`；
  - 重放后聚合文本与录制时逐字节一致。
- **限制**：v0.1 不保证与 OpenAI SDK `Stream` 类的所有辅助方法兼容，只保证 async iterable 与 `controller.abort()`。

### FR-004 工具包装

- **优先级**：P0
- **描述**：`tool(name, fn, opts?)` 返回同签名函数，录制参数、结果、异常、耗时。
- **输入**：`name: string`；`fn: (...args) => TResult | Promise<TResult>`；`opts?: { write?: boolean; label?: string }`。
- **处理**：
  - record：执行真实函数；成功写 `tool.result`，异常写 `tool.error` 并原样抛出。
  - strict replay：不执行真实函数；按 `(toolName, args)` 指纹取 fixture；命中返回深拷贝；未命中抛 `FixtureMissError`。
  - `write: true`：strict replay 不执行，写 `replay.warning` 事件，返回录制结果；报告中列为副作用风险。
  - fork：工具一律使用基线 fixture，不执行。
  - `off`：直接执行。
  - 参数/返回值必须 JSON 可序列化；否则 `NonSerializableError`（含工具名与路径）。
  - 嵌套调用：通过 `AsyncLocalStorage` 继承 `spanId`。
- **输出**：工具返回值。
- **异常**：`FixtureMissError`、`NonSerializableError`、`ToolExecutionError`（重放时录制异常与当前不一致）。
- **验收**：写工具在 strict 重放中零执行（用计数器断言）；异常路径可重放；参数不同触发 `request_mismatch`。

### FR-005 时钟边界

- **优先级**：P0
- **描述**：录制并重放 `Date.now()`、`new Date()`（无参）、`performance.now()`。
- **输入**：Agent 代码中的时间读取。
- **处理**：
  - Run 开始时安装 patch；结束时按栈恢复原实现。
  - 每次读取写 `clock.now` 事件（值、来源 `date.now|date.ctor|performance`）。
  - 单 Run 上限 10,000 次；超过抛 `ClockReadLimitError`，提示检查日志循环。
  - replay：按顺序消费；耗尽后冻结在最后一个值，写 `replay.warning`；若从未录制，冻结在 `run.start` 时间并告警。
  - `new Date(arg)`、`Date.parse`、`Date.UTC` 不受影响。
- **输出**：虚拟时间值。
- **异常**：`ClockReadLimitError`。
- **验收**：带 `Date.now()` 分支的 demo 重放走同一分支；`verify` 两次哈希一致；`limits.md` 说明 patch 前缓存引用的限制。

### FR-006 随机数与 UUID 边界

- **优先级**：P0
- **描述**：录制并重放 `Math.random()`、`crypto.randomUUID()`、`crypto.getRandomValues()`。
- **输入**：Agent 代码中的随机读取。
- **处理**：
  - 统一写入 `rng` 序列，每项含 `{ source, value }`；`getRandomValues` 记录 base64 数组。
  - replay：按序消费；`source` 不匹配抛 `RngMismatchError`；耗尽抛 `RngExhaustedError`（不冻结、不补值）。
  - 不拦截第三方库自带的 PRNG；写入 `limits.md`。
- **输出**：与录制时相同的随机值。
- **异常**：`RngMismatchError`、`RngExhaustedError`。
- **验收**：使用 `crypto.randomUUID()` 生成 id 的 demo 重放得到相同 id；`verify` 两次一致；缺少录制时严格失败。

### FR-007 环境快照

- **优先级**：P0
- **描述**：录制 Run 启动时的白名单环境变量与依赖锁文件 hash。
- **输入**：`envWhitelist?: string[]`；默认 `NODE_ENV`、`CI`、`TZ`、`LANG`。
- **处理**：
  - 默认排除 `*_KEY`、`*_TOKEN`、`*_SECRET`、`*_PASSWORD`。
  - 锁文件：`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`，取第一个存在者，SHA-256。
  - replay 时比较；差异写 `replay.warning`；`--fail-on-env-change` 时抛 `EnvChangedError`。
- **输出**：`env.snapshot` 事件与 `runs.env_json`。
- **异常**：`EnvChangedError`。
- **验收**：修改白名单变量后重放出现告警；敏感变量永不出现在 cassette。

### FR-008 运行元数据

- **优先级**：P0
- **描述**：采集可复现所需的运行上下文。
- **输入**：CLI 传入的 `command`、`cwd`；进程信息。
- **处理**：
  - 记录：git SHA（best-effort）、Node 版本、平台、架构、cwd、命令、锁文件 hash、`config_json`、可选 seed。
  - 不记录完整环境变量、不记录 API key。
- **输出**：`runs` 行。
- **异常**：无 git 时字段为 `null`，不报错。
- **验收**：`forkpoint show <id>` 能看到上述字段；API key 不在其中。

### FR-009 请求指纹

- **优先级**：P0
- **描述**：对 LLM 与工具请求生成稳定、跨机器一致的指纹。
- **输入**：请求对象。
- **处理**：
  - Canonical JSON 规则见 §4.4。
  - LLM 字段：`model`、`messages`、`tools`（按 name 排序）、`sampling`（temperature/top_p/max_tokens 等）、`responseFormat`、`stream`。
  - **剥离**：headers、request-id、时间戳、代理信息、api key。
  - **不剥离**：message 内容中的时间戳、id、文本；tools schema 内部字段。
  - SHA-256 十六进制小写。
  - 提供 5 组 golden test vector（含 key 顺序、浮点、Unicode、嵌套 tools、null/undefined）。
- **输出**：64 字符指纹。
- **异常**：`NonSerializableError`；循环引用检测。
- **验收**：同一请求跨进程、跨机器（不同 cwd）指纹一致；仅 header 变化的请求指纹一致；message 内容变化指纹改变。

### FR-010 Occurrence 分配

- **优先级**：P0
- **描述**：区分同一 Run 中重复出现的相同请求。
- **输入**：`(kind, fingerprint)`。
- **处理**：
  - 内存计数器在请求**发起时**同步自增，分配 `occurrence`。
  - 写入 fixture 主键 `(run_id, kind, fixture_key, occurrence)`。
  - replay 用相同规则分配；按三元组查找。
  - 并发相同请求的分配顺序由代码发起顺序决定；若发起顺序本身不确定，strict 重放显式失败。
- **输出**：`occurrence` 整数。
- **异常**：无。
- **验收**：循环调用同一 LLM 请求 3 次，fixture 有 3 条 occurrence 0/1/2；重放按序命中；交换返回顺序会导致显式失败，不静默错配。

### FR-011 Cassette 存储与版本迁移

- **优先级**：P0
- **描述**：单文件 SQLite 存储事件、fixture、blob、报告。
- **输入**：事件与 fixture。
- **处理**：
  - 使用 `node:sqlite` 的 `DatabaseSync`。
  - `journal_mode=DELETE`、`synchronous=NORMAL`；退出前 `close()`，确保不遗留 `-wal` / `-shm`。
  - `meta.schema_version` 写入当前版本；打开旧版本时自动迁移，迁移前写 `<store>.bak`。
  - 每 50 个事件提交一次；Run 结束时强制提交。
  - 大对象入 `blobs`，按 SHA-256 去重；事件存 hash 引用。
  - 单 cassette 超过 50 MB 时 CLI 告警。
- **输出**：`.forkpoint/cassette.sqlite`。
- **异常**：迁移失败时保留 `.bak` 并抛 `MigrationError`；数据库损坏抛 `CassetteCorruptError`。
- **验收**：强制杀掉进程后已提交事件可读；旧 schema 文件可自动迁移；单文件可拷贝到另一台机器重放。

### FR-012 严格重放与 Live Guard

- **优先级**：P0
- **描述**：在 replay 模式下阻断一切真实外部调用。
- **输入**：`forkpoint replay <run_id> --strict`。
- **处理**：
  - 父进程先创建 variant 行（`mode=replayed`、`parent_run_id=<baseline>`、`status=recording`），再 spawn 原始命令，设置 `FORKPOINT_MODE=replay`、`FORKPOINT_RUN_ID=<variant>`、`FORKPOINT_BASELINE_RUN_ID=<baseline>`、`FORKPOINT_STORE`。
  - SDK 构造时安装 guard：包装客户端在 replay 下永不调用真实 API；`globalThis.fetch` 被替换为抛 `LiveCallBlockedError`。
  - 包装工具在 replay 下不执行原函数。
  - guard 在 Run 结束后恢复。
  - `--allow-live` 仅在 hybrid 模式（P1）可用；v0.1 传入时报用法错误。
- **输出**：重放事件序列；子进程 stdout/stderr 透传。
- **异常**：`LiveCallBlockedError`（含 callsite 与 URL/模型名）。
- **验收**：断网、删除 API key 后 demo 重放成功；直接调用 `fetch` 的代码被拦截；重放期间无任何网络请求。

### FR-013 失败诊断

- **优先级**：P0
- **描述**：任何 fixture 不匹配都必须给出可操作的上下文。
- **输入**：失败请求。
- **处理**：
  - 错误对象字段：`code`、`runId`、`seq`、`callsite`、`expectedKey`、`actualKey`、`nearest[]`、`hint`。
  - `nearest[]`：最多 3 个，按字段差异数排序；每项含 `key`、`callsite`、`diffPaths`。
  - CLI 默认输出人类可读块；`--json` 输出结构化 JSON。
- **输出**：错误信息与退出码 1。
- **异常**：无。
- **验收**：改 system prompt 后重放，错误能指出 `messages[0].content` 变化，并列出最近邻；用户不需读源码即可定位。

### FR-014 事件哈希与 verify

- **优先级**：P0
- **描述**：检测未受控随机性，验证工具自身的确定性。
- **输入**：`forkpoint verify <run_id>`。
- **处理**：
  - 以 strict 模式启动两个独立子进程，各重放一次。
  - 事件哈希：对 `(seq, type, spanId, parentSpanId, callsite, requestHash, responseHash, stablePayloadHash)` 计算 SHA-256；**排除** `ts`、`durationMs`。
  - 比较两次序列哈希与逐事件哈希。
  - 不一致时输出首个差异 `seq`，分类为 `nondeterminism_leak`。
  - 额外检查：未被消费的 fixture 数量（warning，不失败）。
- **输出**：通过/失败；差异详情。
- **异常**：`NondeterminismError`。
- **验收**：故意在工具里用未 patch 的随机源，`verify` 报 leak；正常 demo 连续两次通过。

### FR-015 Fork 覆盖

- **优先级**：P0
- **描述**：以基线 Run 为基础，替换模型、温度、system prompt，重新执行 LLM 步骤。
- **输入**：
  - `forkpoint fork <run_id> --model <model> [--temperature <n>] [--system-prompt-file <path>] [--name <name>]`。
  - 至少一个覆盖项；否则用法错误。
- **处理**：
  - v0.1 覆盖是**全局**的：所有 LLM 调用使用新 model / temperature；system prompt 替换规则为——移除所有 `system` 消息，在最前面插入一条新的 `system` 消息。
  - 被覆盖的 LLM 步骤真实调用模型；响应写入 variant cassette。
  - 工具调用一律使用基线 fixture，不执行（closed-world）。
  - variant Run 记录 `parent_run_id`、`mode=forked`、`config_json.overrides`。
  - 不覆盖工具 schema；`--toolset-version` 不在 v0.1。
- **输出**：新的 `run_id`。
- **异常**：基线不存在、模型不可用、网络失败 → 非零退出，保留已写入事件。
- **验收**：同一基线换模型后生成 variant；报告给出首次分歧；写工具零执行；`parent_run_id` 正确。

### FR-016 Callsite 提取

- **优先级**：P0
- **描述**：自动从栈帧生成步骤标签，避免手写 `step_label`。
- **输入**：包装器被调用的位置。
- **处理**：
  - 使用 `new Error().stack`，跳过 `node:`、`internal/`、`node_modules/`、`src/core/`、`src/boundaries/` 帧。
  - 取第一个业务帧，转为相对 `process.cwd()` 的路径，统一 `/`，格式 `path:line:col`。
  - 失败时返回 `"unknown"` 并写 warning；`tool(..., { label })` 可覆盖。
  - v0.1 不解析 source map；`tsx` / `ts-node` 直接运行可获得源码位置，打包产物可能指向 bundle。
- **输出**：`callsite` 字符串。
- **异常**：无（降级为 `unknown`）。
- **验收**：demo 中每个事件都有可读 callsite；Windows 路径不出现反斜杠；fork 对齐在 callsite 上稳定。

### FR-017 Fork 对齐与 closed-world

- **优先级**：P0
- **描述**：在请求变化时仍能把 variant 与基线对齐，定位首次分歧。
- **输入**：基线 Run、variant Run。
- **处理**：
  - v0.1 对齐键：`(kind, callsite, 同 callsite 内 ordinal)`；tool 额外带 name；缺少 callsite 时按 `unknown` 分组。
  - fingerprint 只用于配对后的比较，不作为对齐键，避免改 prompt / 模型后指纹全变导致所有步骤失配。
  - 未配对步骤标记 `missing_step` / `added_step`；分支重排的序列对齐（LCS）不在 v0.1。
  - 工具 fixture 一律来自基线；若 variant 请求了基线不存在的工具参数，记录 `fixture_miss`。
  - 对齐但请求不同的事件，记录 `request_mismatch` 并高亮差异字段。
  - 报告注明所用的对齐策略。
- **输出**：对齐结果与首次分歧。
- **异常**：无法对齐时以 `seq` 兜底并警告。
- **验收**：改 prompt 后，即使第 1 步请求变化，仍能对齐到同一 callsite 并定位分歧；不会因指纹全变而只报“第 1 步”。

### FR-018 Diff 报告

- **优先级**：P0
- **描述**：输出人类可读的 Markdown 报告；P1 输出 JSON。
- **输入**：`forkpoint diff <base> <variant> [-o <file>] [--format md|json]`。
- **处理**：
  - 报告章节：Summary、First divergence、Event timeline、Cost & latency、Caveats。
  - 最终输出 diff：文本按行；JSON 按 key 路径。
  - 指标：步数、LLM 调用次数、token、估算成本、延迟。
  - 成本使用录制时 pricing 快照；`--pricing-file` 可覆盖；标注“基于录制时价格”。v0.1 报告暂只输出 token 与延迟，成本估算留到有 pricing 快照之后。
  - JSON 格式（P1）字段见 §4.6。
- **输出**：Markdown 或 JSON 文件/标准输出。
- **异常**：Run 不存在或类型不匹配 → 退出码 2。
- **验收**：报告能回答“结论变了吗、从哪一步开始变、贵了多少/慢了多少”；`output_changed` 不被标为错误。

### FR-019 分歧分类

- **优先级**：P0
- **描述**：给首次分歧一个稳定、可断言的原因类型。
- **输入**：对齐后的两个事件序列。
- **处理**：按优先级判定：
  1. `nondeterminism_leak`：verify 发现未受控随机性；
  2. `fixture_miss`：请求无对应 fixture；
  3. `request_mismatch`：同位置请求参数不同；
  4. `tool_exception`：录制异常与重放异常不一致；
  5. `output_changed`：请求一致但最终输出不同。
- **输出**：`kind` + `severity`（`error` / `expected` / `info`）。
- **异常**：无法分类时 `unclassified`，附证据。
- **验收**：A4 场景通过；fork 中的 `request_mismatch` 标为 `expected`，不导致 CI 失败；strict 中的同类标为 `error`。

### FR-020 脱敏与导出

- **优先级**：P0
- **描述**：保证 cassette 可安全分享。
- **输入**：`forkpoint export <run_id> --redact [-o <file>]`；自定义规则。
- **处理**：
  - 默认 header：`Authorization`、`api-key`、`x-api-key`、`Cookie`、`Set-Cookie`。
  - 默认敏感 env：`*_KEY`、`*_TOKEN`、`*_SECRET`、`*_PASSWORD`。
  - 自定义规则：`{ name, pattern, replacement }`，按顺序应用。
  - 导出 JSONL：首行 meta，随后每行一个 event，再每行一个 fixture。
  - 导出后扫描 `sk-`、`ghp_`、`AKIA`、`xox[baprs]-` 等模式；命中列出行号与字段，不自动删除。
  - 不做“猜测性”替换；只替换已知规则。
- **输出**：脱敏文件 + 扫描报告。
- **异常**：规则非法 → 退出码 2。
- **验收**：A5 通过；导出文件 grep 不到假 key；扫描能发现故意植入的 `sk-test-...`。

### FR-021 CLI

- **优先级**：P0
- **描述**：提供完整命令集与稳定退出码。
- **输入/输出**：

| 命令 | 关键参数 | 输出 |
|---|---|---|
| `record` | `--name`、`--store`、`-- <command...>` | 新 `run_id` |
| `ls` | `--json`、`--limit` | Run 列表 |
| `show` | `<run_id>`、`--json`、`--events` | Run 元数据与事件 |
| `replay` | `<run_id>`、`--strict`、`--store`、`--fail-on-env-change` | 子进程输出 + 结果 |
| `fork` | `<run_id>`、`--model`、`--temperature`、`--system-prompt-file`、`--name` | 新 `run_id` |
| `diff` | `<base> <variant>`、`-o`、`--format` | 报告 |
| `verify` | `<run_id>` | 通过/失败 |
| `export` | `<run_id>`、`--redact`、`-o` | 导出文件 |

- **处理**：
  - 全局 `--store`、`--json`、`--verbose`、`--debug`。
  - `record` 透传子进程 stdout/stderr；子进程失败仍保存 cassette，状态 `failed`。
  - `replay` / `fork` 通过环境变量注入上下文，不修改用户代码。
  - 退出码：0 成功；1 重放/校验失败；2 用法错误。
- **验收**：README 中的命令逐条可执行；`--json` 输出可被 `jq` 解析；错误不打印堆栈（除非 `--debug`）。

### FR-022 GitHub Action（P1）

- **优先级**：P1
- **描述**：提供 composite action 示例，让行为回归可卡在 CI。
- **输入**：`run-id`、`store`、可选 `command`、`report-path`。
- **处理**：
  - 安装 Node 24、`npm ci`、还原脱敏 cassette（artifact 或仓库文件）。
  - 执行 `replay --strict` 与 `diff`，上传报告 artifact。
  - 失败时非零退出。
- **输出**：CI 日志、报告 artifact。
- **验收**：A7 通过；README 给出金标 run 维护步骤。

### FR-023 Mutation Benchmark（开发工具）

- **优先级**：P0（作品集交付物）
- **描述**：内部脚本，量化重放与定位能力。
- **输入**：20 条真实 Run + 变更清单（prompt/model/tool output/tool schema 各 5）+ 人工标注的期望首次分歧 callsite。
- **处理**：
  - 对每条基线执行变更，生成 variant，运行 diff。
  - 记录：重放成功率、top-1/top-3 定位准确率、误报率、分类准确率。
  - 输出 `bench/results.md` 与 `bench/results.json`。
- **输出**：README 表格 + 限制说明。
- **验收**：A9 通过；数字可被脚本复现；不宣称行业 benchmark。

### FR-024 错误模型与退出码

- **优先级**：P0
- **描述**：统一错误类型，便于 CLI 与测试断言。
- **处理**：
  - 基类 `ForkpointError`，字段 `code`、`runId?`、`seq?`、`callsite?`、`hint?`。
  - 子类：`FixtureMissError`、`RequestMismatchError`、`LiveCallBlockedError`、`RngMismatchError`、`RngExhaustedError`、`ClockReadLimitError`、`NoActiveRunError`、`NestedRunError`、`NonSerializableError`、`EnvChangedError`、`NondeterminismError`、`CassetteCorruptError`、`MigrationError`、`UnsupportedStreamMethodError`。
  - CLI 退出码映射：数据/重放错误 → 1；用法/参数错误 → 2。
- **验收**：每个错误码有单测；CLI 输出含 `code` 与下一步建议。

---

## 4. 外部接口需求

### 4.1 SDK API

```ts
import OpenAI from "openai";
import { Forkpoint, tool } from "forkpoint";

const fp = new Forkpoint({
  store: ".forkpoint",
  mode: "record",              // 可选；默认读 FORKPOINT_MODE，否则 off
  redact: [{ name: "internal-id", pattern: /int_[a-z0-9]+/g, replacement: "[REDACTED]" }],
  envWhitelist: ["NODE_ENV", "TZ"],
});

const client = fp.wrapOpenAI(new OpenAI());

const runSql = tool(
  "run_sql",
  async (sql: string): Promise<Row[]> => db.all(sql),
  { write: false, label: "execute_sql" }
);

await fp.run("sql-agent-fail", async () => {
  return agent(client, runSql, "上个月销售额最高的 10 个客户");
});
```

约束：

- `tool()` 的返回函数保持原参数与返回类型。
- `wrapOpenAI()` 返回类型与入参一致（类型层面通过交叉类型保留）。
- `mode: "off"` 时不得产生任何文件系统写入。

### 4.2 CLI

全局：

```
forkpoint <command> [options]
  --store <dir>     默认 .forkpoint
  --json            机器可读输出
  --verbose
  --debug           打印堆栈
```

命令与退出码见 FR-021。

### 4.3 事件模型

```ts
type Event =
  | { type: "run.start"; payload: { name: string; mode: Mode; parentRunId?: string } }
  | { type: "run.end"; payload: { status: "ok" | "failed"; error?: string } }
  | { type: "llm.request"; payload: { provider: string; model: string; stream: boolean; request: unknown } }
  | { type: "llm.response"; payload: { response: unknown; usage?: Usage; finishReason?: string; responseId?: string; stream: boolean } }
  | { type: "llm.chunk"; payload: { index: number; chunk: unknown } }
  | { type: "llm.error"; payload: { name: string; message: string; aborted: boolean } }
  | { type: "tool.call"; payload: { name: string; args: unknown; isWrite: boolean } }
  | { type: "tool.result"; payload: { name: string; result: unknown } }
  | { type: "tool.error"; payload: { name: string; errorName: string; message: string } }
  | { type: "clock.now"; payload: { source: string; value: number } }
  | { type: "rng.value"; payload: { source: string; value: string } }
  | { type: "env.snapshot"; payload: { env: Record<string, string>; lockfileHash?: string } }
  | { type: "replay.warning"; payload: { code: string; message: string } }
  | { type: "stream.aborted"; payload: { consumed: number } };

interface EventRecord {
  runId: string;
  seq: number;
  spanId?: string;
  parentSpanId?: string;
  type: Event["type"];
  ts: number;
  durationMs?: number;
  callsite?: string;
  requestHash?: string;
  responseHash?: string;
  payload: unknown;
}
```

（上面 `tool.error` 的 payload 应为 `{ name, errorName, message }`；实现时以类型定义为准。）

### 4.4 Canonical JSON 与指纹

规则：

1. 对象 key 按 UTF-16 码元字典序升序；数组保持顺序。
2. 字符串原样；Unicode 不转义（除 JSON 必需字符）。
3. 数字：使用 ECMAScript 的 `Number::toString` 表示；`-0` 归一为 `0`；拒绝 `NaN` / `Infinity`。
4. `undefined`：对象属性省略；数组元素转 `null`。
5. `null` 保留。
6. 循环引用抛 `NonSerializableError`。
7. 函数、Symbol、BigInt 抛 `NonSerializableError`。

LLM 指纹输入：

```json
{
  "model": "gpt-4.1-mini",
  "messages": [ ... ],
  "tools": [ ... ],
  "sampling": { "temperature": 0.2, "top_p": 1, "max_tokens": 1024 },
  "responseFormat": null,
  "stream": false
}
```

剥离：HTTP headers、`x-request-id`、`openai-organization`、时间戳、baseURL 中的 query/token。

工具指纹输入：

```json
{ "tool": "run_sql", "args": { "sql": "select 1" } }
```

### 4.5 SQLite Schema

见 `docs/PRD.md` §7.9。实现时以 `src/store/schema.ts` 为准，`meta.schema_version` 初始为 `1`。

### 4.6 Report JSON（P1）

```json
{
  "schemaVersion": 1,
  "base": "r_...",
  "variant": "r_...",
  "summary": {
    "outputChanged": true,
    "steps": { "base": 9, "variant": 9 },
    "llmCalls": { "base": 4, "variant": 4 },
    "tokens": { "base": 1234, "variant": 1198 },
    "costUsd": { "base": 0.012, "variant": 0.004 },
    "latencyMs": { "base": 8200, "variant": 5100 }
  },
  "firstDivergence": {
    "seq": 4,
    "callsite": "examples/sql-agent/agent.ts:48:9",
    "kind": "request_mismatch",
    "severity": "expected",
    "expectedKey": "...",
    "actualKey": "...",
    "diffPaths": ["messages[2].content"]
  },
  "caveats": ["pricing based on recorded snapshot", "alignment by callsite"]
}
```

### 4.7 环境变量

| 变量 | 用途 | 设置方 |
|---|---|---|
| `FORKPOINT_MODE` | `record` / `replay` / `fork` / `off` | CLI 父进程 |
| `FORKPOINT_RUN_ID` | 当前正在写入的 Run（record 的 baseline，或 replay 的 variant） | CLI 父进程 |
| `FORKPOINT_BASELINE_RUN_ID` | replay / fork 时读取 fixture 的只读基线 | CLI 父进程 |
| `FORKPOINT_STORE` | cassette 目录 | CLI 父进程 |
| `FORKPOINT_OVERRIDES` | fork 覆盖项 JSON | CLI 父进程 |
| `FORKPOINT_DEBUG` | 打印内部日志 | 用户 |

---

## 5. 非功能需求

| 编号 | 类别 | 要求 | 验证方式 |
|---|---|---|---|
| NFR-001 | 性能 | 录制开销（不含模型/工具耗时）P95 < 5% | demo 基准：100 次边界调用，对比 `off` 与 `record` |
| NFR-002 | 性能 | fixture 解析 < 5 ms；10k 事件纯重放 < 5 s | 微基准 |
| NFR-003 | 性能 | 打开 cassette < 200 ms | 微基准 |
| NFR-004 | 兼容性 | Node >= 24；Windows / macOS / Linux | GitHub Actions 三平台 |
| NFR-005 | 可靠性 | strict 模式无静默降级；未支持边界显式告警 | 代码审查 + 故障注入测试 |
| NFR-006 | 安全 | 默认脱敏；无遥测；可完全离线 | grep 测试 + 断网测试 |
| NFR-007 | 可移植性 | cassette 单文件可拷贝；跨机器重放 | 虚拟机/另一目录测试 |
| NFR-008 | 可观测性 | 错误含 `run_id`、`seq`、`callsite`、指纹 | 错误快照测试 |
| NFR-009 | 可维护性 | 事件判别联合；关键路径（fingerprint / resolver / diff）行覆盖 >= 80%，其余模块不设硬门槛 | vitest coverage |
| NFR-010 | 打包 | ESM；`files` 仅含 `dist` 与 `README`/`LICENSE`；无 postinstall | `npm pack` 检查 |

---

## 6. 数据需求

- **存储位置**：默认 `.forkpoint/cassette.sqlite`；可通过 `--store` 指定。
- **写入频率**：每 50 个事件提交；Run 结束强制提交；崩溃最多丢失 49 个事件。
- **保留策略**：不自动删除；`ls` 显示大小；超过 20 条时提示。
- **大小**：单条 50 MB 告警；blobs 按 hash 去重。
- **敏感性**：cassette 可能含业务数据与模型输出；默认 gitignore；分享必须 `export --redact`。
- **完整性**：`runs` 与 `events` 外键逻辑关联；打开时检查 orphan 事件，发现则告警。
- **迁移**：`schema_version` 单步迁移；迁移前备份；失败保留原文件。

---

## 7. 验收与追踪矩阵

| 验收项 | 内容 | 关联需求 | 测试类型 |
|---|---|---|---|
| A1 | 断网 strict 重放成功，输出一致 | FR-012、FR-002、FR-004 | 端到端 |
| A2 | verify 两次哈希一致；能报 leak | FR-014、FR-005、FR-006 | 端到端 + 故障注入 |
| A3 | fork 给出首次分歧、成本/延迟 | FR-015、FR-017、FR-018 | 端到端 |
| A4 | 请求变化归类准确；`output_changed` 不误报 | FR-019 | 单测 + 端到端 |
| A5 | 假 key 不出现在 cassette/导出 | FR-007、FR-020 | grep 测试 |
| A6 | 写工具 strict 重放零执行 + 告警 | FR-004、FR-012 | 计数器断言 |
| A7 | CI diff 失败非零退出 | FR-022 | CI 示例仓库 |
| A8 | README 5 分钟跑通；limits 完整 | FR-021、文档 | 人工盲测 |
| A9 | 20 条 benchmark 产出数字 | FR-023 | 脚本 |
| A10 | prior-art 点名 3 个项目并说明差异 | 文档 | 人工审查 |
| A11 | D14 demo/README/博客初稿可展示 | 全部 | 里程碑检查 |
| A12 | README 每条声明可复现，无未验证数字 | 全部 | 人工审查 |

---

## 8. 边界与不承诺（v0.1）

以下内容明确不保证；`docs/limits.md` 必须原样列出：

1. 文件系统读写、外部进程、系统调用不被拦截；必须包进 `tool()`。
2. MCP 协议（stdio / SSE / streamable HTTP / JSON-RPC / sampling / elicitation）不录制；MCP client 调用需包成 `tool()`。
3. HTTP 通用拦截不做；`fetch` 在 strict 重放中被阻断，但录制阶段不自动记录任意 HTTP。
4. 多进程、子进程、分布式 Agent 的因果顺序不承诺。
5. 工具写副作用不回滚；strict 重放不执行写工具，但不清理录制时已产生的副作用。
6. 第三方库自带的 PRNG、patch 前缓存的函数引用不被覆盖。
7. `new Date()` 的 patch 只覆盖无参构造；`Date.parse` / `Date.UTC` / 显式时间参数不受影响。
8. source map 不解析；打包后的 callsite 可能指向 bundle 行号。
9. 流式重放只保证 async iterable 与 `controller.abort()`；OpenAI SDK `Stream` 的其他辅助方法不保证。
10. `fork` 只做全局覆盖（model / temperature / system prompt），不支持按步骤覆盖。
11. 成本基于录制时 pricing 快照，不保证与账单一致。
12. 不提供 `repair` / `merge` / 手工编辑 fixture 的支持；缺失即失败。
13. Python / Java / Go Agent 不支持。
14. 图片、音频等二进制消息体只做原样存储与告警，不做语义 diff。

---

## 9. 附录

### 9.1 一次失败 Run 的事件序列（示例）

```text
seq  type            callsite                                  note
0    run.start       -                                         name=sql-agent-fail
1    llm.request     agent.ts:31:18                            schema_linking
2    llm.response    -                                         picked table=orders
3    tool.call       agent.ts:44:20                            list_columns(orders)
4    tool.result     -                                         ["id","amount","customer_id"]
5    llm.request     agent.ts:58:18                            generate_sql
6    llm.response    -                                         SQL with wrong JOIN
7    tool.call       agent.ts:66:20                            run_sql
8    tool.result     -                                         DB error
9    run.end         -                                         status=failed
```

### 9.2 首次分歧示例（fork 新模型）

```text
base   seq 2  llm.response  -> picked table=orders
variant seq 2 llm.response  -> picked table=customers
=> first divergence: seq=2, callsite=agent.ts:31:18,
   kind=request_mismatch, severity=expected,
   downstream: seq 3 tool.call args differ (orders vs customers)
```

### 9.3 错误输出示例

```text
Forkpoint replay failed (strict)

  run:      r_01j9z3k2
  seq:      7
  callsite: examples/sql-agent/agent.ts:58:18
  type:     llm.request
  code:     FIXTURE_MISS

  expected key: 9f2c...a1
  actual key:   3b7d...e4

  nearest recorded:
    1. 9f2c...a1  examples/sql-agent/agent.ts:58:18  diff: messages[0].content
    2. 0a11...c9  examples/sql-agent/agent.ts:31:18  diff: messages, temperature

  hint: system prompt changed since recording. Re-record, or check for
        un-instrumented code that bypasses the wrappers.
```

### 9.4 测试向量（canonical JSON）

| 输入 | 期望 |
|---|---|
| `{"b":1,"a":2}` | `{"a":2,"b":1}` |
| `{"a":undefined,"b":[undefined]}` | `{"b":[null]}` |
| `{"n":-0}` | `{"n":0}` |
| `{"s":"中文"}` | `{"s":"中文"}`（不转义） |
| 循环引用 | 抛 `NonSerializableError` |

---

## 10. 需求变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-10-21 | 初稿；确定 TypeScript、Node >= 24、`node:sqlite`、Forkpoint 命名；明确不做 MCP 协议 / repair / merge |
