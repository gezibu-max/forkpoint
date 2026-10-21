# Forkpoint

> Record once. Replay deterministically. Find the fork.

**Forkpoint 是 Agent 的可复现运行层。** 录制一次真实运行，离线严格重放；换模型、改 prompt、改 tool schema 后，指出第一次分歧发生在哪一步。

**状态：pre-alpha。** 已能录制一次完整的 Text2SQL agent 运行，并离线严格重放到新的 variant run；clock / RNG 在重放时受控，live fetch 被拦截。fork、diff、verify 尚未实现。

---

## 问题

Agent 的行为由 LLM 采样、工具返回和运行时状态共同决定。任意一环变化，结果就会漂移：

- **不可复现**：一次偶发失败（工具超时、选错工具、生成后修复失败）很难原样再跑一遍。
- **不可对比**：换模型、改 prompt 后，只能看整体成功率，说不出哪个 case 从哪一步开始变差。
- **不可回归**：没有稳定的离线基线，CI 里无法对 Agent 行为做 diff。

## 它做什么

```
record  →  strict replay  →  fork  →  diff
```

| 阶段 | 行为 | 状态 |
|---|---|---|
| Record | 包装 OpenAI 客户端与工具，录制 LLM / tool / env / clock / RNG 边界 | 已实现（非流式） |
| Replay | 不调用模型、不联网，按请求指纹回放，输出与录制时一致 | 已实现（非流式） |
| Fork | 替换模型 / 温度 / system prompt，工具世界冻结，LLM 步骤重新决策 | 未实现 |
| Diff | 输出首次分歧的 `seq`、`callsite`、类型，以及 token / 成本 / 延迟对比 | 未实现 |

**关键点：它不重放模型，重放事实。** 录制时模型的输出已经发生；重放时不采样，只回放。fork 时才调用新模型，而且只让被改动的变量重新决策。

## 不做什么

- 不做托管服务、Web 看板、账号体系。
- 不录 MCP 协议（把 MCP client 调用包成 `tool()`）。
- 不做 `repair` / `merge`（不拼半真半假的 cassette）。
- 不做 Python SDK、不做多进程因果追踪、不做工具副作用回滚。
- 不做 OS 级沙箱，不拦截任意文件系统与网络。

完整边界见 [docs/SRS.md](docs/SRS.md) §8。

## Prior art

这不是空白赛道。开始之前，先读这些：

- [clay-good/agent-replay](https://github.com/clay-good/agent-replay) — 本地 SQLite CLI，通过 hooks/OTel 录制 LLM、tool、time 边界，支持 replay / fork / diff / CI。
- [agenttape](https://www.npmjs.com/package/agenttape) — npm 上的 Claude Code agent session 录制、重放、diff 与回归测试。
- [agent-vcr](https://www.npmjs.com/package/agent-vcr) — TypeScript 的 agent 可靠性测试，golden tool-call traces、policy assertions、run-to-run variance。
- [Deterministic Replay for AI Agent Systems (arXiv 2607.16200)](https://arxiv.org/abs/2607.16200) — 传输层 MITM proxy 的确定性重放。

Forkpoint 只押两点：**时钟 / RNG / env 在重放时受控，而不只是被记录**；**自动 callsite + 首次分歧定位**。框架无关的 time-travel、Claude Code session 录制、断言 DSL 都不做。

## 已实现的 API

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
# 已实现
npx forkpoint record --name sql-agent-fail -- tsx examples/sql-agent/index.ts
npx forkpoint replay <run_id>
npx forkpoint ls
npx forkpoint show <run_id> --events

# 规划中
npx forkpoint fork <run_id> --model gpt-4.1-mini --system-prompt-file prompts/v2.md
npx forkpoint diff <base> <variant> -o reports/model-swap.md
```

`replay` 会创建一条新的 variant run（`mode=replayed`、`parent_run_id=<baseline>`），baseline 不会被修改。重放时读取 baseline 的 fixture，事件写入 variant；缺失的请求、变化的 clock/RNG 序列、任何 live `fetch` 都会显式失败。写工具（`write: true`）不执行，只回放结果并记录 `WRITE_TOOL_NOT_EXECUTED` 警告。

### 跑一遍 demo

```bash
npm install
npm run record:demo
npx tsx src/cli/index.ts ls
npx tsx src/cli/index.ts show <run_id> --events
```

未设置 `OPENAI_API_KEY` 时，demo 使用脚本化的离线客户端，并在输出中明确标注 `scripted run`；设置后走真实 OpenAI 调用。两种模式都会录制到同一个 cassette schema。

当前不支持：流式响应、脱敏后的 replay、fork、diff。clock / RNG 覆盖 `Date`、`performance.now`、`Math.random`、`crypto.randomUUID`、`crypto.getRandomValues`；未包装的边界（例如自定义时钟、子进程）不在承诺内。

## 文档

- [产品文档（PRD）](docs/PRD.md)
- [需求说明书（SRS）](docs/SRS.md)
- [设计决策记录（ADR）](docs/decisions.md)

## 路线图

| 时间 | 交付 |
|---|---|
| D1–D3 | 骨架、schema、canonical fingerprint、Text2SQL demo、record CLI（已完成） |
| D4–D7 | 录制：clock / RNG（已完成）、流式 LLM、脱敏 |
| D8–D10 | strict replay、guard（已完成）、verify；止损检查 |
| D11–D14 | fork、diff、mutation benchmark、README / decisions / limits / prior-art |
| D15–D21 | 博客、视频、GitHub Action、v0.1.0 |

## 设计原则

1. **显式失败**：宁可重放失败，也不静默产出“看起来成功”的假结果。
2. **边界而非全局**：只对声明支持的边界负责，不承诺的不假装支持。
3. **不造假**：不补 fixture、不合并两条 Run 的因果链。
4. **本地优先**：单文件 cassette、零遥测、可完全离线。

## License

Apache-2.0
