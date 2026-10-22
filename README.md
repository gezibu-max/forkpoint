# Forkpoint

> Record once. Replay deterministically. Find the fork.

**Forkpoint 是 Agent 的可复现运行层。** 录制一次真实运行，离线严格重放；换模型、改 prompt 后，指出第一次分歧发生在哪一步。

**状态：pre-alpha。** 已能录制一次完整的 Text2SQL agent 运行，离线严格重放到新的 variant run，用 `verify` 连续两次重放、比较稳定事件哈希，用 `fork` 换模型 / 温度 / system prompt 重新执行 LLM 步骤（工具世界冻结），用 `diff` 按 callsite 对齐两个 Run、定位首个行为分歧，并用 `export --redact` 导出脱敏 JSONL。clock / RNG 在 replay 中严格受控；fork 优先复用 baseline，live I/O 需要时采样并记录。replay 的 live fetch 被拦截。

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
| Verify | 连续两次重放，排除时间戳与耗时的稳定事件哈希必须一致 | 已实现 |
| Fork | 换 model / temperature / system prompt，LLM 真实重跑，工具从基线 fixture 读取 | 已实现（非流式；工具 closed-world） |
| Diff | 按 `callsite + ordinal` 对齐，输出首次分歧、字段差异、token / 延迟对比 | 已实现（Markdown / JSON） |
| Export | 内置 header / env 脱敏 + 自定义规则，输出 meta / event / fixture JSONL 并扫描 token 模式 | 已实现（仅脱敏导出） |

**关键点：它不重放模型，重放事实。** 录制时模型的输出已经发生；重放时不采样，只回放。fork 时才调用新模型，工具世界冻结；live SDK / tool 内部的 clock / RNG 读取不计入边界，fork 中 agent 自身多读或换源时会采样并告警。

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
npx forkpoint verify <run_id>
npx forkpoint fork <run_id> --model gpt-4.1-mini --system-prompt-file prompts/v2.md
npx forkpoint diff <base_run_id> <variant_run_id> -o reports/model-swap.md
npx forkpoint export <run_id> --redact -o exports/run.jsonl
npx forkpoint ls
npx forkpoint show <run_id> --events
```

`replay` 会创建一条新的 variant run（`mode=replayed`、`parent_run_id=<baseline>`），baseline 不会被修改。重放时读取 baseline 的 fixture，事件写入 variant；缺失的请求、多读或少读 clock/RNG 序列、任何 live `fetch` 都会显式失败。重放命中的 fixture 会复制进 variant，因此 replayed / forked run 可以继续被 replay。写工具（`write: true`）不执行，只回放结果并记录 `WRITE_TOOL_NOT_EXECUTED` 警告。

`fork` 创建 `mode=forked` 的 variant：LLM 调用真实发生，可覆盖 model / temperature / system prompt；工具不执行，只按请求指纹读取基线 fixture，并把结果复制进 variant。若新模型请求了基线未记录的工具参数，显式抛 `FixtureMissError`，不会静默执行或编造结果；该错误会写入 `tool.error` 并终止 fork，agent 代码的 `catch` 也不能吞掉它。fork 开始时写入一条 `FORK_TOOLS_FROZEN` 告警；clock / RNG 先按 baseline 消费，live SDK / tool 的内部读取不占用边界，agent 自身多读或换源时会采样新值写入 variant，并记录 `CLOCK_SOURCE_MISMATCH` / `CLOCK_EXTENDED` / `RNG_SOURCE_MISMATCH` / `RNG_EXTENDED` 告警。对 forked run 执行 replay / verify 时会复用其存储的覆盖项，再次 fork 会沿 parent 链继承它们（新覆盖项优先）。

`verify` 以 strict 模式连续重放两次，对 `(seq, type, span, callsite, requestHash, responseHash, payload)` 计算哈希，排除 `ts` 与 `durationMs`。两次不一致时输出首个差异的 `seq` 与类型，并把命令退出码置为 1。replay 自身若未完整消费 baseline 的 clock / RNG，会直接失败，而不是把漂移带进哈希。

`diff` 把两个 Run 的 LLM / tool 调用按 `callsite + 同 callsite 内的 ordinal` 配对，输出首个 `request_mismatch` / `response_changed` / `error_changed` / `missing_step` / `added_step`，并附带字段级差异与 token / 延迟表。两个独立录制若 prompt 里嵌入了时间戳，会如实报告该时间戳差异；需要行为对比时，优先用 strict replay 的 variant。

`export` 强制要求 `--redact`，不提供原始导出入口。JSONL 首行是 meta（`redacted: true`、`replayable: false`），随后每行一个 event、再每行一个 fixture。导出时先应用内置规则（`Authorization` / `api-key` / `x-api-key` / `Cookie` / `Set-Cookie` 的值，以及 env 快照中 `*_KEY` / `*_TOKEN` / `*_SECRET` / `*_PASSWORD` 的值），再按顺序应用 SDK `redact` 选项登记在 run 里的自定义规则（例如 `new Forkpoint({ redact: [{ name: "internal-id", pattern: /int_[a-z0-9]+/g, replacement: "[REDACTED]" }] })`）；最后扫描 `sk-`、`ghp_`、`AKIA`、`xox[baprs]-` 等模式，命中只报告行号与字段，不自动删除。脱敏会改变请求内容，因此导出文件用于分享与检查，不能 replay / verify。

### 跑一遍 demo

```bash
npm install
npm run record:demo
npx tsx src/cli/index.ts ls
npx tsx src/cli/index.ts replay <run_id>
npx tsx src/cli/index.ts fork <run_id> --model gpt-4.1-mini
npx tsx src/cli/index.ts diff <run_id> <fork_run_id>
npx tsx src/cli/index.ts export <run_id> --redact -o exports/run.jsonl
```

设置 `OPENAI_API_KEY` 时 fork 会调用真实模型。没有 key 时可用脚本化离线 fork 跑通流程（不是真实模型对比）：

```bash
FORKPOINT_DEMO_PLAN=alt-final npx tsx src/cli/index.ts fork <run_id> --model scripted-alt
```

### 用固定场景看首次分歧

脚本化客户端提供 `baseline`、`corrected`、`alt-final` 三个 plan。固定 `FORKPOINT_DEMO_TODAY`，避免 system prompt 里的日期在两条 run 之间漂移：

```bash
export FORKPOINT_DEMO_TODAY=2026-10-21T00:00:00.000Z

for plan in baseline corrected alt-final; do
  FORKPOINT_DEMO_PLAN=$plan npx tsx src/cli/index.ts record \
    --name scenario-$plan -- tsx examples/sql-agent/index.ts
done

npx tsx src/cli/index.ts diff <baseline_run_id> <corrected_run_id>
npx tsx src/cli/index.ts diff <baseline_run_id> <alt-final_run_id>
```

- `baseline` 的第二次 SQL 查了本月；`corrected` 只把它改成上月。diff 的首次分歧落在第 8 步的 LLM response——模型改写了 `run_sql` 的参数，随后第 9 步 tool 出现 `request_mismatch`。
- `alt-final` 只改最终答复。前 9 步全部 `same`，首次分歧落在第 10 步最终 LLM response 的 `$.choices[0].message.content`。

同样的场景由 `test/cli.test.ts` 中的 “localizes tool-level and answer-level divergence in a fixed scenario set” 自动断言。`FORKPOINT_DEMO_TODAY` 也需要传给 replay / verify，否则 system prompt 里的日期会变——这是把时间戳写进 prompt 的真实代价。

未设置 `OPENAI_API_KEY` 时，record 与 fork 使用脚本化的离线客户端，并在输出中明确标注 `scripted run`；replay 完全不调用客户端。设置后 record / fork 走真实 OpenAI 调用。两种模式都会录制到同一个 cassette schema。

当前不支持：流式响应（`stream: true` 显式报错，延期至 v0.2）、按步骤覆盖、成本估算、原始（未脱敏）导出、把导出文件导回并重放；fork 的工具世界是 closed-world，工具 fixture 按精确请求指纹匹配，模型即使只改写 SQL 别名也会 fixture miss。脱敏只能识别已知 header 名、敏感 env 后缀、自定义规则和常见 token 模式，不是 DLP；分享前仍需人工检查。clock / RNG 覆盖 `Date`、`performance.now`、`Math.random`、`crypto.randomUUID`、`crypto.getRandomValues`；live SDK / tool 内部的 clock / RNG 读取通过 AsyncLocalStorage 排除在录制之外，只有 agent 代码的读取进入 cassette，strict replay 要求完整消费这些读取。未包装的边界（例如自定义时钟、子进程）不在承诺内。fork 的 agent 代码可能让 clock / RNG 超出 baseline 序列，此时会采样新值并告警，而不是假装仍与 baseline 完全一致。完整清单见 [docs/limits.md](docs/limits.md)。

## 文档

- [产品文档（PRD）](docs/PRD.md)
- [需求说明书（SRS）](docs/SRS.md)
- [设计决策记录（ADR）](docs/decisions.md)
- [边界与不承诺](docs/limits.md)

## 路线图

| 时间 | 交付 |
|---|---|
| D1–D3 | 骨架、schema、canonical fingerprint、Text2SQL demo、record CLI（已完成） |
| D4–D7 | 录制：clock / RNG（已完成）、脱敏与 `export`（已完成）、流式 LLM（延期至 v0.2） |
| D8–D10 | strict replay、guard、verify（已完成）；止损检查 |
| D11–D14 | fork（已完成）、diff（已完成）、mutation benchmark（未完成）、README / decisions / limits / prior-art |
| D15–D21 | 博客、视频、GitHub Action、v0.1.0 |

## 设计原则

1. **显式失败**：宁可重放失败，也不静默产出“看起来成功”的假结果。
2. **边界而非全局**：只对声明支持的边界负责，不承诺的不假装支持。
3. **不造假**：不补 fixture、不合并两条 Run 的因果链。
4. **本地优先**：单文件 cassette、零遥测、可完全离线。

## License

Apache-2.0
