import OpenAI from "openai";

export interface ChatClient {
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

export interface ClientSelection {
  client: ChatClient;
  kind: "openai" | "scripted" | "replay";
  model: string;
}

export function createClient(): ClientSelection {
  const model = process.env.FORKPOINT_DEMO_MODEL ?? "gpt-4.1-mini";
  if (process.env.OPENAI_API_KEY !== undefined && process.env.OPENAI_API_KEY !== "") {
    return {
      client: new OpenAI() as unknown as ChatClient,
      kind: "openai",
      model,
    };
  }

  process.stderr.write(
    "[demo] OPENAI_API_KEY is not set; using the scripted offline client. This is not a real model run.\n",
  );
  return { client: new ScriptedClient(), kind: "scripted", model: "scripted-model" };
}

export function createReplayClient(model: string): ClientSelection {
  return {
    client: {
      chat: {
        completions: {
          create: async () => {
            throw new Error("A live LLM call was attempted during strict replay.");
          },
        },
      },
    },
    kind: "replay",
    model,
  };
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface Message {
  role: string;
  content?: string | null;
  tool_calls?: ToolCall[];
}

const AMBIGUOUS_SQL = `
SELECT name, ROUND(SUM(o.amount), 2) AS total
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN products p ON p.id = o.product_id
GROUP BY name
ORDER BY total DESC
LIMIT 10
`.trim();

const WRONG_WINDOW_SQL = `
SELECT c.name AS customer_name, ROUND(SUM(o.amount), 2) AS total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= date('now', 'start of month')
GROUP BY c.name
ORDER BY total DESC
LIMIT 10
`.trim();

const CORRECTED_SQL = `
SELECT c.name AS customer_name, ROUND(SUM(o.amount), 2) AS total
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= date('now', 'start of month', '-1 month')
  AND o.created_at < date('now', 'start of month')
GROUP BY c.name
ORDER BY total DESC
LIMIT 10
`.trim();

const DEMO_PLAN = process.env.FORKPOINT_DEMO_PLAN ?? "baseline";

class ScriptedClient implements ChatClient {
  private step = 0;
  private nextCallId = 1;

  readonly chat = {
    completions: {
      create: async (request: Record<string, unknown>): Promise<unknown> => {
        return this.respond(request);
      },
    },
  };

  private respond(request: Record<string, unknown>): unknown {
    const step = this.step;
    this.step += 1;

    switch (step) {
      case 0:
        return completion(request, [this.toolCall("list_tables", {})]);
      case 1:
        return completion(request, [
          this.toolCall("describe_table", { table: "orders" }),
          this.toolCall("describe_table", { table: "customers" }),
        ]);
      case 2:
        return completion(request, [this.toolCall("run_sql", { sql: AMBIGUOUS_SQL })]);
      case 3:
        return completion(request, [
          this.toolCall("run_sql", {
            sql: DEMO_PLAN === "corrected" ? CORRECTED_SQL : WRONG_WINDOW_SQL,
          }),
        ]);
      default:
        return completion(request, undefined, summarize(request, this.step, DEMO_PLAN));
    }
  }

  private toolCall(name: string, args: Record<string, unknown>): ToolCall {
    const id = `call_${this.nextCallId}`;
    this.nextCallId += 1;
    return {
      id,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    };
  }
}

function completion(
  request: Record<string, unknown>,
  toolCalls?: ToolCall[],
  content?: string,
): unknown {
  return {
    id: `chatcmpl-scripted-${toolCalls === undefined ? "final" : toolCalls[0]!.id}`,
    object: "chat.completion",
    created: 0,
    model: request.model ?? "scripted-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: toolCalls === undefined ? (content ?? "已完成。") : null,
          ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }),
        },
        finish_reason: toolCalls === undefined ? "stop" : "tool_calls",
      },
    ],
    usage: {
      prompt_tokens: 420,
      completion_tokens: 60,
      total_tokens: 480,
    },
  };
}

function summarize(request: Record<string, unknown>, step: number, plan: string): string {
  const messages = Array.isArray(request.messages) ? (request.messages as Message[]) : [];
  const lastTool = [...messages].reverse().find((message) => message.role === "tool");
  if (lastTool?.content === undefined || lastTool.content === null) {
    return "查询完成，但脚本化客户端没有找到工具结果。";
  }

  try {
    const rows = JSON.parse(lastTool.content) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows) || rows.length === 0) return "上个月没有符合条件的订单。";
    const lines = rows.slice(0, 10).map((row, index) => {
      return `${index + 1}. ${String(row.customer_name)} — ¥${String(row.total)}`;
    });
    const note =
      plan === "alt-final"
        ? "\n\n（fork demo：工具结果与基线完全相同，最终答复由另一个模型/提示词生成。）"
        : "";
    return `上个月销售额最高的 10 个客户：\n${lines.join("\n")}${note}\n\n（step ${step}，scripted run）`;
  } catch {
    return "查询完成，但无法解析工具结果。";
  }
}
