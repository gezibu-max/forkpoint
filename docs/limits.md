# 边界与不承诺

Forkpoint v0.1 的定位是 **Agent 边界的可复现运行层**，不是操作系统级沙箱，也不是完整的可观测性平台。以下限制是产品契约的一部分；超出边界的场景请显式失败或提前说明。

## 1. 明确不保证

1. 文件系统读写、外部进程、系统调用不被拦截；必须包进 `tool()`。
2. MCP 协议（stdio / SSE / streamable HTTP / JSON-RPC / sampling / elicitation）不录制；MCP client 调用需包成 `tool()`。
3. HTTP 通用拦截不做；`fetch` 在 strict replay 中被阻断，但录制阶段不自动记录任意 HTTP。
4. 多进程、子进程、分布式 Agent 的因果顺序不承诺。
5. 工具写副作用不回滚；strict replay 不执行写工具，但不清理录制时已产生的副作用。
6. 第三方库自带的 PRNG、patch 前缓存的函数引用不被覆盖。
7. `new Date()` 的 patch 只覆盖无参构造；`Date.parse` / `Date.UTC` / 显式时间参数不受影响。
8. source map 不解析；打包后的 callsite 可能指向 bundle 行号。
9. 流式响应不在 v0.1：`stream: true` 显式抛 `UnsupportedStreamMethodError`；async iterable 录制/重放推迟到 v0.2。
10. `fork` 只做全局覆盖（model / temperature / system prompt），不支持按步骤覆盖，也不覆盖工具 schema。
11. 成本基于录制时 pricing 快照，不保证与账单一致。
12. 不提供 `repair` / `merge` / 手工编辑 fixture 的支持；缺失即失败。
13. Python / Java / Go Agent 不支持。
14. 图片、音频等二进制消息体只做原样存储与告警，不做语义 diff。
15. strict replay 要求完整消费 baseline 的 clock / RNG 序列；代码路径变化导致多读、少读或换源都会失败。
16. live SDK / tool 内部的 clock / RNG 读取不进入边界；如果第三方库在 wrapper 之外直接读取，仍可能造成漂移。
17. Claude Code 插件的 observe 模式只记录工具事件，不记录宿主的 LLM 流量、提示词、token、clock 或 RNG，**不可重放、不可 verify**。
18. observe 依赖 Claude Code hooks；hooks 未覆盖的宿主动作、工具之外的副作用、hook 丢失或执行超时都不在承诺内。hook 退出码始终为 0，但 PreToolUse 仍是同步调用，会为每次工具调用增加一次 Node 进程启动开销；缺少 SessionEnd 时 run 可能停留在 `observing`。
19. 插件不能替目标项目接入 SDK；strict 模式要求子进程自己调用 `fp.run()` 与 `fp.wrapOpenAI()`。

## 2. clock / RNG 的实际语义

- **录制**：只记录 agent 代码对 `Date.now()`、无参 `new Date()`、`performance.now()`、`Math.random()`、`crypto.randomUUID()`、`crypto.getRandomValues()` 的读取。live SDK 与工具实现内部的读取通过 `AsyncLocalStorage` 的“真实来源”作用域排除，不写入 cassette。
- **strict replay**：按顺序消费录制值。多读、少读、`source` 不同都会让 Run 失败，并写入 `run.end` 状态 `failed`。不会冻结时间或补随机值。
- **fork**：优先复用 baseline；agent 代码多读或换源时，采样真实值并写 `CLOCK_EXTENDED` / `CLOCK_SOURCE_MISMATCH` / `RNG_EXTENDED` / `RNG_SOURCE_MISMATCH` 告警。工具不执行。
- 未包装的自定义时钟、消息队列、数据库自增 id、外部进程仍可能导致不可复现的差异。

## 3. fixture 与 fork 的限制

- LLM 与 tool fixture 都按 **规范化请求指纹 + occurrence** 精确匹配，不做模糊匹配或自动修补。
- `fork` 中工具世界是 closed-world：新模型即使只改写 SQL 别名，也可能触发 `FixtureMissError`。这是有意的失败，不会执行真实工具或编造结果。
- replay 会把命中的 fixture 复制进 variant，因此 replayed / forked run 可以继续 replay；导出的脱敏 JSONL 不能导回重放。
- `fork` 的 LLM 调用是真实的：需要网络和 API key；strict replay 不需要。

## 4. 并发与进程

- 同一进程内只允许一个顶层 `fp.run()`；重叠调用会抛 `NestedRunError`，不会共享或错配 clock / RNG 序列。
- 子进程、worker、并行 task 不共享 cassette 上下文；跨进程因果顺序不承诺。
- strict record / replay 仍是单写者模型；observe hooks 可能并发写入，`seq` 由单条原子 INSERT 分配，不冲突，但不同 hook 之间的先后顺序不保证。
- 一个 cassette 文件通过 `node:sqlite` 访问；SQLite 写锁等待上限为 5 秒，密集并发 hook 或慢磁盘仍可能超时。observe 失败不会拒绝宿主工具，但 PreToolUse 仍会同步等待 hook 进程结束。

## 5. 安全与隐私

- 默认不导出原始 cassette；`export` 强制 `--redact`。
- 内置脱敏只覆盖已知敏感 header、敏感 env 后缀、自定义规则与常见 token 模式，不是 DLP。分享前仍需人工检查。
- 无遥测、无自动上传；cassette 可能包含业务数据与模型输出，默认应加入 `.gitignore`。
- API key 不应写入代码、cassette、导出文件或提交历史。

## 6. Claude Code 插件与 observe 模式

- **strict 模式**：插件命令启动一个受 Forkpoint 控制的 Node agent 子进程，能力与 CLI 相同；目标命令必须使用 SDK。插件不是 auto-instrumentation，不能包装任意宿主会话。插件目录自带打包后的 CLI（`plugin/lib/cli.mjs`），marketplace 安装不依赖已发布的 npm 包；本地仓库开发时优先使用 `dist/cli/index.js`。
- **observe 模式**：hooks 记录 `SessionStart` / `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `SessionEnd`，生成 `mode=observed`、`status=observed` 的 run。
  - 只有 `FORKPOINT_OBSERVE=1` 时写入；默认关闭，不设置环境变量时不产生文件。
  - hooks 始终以 0 退出，不拒绝工具调用；录制失败只写 stderr。但 hook 是同步执行的：`PreToolUse` 为每次工具调用增加一次 Node 进程启动（本地实测约 0.5 秒/次）。这是延迟，不是阻断。
  - 缺少 `SessionEnd`（宿主动画、崩溃或超时）时，run 可能停留在 `status=observing`；v0.1 不做自动对账。
  - observed run 没有 `llm.*` 事件、没有 token、没有 clock / RNG；`replay` / `verify` / `fork` 会显式拒绝。
  - 工具 callsite 固定为 `claude-code:<tool>`；同一工具的多次调用按 ordinal 对齐。失败或中断的工具写入 `tool.error`，中断时带 `isInterrupt`。
  - 同一 `session_id` 被 resume 时，trace 会包含多个 `observe.start` / `run.end` 会话段，仍归入同一条 observed run。
  - 原始工具输入/输出可能包含密钥；cassette 本地保存并 gitignore，分享前使用 `export --redact`。
  - 宿主的提示词、模型响应与 transcript 内容不复制进 cassette，只保存绝对路径 `transcript_path`；导出脱敏不会改写该路径。

## 7. 当前未交付

- 20-run mutation benchmark（SRS FR-023）尚未完成，README 不宣称相关数字。
- 流式响应（SRS FR-003）延期至 v0.2。
- GitHub Actions CI 工作流尚未落地；本地自检命令为 `npm test`、`npm run typecheck`、`npm run build`。
