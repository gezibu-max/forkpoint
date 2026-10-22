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
- 一个 cassette 文件通过 `node:sqlite` 访问；并发写入不是本项目的目标场景。

## 5. 安全与隐私

- 默认不导出原始 cassette；`export` 强制 `--redact`。
- 内置脱敏只覆盖已知敏感 header、敏感 env 后缀、自定义规则与常见 token 模式，不是 DLP。分享前仍需人工检查。
- 无遥测、无自动上传；cassette 可能包含业务数据与模型输出，默认应加入 `.gitignore`。
- API key 不应写入代码、cassette、导出文件或提交历史。

## 6. 当前未交付

- 20-run mutation benchmark（SRS FR-023）尚未完成，README 不宣称相关数字。
- 流式响应（SRS FR-003）延期至 v0.2。
- GitHub Actions CI 工作流尚未落地；本地自检命令为 `npm test`、`npm run typecheck`、`npm run build`。
