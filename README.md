# Forkpoint

> Record once. Replay deterministically. Find the fork.

![status](https://img.shields.io/badge/status-pre--alpha-orange)
![node](https://img.shields.io/badge/node-%3E%3D24-339933)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

**Agent 的可复现运行层。** 录制一次真实运行，之后离线严格重放；换模型、改 prompt 之后，直接告诉你第一次分歧发生在第几步、哪个 callsite、哪个字段。

---

## 30 秒看懂

同一个 Text2SQL agent，只把 SQL 里的「本月」改成「上月」：

```text
## First divergence

- Step: 8 (llm ("scripted-model"))
- Callsite: `examples/sql-agent/agent.ts:104:61`
- Status: response_changed
- Category: output_changed
- Severity: info
```

```text
| #  | Step             | Callsite                           | Status            |
|---:|---|---|---|
| 8  | llm              | examples/sql-agent/agent.ts:104:61 | response_changed  |
| 9  | tool ("run_sql") | examples/sql-agent/agent.ts:167:20 | request_mismatch  |
| 10 | llm              | examples/sql-agent/agent.ts:104:61 | request_mismatch  |
```

第 8 步模型改了 SQL，第 9 步工具参数跟着变。不用翻完整 trace，第一次变坏的位置就在这里。

> 示例来自仓库内置的固定脚本场景，不调用真实模型，用于演示定位能力。真实模型 fork 见下文。

## 它解决什么

| 痛点 | Forkpoint |
|---|---|
| 偶发失败很难原样复现 | 录制一次，之后离线严格重放 |
| 换模型 / 改 prompt 只能看整体成功率 | 按 callsite 对齐两个 Run，定位首次分歧 |
| 没有稳定的离线基线，CI 无法做行为回归 | 重放不联网，事件哈希稳定，可用 verify 检查 |

**它不重放模型，重放事实。** 录制时模型的输出已经发生；重放只回放，不采样。

## 工作方式

```text
record ──► cassette ──► replay ──► verify
                    └► fork ────► diff
```

| 命令 | 做什么 |
|---|---|
| `record` | 包装 OpenAI 客户端与 tool，录制 LLM / tool / clock / RNG / env 边界 |
| `replay` | 不调用模型、不联网，按请求指纹回放 baseline |
| `verify` | 连续重放两次，比较排除时间戳与耗时后的稳定事件哈希 |
| `fork` | 换 model / temperature / system prompt 真实重跑 LLM，工具世界冻结 |
| `diff` | 按 `callsite + ordinal` 对齐，输出首次分歧、字段差异和 token / 延迟对比 |
| `export` | 导出脱敏 JSONL，强制 `--redact` |

每次 replay / fork 都会创建新的 variant run，baseline 不会被修改。

## 快速开始

需要 Node.js >= 24。

```bash
git clone https://github.com/gezibu-max/forkpoint.git
cd forkpoint
npm install

# 录制 demo。没有 OPENAI_API_KEY 时使用脚本化客户端，并明确标注
npm run record:demo

# 查看 run id
npx tsx src/cli/index.ts ls

# 离线重放：不联网、不调用模型
npx tsx src/cli/index.ts replay <run_id>

# 连续重放两次，确认事件哈希一致
npx tsx src/cli/index.ts verify <run_id>

# 定位两次运行的第一处行为差异
npx tsx src/cli/index.ts diff <base_id> <variant_id>
```

数据保存在本地 SQLite（默认 `.forkpoint/`），没有账号，没有遥测。

### 跑一个可重复的分歧场景

固定日期，避免 system prompt 里的时间戳造成无关差异：

```bash
export FORKPOINT_DEMO_TODAY=2026-10-21T00:00:00.000Z

for plan in baseline corrected alt-final; do
  FORKPOINT_DEMO_PLAN=$plan npx tsx src/cli/index.ts record \
    --name scenario-$plan -- tsx examples/sql-agent/index.ts
done

npx tsx src/cli/index.ts diff <baseline_id> <corrected_id>
npx tsx src/cli/index.ts diff <baseline_id> <alt-final_id>
```

- `baseline → corrected`：改了第二次 SQL 的时间范围，首次分歧落在第 8 步 LLM response。
- `baseline → alt-final`：只改最终答复，首次分歧落在第 10 步的 `$.choices[0].message.content`。

同样的场景由 [test/cli.test.ts](test/cli.test.ts) 自动断言。之后 replay / verify 也要带同一个 `FORKPOINT_DEMO_TODAY`，否则 system prompt 里的日期会变。

### 换一个模型

```bash
# 有 OPENAI_API_KEY 时走真实模型
npx tsx src/cli/index.ts fork <run_id> --model gpt-4.1-mini

# 没有 key 时用脚本化 plan 跑通完整流程（不是真实模型对比）
FORKPOINT_DEMO_PLAN=alt-final npx tsx src/cli/index.ts fork <run_id> --model scripted-alt

npx tsx src/cli/index.ts diff <run_id> <fork_run_id>
```

fork 时 LLM 真实调用，工具不执行，只按请求指纹从 baseline fixture 读取结果。若新模型请求了未记录的工具参数，直接抛 `FixtureMissError`，不会静默执行或编造结果。

## 在代码里使用

```ts
import OpenAI from "openai";
import { Forkpoint, tool } from "forkpoint";

const fp = new Forkpoint({ store: ".forkpoint" });
const client = fp.wrapOpenAI(new OpenAI());

const runSql = tool("run_sql", async (sql: string) => db.all(sql), {
  write: false,
});

await fp.run("sql-agent-fail", async () =>
  agent(client, runSql, "上个月销售额最高的 10 个客户")
);
```

```bash
forkpoint record --name sql-agent-fail -- tsx examples/sql-agent/index.ts
forkpoint replay <run_id>
forkpoint fork <run_id> --model gpt-4.1-mini
forkpoint diff <base_run_id> <variant_run_id> -o reports/model-swap.md
```

## 哪些地方是严格的

- 重放不调用模型，拦截 live `fetch`；缺失 fixture 显式失败，不能靠 agent 的 `catch` 吞掉。
- clock / RNG 按录制序列回放；重放时多读或少读都会以 `NondeterminismError` 失败。
- 写工具（`write: true`）不执行，只回放结果并记录警告。
- replay / fork 的 variant 自包含，可以继续 replay，也会继承 fork overrides。
- 重放错误保留 `status` / `code` / `type` / `param` / `request_id`。
- fixture miss 会列出最接近的 3 条 fixture、匹配的 callsite 与差异字段。
- 导出只提供脱敏模式，并扫描 `sk-`、`ghp_`、`AKIA` 等常见 token 模式。

## 边界

不支持：流式响应（计划 v0.2）、MCP 协议录制、Python SDK、多进程因果追踪、`repair` / `merge`、OS 级沙箱、原始未脱敏导出。

fork 是 **closed-world**：工具 fixture 按精确请求指纹匹配，模型即使只改 SQL 别名也可能 fixture miss；此时显式失败，而不是编造结果。

完整清单见 [docs/limits.md](docs/limits.md) 与 [SRS §8](docs/SRS.md)。

## 代码结构

| 目录 | 内容 |
|---|---|
| `src/core/` | canonical JSON、事件哈希、diff、错误模型、脱敏 |
| `src/sdk/` | `wrapOpenAI`、`tool`、clock / RNG 边界、replay / fork 执行 |
| `src/store/` | SQLite cassette |
| `src/cli/` | `record` / `replay` / `verify` / `fork` / `diff` / `export` |
| `examples/sql-agent/` | Text2SQL demo |
| `test/` | 93 个测试，覆盖边界、并发、变体、脱敏与 CLI |

## 状态

pre-alpha，单人三周作品集项目。已实现非流式录制、严格重放、verify、fork、diff 和脱敏导出。

下一步：流式响应、mutation benchmark、CI 示例、v0.1.0。

## 文档

- [产品文档（PRD）](docs/PRD.md)
- [需求说明书（SRS）](docs/SRS.md)
- [设计决策记录（ADR）](docs/decisions.md)
- [能力边界](docs/limits.md)

## 相关项目

- [clay-good/agent-replay](https://github.com/clay-good/agent-replay) — 本地 SQLite CLI，录制、重放、fork 与 diff。
- [agenttape](https://www.npmjs.com/package/agenttape) — Claude Code session 的录制与重放。
- [agent-vcr](https://www.npmjs.com/package/agent-vcr) — TypeScript agent 的 golden trace 与回归测试。
- [Deterministic Replay for AI Agent Systems](https://arxiv.org/abs/2607.16200) — 传输层确定性重放。

Forkpoint 只押两点：**clock / RNG 在重放时受控，而不只是被记录**；**按 callsite 自动定位首次分歧**。

## License

Apache-2.0
