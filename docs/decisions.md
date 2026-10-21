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
- 正确的恢复动作是：报清楚缺什么、给最近邻、重录，或用 `--allow-live` 探索新路径。

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
