# 设计决策记录

记录影响范围较大、且面试中会被追问的取舍。格式：背景 → 决策 → 代价。

---

## ADR-001：使用 TypeScript，而不是 Python

**背景**：Python 的 Agent 生态更成熟（LangGraph、多数 LLM 工具链）；TypeScript 的 Agent 生态更偏应用层，但增长快。

**决策**：v0.1 只做 TypeScript SDK + CLI，Node.js >= 24。

**理由**：

- 目标用户是 JS/TS Agent 开发者；`openai` Node SDK 与 Vercel AI SDK 的用户可直接接入。
- `node:sqlite` 内置，零原生依赖，Windows 不需要编译工具链，`npx` 可直接运行。
- `AsyncLocalStorage` 让包装器透明，不需要把实例一路传参。
- 栈帧可自动提取 `file:line`，不需要用户手写 `step_label`。
- 类型化的事件判别联合适合展示设计能力。

**代价**：覆盖不到 Python Agent 用户；“框架无关”收窄为“JS/TS”。写入 `docs/limits.md`，面试中不回避。

---

## ADR-002：npm 包名使用 `forkpoint`

**背景**：2026-10-21 查询发现：

- npm `agenttape` 已被占用（v0.5.1），且做的是 Claude Code agent session 的录制/重放/diff——同名同品类。
- npm `agent-vcr` 已被占用（v0.4.0），TypeScript 的 agent 可靠性测试。
- npm `agent-tape`（带连字符）、`forkpoint`、`tracefork` 未被占用。

**决策**：产品名与 npm 包名都使用 `forkpoint`；GitHub 仓库 `gezibu-max/forkpoint`。

**理由**：

- 不与已有包重名，避免 `npx` 安装错包。
- `forkpoint` 命名的是差异点（首次分歧发生的位置），不是又一个 tape/replay。
- CLI 读作 `forkpoint record / replay / diff`，语义成立。

**代价**：名字不直接说明“录制”，README 第一句必须解释。GitHub 上有几个同名的低星仓库，无实质冲突。

---

## ADR-003：存储使用 `node:sqlite`，不使用 better-sqlite3

**背景**：cassette 需要单文件、可拷贝、跨平台。`better-sqlite3` 成熟，但需要原生编译；Windows 用户安装成本高。

**决策**：使用 Node 内置 `node:sqlite` 的 `DatabaseSync`，要求 Node >= 24。

**理由**：

- 零原生依赖，`npx` 可直接运行。
- Windows 开发机无需 MSVC / node-gyp。
- 单文件存储符合 cassette 的可移植性要求。

**代价**：Node 版本门槛提高到 24；`node:sqlite` API 比 better-sqlite3 简洁，部分高级功能缺失。写入 `engines` 与 README。

**实现注意**：`journal_mode=DELETE`，避免遗留 `-wal` / `-shm` 旁文件；退出前 `close()`。

---

## ADR-004：不录 MCP 协议，MCP client 调用包成 `tool()`

**背景**：2026 年 MCP 是 Agent 外部动作的主流方式之一；直接录 MCP 协议（stdio / SSE / streamable HTTP / JSON-RPC / sampling / elicitation）看起来更完整。

**决策**：v0.1 不录 MCP 协议；MCP client 的调用必须包进 `tool()`。

**理由**：

- tool description 与 tool result 本来就会进入 LLM 请求/响应；包成 `tool()` 后，录制边界已经覆盖了“description 变化 → 行为漂移”的 demo。
- 录 MCP 协议是第二套集成面：多种 transport、JSON-RPC、server-initiated sampling/elicitation，3 周做不完。
- 未插桩的 MCP 调用会被 strict guard 拦截或导致 fixture miss，不会静默通过。

**代价**：无法在协议层分析 MCP 流量；用户需要改一行包装代码。写入 `limits.md`。

---

## ADR-005：不提供 `repair` / `merge`

**背景**：评审中曾建议提供交互式补 fixture、合并两条 Run，以改善失败恢复体验。

**决策**：v0.1 不提供，未来也不计划提供。

**理由**：

- 手工补 fixture 会产出“半真半假”的 cassette，破坏“严格重放”这个唯一卖点。
- merge 把两个世界的因果拼在一起，无法回答“这次运行到底发生了什么”。
- 正确的恢复动作是：报清楚缺什么、给最近邻、重录；hybrid 模式（P1）才允许 `--allow-live` 探索新路径。

**代价**：失败恢复不如“自动修复”顺手；用清晰的错误信息弥补（FR-013）。

---

## ADR-006：作品集优先的范围控制

**背景**：项目是单人 3 周的求职作品，不是创业项目。

**决策**：

- 评价标准是“能否在面试里讲 30 分钟”，不是 star 数或市场份额。
- D14 必须可演示；D10 严格重放成功率 < 80% 就砍 fork。
- 不做托管、双许可、Web UI、MCP 协议、框架专用适配。
- README 主动列出 prior art，不宣称“没有成熟实现”。

**代价**：功能面窄；但范围可交付、叙事可信。

---

## ADR-007：自动 callsite，代替手写 `step_label`

**背景**：手写步骤标签在真实项目中会被用户忽略，导致定位退化到序号，无法回答“哪一步开始变坏”。

**决策**：从栈帧自动提取 `file:line:col` 作为 `callsite`；`tool(..., { label })` 可覆盖。

**理由**：

- 零配置；fork 对齐不依赖用户自觉。
- JS 的 `new Error().stack` 在 `tsx` / 源码运行下可靠。
- 比 Python 方案更适合做“自动步骤标签”的叙事。

**代价**：打包后需要 source map 才能指向源码；v0.1 不解析 source map，写入 `limits.md`。

---

## ADR-008：strict replay 不调用模型，fork 才调用

**背景**：常见误解是“重放要控制模型的采样”。

**决策**：

- strict replay：不调用模型，按请求指纹回放已录制的响应。
- fork：被覆盖的 LLM 步骤真实调用模型；工具世界冻结。

**理由**：

- 模型级确定性跨厂商、跨版本不可保证；程序级确定性可以通过固定外部输入实现。
- strict replay 复现的是“这次运行”，不是“重新采样一次”。
- fork 只让被改动的变量重新决策，才能做反事实对比。

**代价**：strict replay 不能测试“模型本身是否稳定”；那是 fork 和 benchmark 的事。报告中明确区分。

**fork 的时钟 / RNG**：优先按序复用 baseline；live HTTP 栈可能读取不同来源或更多次数，此时采样新值写入 variant，并记录 `CLOCK_SOURCE_MISMATCH` / `CLOCK_EXTENDED` / `RNG_SOURCE_MISMATCH` / `RNG_EXTENDED` 告警。replay 仍保持严格，不扩展、不冻结（RNG）。

---

## ADR-009：occurrence 按 `(kind, requestHash)` 计数，不按 callsite

**背景**：同一段代码可能循环发出完全相同的请求。重放要按序命中第 0、1、2 个响应，不能只按指纹取第一个。

**决策**：录制和重放都用 `(kind, requestHash)` 的同步计数器分配 `occurrence`，fixture 主键为 `(run_id, kind, fixture_key, occurrence)`。

**理由**：

- 请求未变时，重放必须逐次命中同一响应，occurrence 是精确匹配的一部分。
- callsite 在请求变化后会漂移，不能用来定位“第几次调用”。

**代价**：fork 时若请求指纹改变，occurrence 会从 0 重新计数，无法直接与基线配对。D11 需要额外的 per-callsite ordinal 做对齐；在那之前，fork 报告只能按事件顺序对齐，不能宣称稳定。

---

## ADR-010：v0.1 显式拒绝流式请求

**背景**：OpenAI SDK 的 `stream: true` 返回异步迭代器，重放需要在 chunk 级别保存与校验，且中途取消、部分消费都会影响后续行为。

**决策**：录制阶段遇到 `stream: true` 直接抛 `UnsupportedStreamMethodError`，不静默降级为非流式，也不记录半个流。

**理由**：

- 显式失败符合“宁可失败，不造假”。
- 半个流无法重放，静默降级会让用户以为录制成功。

**代价**：v0.1 不支持流式 Agent；D4–D7 再实现 `llm.chunk` 与 `stream.aborted`。

---

## ADR-011：replay 写入新的 variant run，baseline 不可变

**背景**：重放需要产生自己的事件序列（包括失败与 warning），但 baseline 是之后 fork/diff 的对照基准。若把重放事件写回 baseline，第一次重放就会污染对照数据。

**决策**：CLI 父进程先创建一条 `mode=replayed`、`parent_run_id=<baseline>`、`status=recording` 的 variant run，再 spawn 子进程；`FORKPOINT_RUN_ID` 指向 variant，`FORKPOINT_BASELINE_RUN_ID` 指向 baseline。fixture 只从 baseline 读，事件只写 variant，最终状态为 `replayed` 或 `failed`。

**理由**：

- baseline 永远保持录制时的原样，重放多少次都不会改变对照基准。
- 每次重放都有独立的 run id、事件序列和失败原因，可以单独 `show`。
- diff 可以直接比较 baseline 与 variant，而不需要额外快照。

**代价**：cassette 会随重放次数增长；需要用 `forkpoint rm`（规划中）或手动清理旧 variant。当前不自动删除。

---

## ADR-012：clock / RNG 在重放时消费录制序列，而不是重新采样

**背景**：只记录时间与随机数不足以复现分支；重放时若再次读取真实时钟或 RNG，agent 仍可能走不同路径。这是与“只录 LLM/tool”方案的核心差异。

**决策**：

- clock：patch `Date.now`、无参 `new Date()` / `Date()`、`performance.now`；重放按 `clock.now` 事件顺序消费。耗尽后冻结在最后一个值并写一次 warning；来源不匹配抛 `NondeterminismError`。
- RNG：patch `Math.random`、`crypto.randomUUID`、`crypto.getRandomValues`；重放按 `rng.value` 事件顺序消费。来源不匹配抛 `RngMismatchError`，耗尽抛 `RngExhaustedError`，不冻结、不补值。
- 录制阶段 clock 读取上限 10,000 次，防止循环内读时钟把 cassette 撑爆。

**理由**：

- clock 冻结是保守降级：时间继续前进不会凭空创造未录制的事实，但会显式告警。
- RNG 不能冻结：重复返回同一个随机值会静默改变程序语义，宁可失败。
- 严格按序消费能在“分支改变导致少读/多读”时立刻暴露问题。

**代价**：patch 前已缓存的函数引用（例如 `const now = Date.now`）不会被拦截；子进程、原生扩展和未包装的随机源也不在承诺内。这些限制写入 `limits.md`（规划中）。

---

## ADR-013：verify 比较两次独立重放的稳定事件哈希

**背景**：strict replay 可能“看起来成功”，但某些未包装的随机性仍会让两次重放产生不同结果。需要一种不依赖模型、不比较时间戳的确定性检查。

**决策**：`forkpoint verify <run_id>` 连续创建两条 variant run，各重放一次；对每条事件计算 `(seq, type, spanId, parentSpanId, callsite, requestHash, responseHash, payload)` 的 SHA-256，再对事件摘要序列计算总哈希。排除 `ts` 与 `durationMs`。两次不一致时报告首个差异的 `seq` 与 `reason`（`type` / `content` / `missing`），退出码 1。baseline 未被消费的 fixture 只告警，不失败。

**理由**：

- 两次重放都不调用模型，比较的是程序级确定性，而不是模型采样稳定性。
- 排除时间戳和耗时，避免正常执行速度差异造成假阳性。
- 保留 callsite 与 request/response hash，能发现“同一 seq 但输入或输出变了”的隐性分歧。

**代价**：verify 只覆盖被 Forkpoint 包装的边界；未包装的随机源和外部副作用仍可能漏检。每次 verify 产生两条 variant run，需要用户自行清理。

---

## ADR-014：diff 以 callsite + ordinal 对齐，而不是请求指纹

**背景**：fork 或改 prompt 后，同一调用点的请求指纹必然变化。若按 `(kind, fingerprint, occurrence)` 对齐，所有步骤都会变成“未匹配”，首次分歧会被错误地报在第 1 步。

**决策**：v0.1 的 diff 按 `(kind, callsite, 同 callsite 内 ordinal)` 配对；tool 额外带 tool name。缺少 callsite 时以 `unknown` 分组，仍按 ordinal 顺序配对。配对后依次比较：异常 → 请求指纹 → 响应指纹。字段差异递归展开，报告中截断长文本。未配对的步骤标记为 `missing_step` / `added_step`，归入 `unclassified`。

**理由**：

- callsite 在改 prompt、改模型后保持稳定，正好覆盖 fork 的核心场景。
- ordinal 能区分同一行的循环 / 并发发起顺序（顺序本身不确定时仍会显式暴露为分歧）。
- 指纹仍作为配对后的比较内容，而不是配对键；请求变了也能指出“同一个调用点变了什么”。

**代价**：分支改变导致 callsite 集合变化时，v0.1 只报最早未配对步骤，不做序列对齐（如 LCS）。并发未完成的调用按最近一个 pending step 归属；当前不支持并发 in-flight 调用。JSON 报告只含哈希与截断预览，不含完整请求体。

---

## ADR-015：fork 是 closed-world 反事实，工具 fixture 复制进 variant

**背景**：fork 要让模型在新配置下重新决策；若工具也真实执行，副作用、网络与数据库状态会重新引入，且与 baseline 的工具结果不可比。另一方面，fork 的 LLM 请求因覆盖项而指纹全变，不能再用 baseline 的 LLM fixture 重放。

**决策**：

1. fork 中的 LLM 调用真实执行；工具调用只查 baseline fixture，绝不执行。
2. 工具 fixture 按 `(kind, fixtureKey, occurrence)` 复制到 variant，使 forked run 能独立 replay / verify。
3. 若模型改变路径，请求了 baseline 未记录的工具参数，显式抛 `FixtureMissError`，不猜测、不执行 fallback。
4. fork 开始时写入一条 `FORK_TOOLS_FROZEN` 告警，说明工具世界被冻结。
5. forked run 的 `config_json.overrides` 是运行的一部分；replay / verify 一个 forked run 时重新应用这些覆盖项，并写入 `FORK_OVERRIDES_APPLIED` 告警。
6. 对一个 forked run 再 fork 时，继承其覆盖项，新的覆盖项优先；写入 `FORK_OVERRIDES_INHERITED` 告警。这样连续 fork 只改变新指定的变量。
7. 覆盖项只允许 `model` / `temperature` / `systemPrompt`，至少一个；未知字段报用法错误。

**理由**：

- 保持“只让被改动的变量重新决策”：工具世界固定，分歧才能归因到模型或提示词。
- fixture 复制让每个 variant 自包含，不依赖父 run 仍然存在。
- 重放 forked run 时复用覆盖项，避免“variant 能 diff、不能 verify”的断层。
- 显式 fixture miss 比静默执行工具更符合“不造假”。

**代价**：fork 只适用于工具调用序列基本不变的变更；工具 fixture 按精确请求指纹匹配，模型即使只改写 SQL 别名也会 fixture miss。fixture miss 会写入 `tool.error` 并终止 fork，不会被 agent 的 catch 吞掉；这是 v0.1 的真实边界。system prompt 全文存进 `config_json`，本地存储可接受；分享时使用 `export --redact`（见 ADR-016）。fork 不是 OS 沙箱。

---

## ADR-016：脱敏在导出时执行，导出文件不可重放

**背景**：自定义脱敏规则是 JS `RegExp`，用户希望录制一次后、分享时再决定如何脱敏。但如果在录制时改写 LLM 请求或 tool 结果，请求指纹会变化，replay / fork 必须同时应用同样的规则才能命中 fixture；fork 时真实模型也需要看到原始输入。另一方面，直接分发 cassette 可能带出业务数据与密钥。

**决策**：

1. **录制保留原始边界数据**：LLM 请求中不写入 `headers` / `fetch` 等传输字段，env 只录白名单且跳过敏感后缀；这两项在录制阶段完成。自定义规则不在录制时改写 payload。
2. **规则随 run 持久化**：`new Forkpoint({ redact })` 的规则序列化为 `{ name, source, flags, replacement }` 写入 `config_json.redactionPatterns`。replay / fork 创建的 variant 在自身未提供规则时继承 baseline 的规则。
3. **`export` 时才应用规则**：`forkpoint export <run_id> --redact` 对 meta、event payload、fixture request / response / meta 的字符串叶子依次应用规则（无 `g` 也按全局替换），并执行内置规则：
   - 任意对象中 key 为 `Authorization`、`api-key`、`x-api-key`、`Cookie`、`Set-Cookie` 的值替换为 `[REDACTED]`；
   - 仅在 env 快照与 `run.env` 中，key 以 `_KEY` / `_TOKEN` / `_SECRET` / `_PASSWORD` 结尾的值替换为 `[REDACTED]`。
4. **`--redact` 是强制的**：不提供原始导出入口，避免“先导出再忘记脱敏”。
5. **导出结构**：JSONL 首行为 meta（`formatVersion=1`、`redacted=true`、`replayable=false`），随后每行一个 event、再每行一个 fixture；fixture 的 `requestJson` 解析为 `request` 对象，便于阅读与扫描。
6. **导出后扫描**：对最终对象扫描 `sk-`、`ghp_`、`AKIA`、`xox[baprs]-` 等模式，报告行号、记录类型、seq / fixture key 与字段路径；只告警，不自动删除。`sk-` 等模式是安全网，不是 DLP 保证。
7. **导出不可重放**：脱敏会改变请求内容，哈希仍来自原始数据；文件明确标注 `replayable=false`，不提供 import。

**理由**：

- 脱敏若发生在录制阶段，会破坏“请求指纹 → fixture”的确定性契约，或者迫使 replay / fork 也做同样的改写，扩大错误面。
- 导出时应用规则可以保留 cassette 的完整因果信息，同时让分享物按需变形。
- 规则持久化让用户不必为分享重新写一遍正则。
- 拒绝原始导出、标注不可重放，符合“宁可显式失败，不静默造假”。

**代价**：cassette 本身仍可能包含业务数据与模型输出，必须本地保存并 gitignore；内置规则只覆盖已知 header 名与 env 后缀，无法识别任意自定义密钥；正则规则可能误伤或漏脱敏，导出后仍需人工检查扫描结果；JSONL 保留原始 request / response 哈希，不能用于 replay / verify。

---

## ADR-017：Claude Code 插件采用双模式，宿主会话只做 observe

**背景**：把 Forkpoint 以 Claude Code 插件形式交付时，最直觉的承诺是“录制并严格重放 Claude Code 自己的会话”。但插件只能通过 hooks 接收事件：hooks 在独立进程中运行，拿到的是 `session_id`、`tool_name`、`tool_input`、`tool_output`、`transcript_path` 等字段，**看不到宿主与模型之间的原始 LLM 请求/响应，也无法 patch 宿主的 `Date`、`Math.random` 或网络栈**。宿主的分支由模型驱动，不在插件控制范围内。

**决策**：

1. **strict 模式保留在子进程**：插件命令包装现有 CLI；`/forkpoint:record` 等在 Forkpoint 控制下启动一个 Node agent 子进程。目标命令必须使用 SDK（`fp.run` + `fp.wrapOpenAI`），继续具备 LLM / tool / clock / RNG / env 的严格重放能力。
2. **observe 模式只记录宿主工具事件**：hooks 把 `SessionStart` / `PreToolUse` / `PostToolUse` / `SessionEnd` 写入 `mode=observed` 的 run。只产生 `observe.start`、`tool.call`、`tool.result`、`run.end`，不产生任何 `llm.*` 事件。
3. **observe 显式不可重放**：`replay` / `verify` / `fork` 在 `readBaseline` 处拒绝 observed run；`diff` 在 caveats 首行标注 observe-only。界面与文档不使用“重放 Claude Code 会话”的表述。
4. **observe 默认关闭**：只有 `FORKPOINT_OBSERVE=1` 时 hooks 才写入；hook 包装脚本始终以 0 退出，录制失败只写 stderr，不阻塞工具调用。
5. **事件写入跨进程原子**：hooks 可能并发执行，`appendEventNow()` 使用单条 `INSERT ... SELECT COALESCE(MAX(seq), -1) + 1 ... WHERE run_id = ?`，不依赖进程内 `seq` 缓存；`SessionStart` / `SessionEnd` 通过事件存在性检查保证幂等。
6. **run id 绑定会话**：observed run 使用 `obs_<session_id>`，同一 Claude Code 会话的多次 hook 调用归入同一条 trace；`SessionEnd` 后同一 `session_id` 再次 `SessionStart`（resume）时追加新的 `observe.start` 并把状态改回 `observing`，保留多个会话段而不是丢失后续工具事件。

**理由**：

- 宿主不可严格重放是平台事实，不是实现偷懒；把它包装成“可重放”会直接违反“宁可失败，不造假”。
- strict 子进程与 observe 宿主各用各的因果边界：前者能回答“这次运行为什么变”，后者只能回答“宿主工具调用发生了什么”。
- 默认关闭和原子写入把 observe 的侵入性压到最低：不设置环境变量时不产生任何文件。
- observed run 复用现有事件、diff、ls、show、export 能力，不引入第二套存储。

**代价**：observe trace 没有 LLM 步骤、token 统计、clock / RNG 或宿主提示词，不能用于严格回归；Claude Code hooks 不保证覆盖所有宿主动作，工具事件之外的副作用不可见；并发 hook 只保证 `seq` 不冲突，不保证跨 hook 的因果排序；observed run 的 `tool.call` 不带源码 callsite，只能按 `claude-code:<tool>` + ordinal 对齐；原始工具 I/O 可能含密钥，因此必须本地保存，分享前使用 `export --redact`。插件无法替用户安装 SDK，strict 模式要求目标项目自行接入 Forkpoint。
