import type { DatabaseSync } from "node:sqlite";
import { tool } from "../../src/index.js";
import { describeTable, listTableNames, runReadOnlySql } from "./db.js";
import type { ChatClient } from "./client.js";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface SqlAgentTools {
  listTables: () => string[];
  describeTable: (table: string) => Array<Record<string, unknown>>;
  runSql: (sql: string) => Array<Record<string, unknown>>;
  definitions: ToolDefinition[];
}

export function createTools(db: DatabaseSync): SqlAgentTools {
  const listTables = tool("list_tables", () => listTableNames(db));
  const describe = tool("describe_table", (table: string) => describeTable(db, table));
  const runSql = tool("run_sql", (sql: string) => runReadOnlySql(db, sql));

  return {
    listTables,
    describeTable: describe,
    runSql,
    definitions: [
      {
        type: "function",
        function: {
          name: "list_tables",
          description: "List the tables in the read-only sales database.",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      },
      {
        type: "function",
        function: {
          name: "describe_table",
          description: "Show columns for one table.",
          parameters: {
            type: "object",
            properties: {
              table: { type: "string", enum: ["customers", "orders", "products"] },
            },
            required: ["table"],
            additionalProperties: false,
          },
        },
      },
      {
        type: "function",
        function: {
          name: "run_sql",
          description: "Run one read-only SELECT query and return rows as JSON.",
          parameters: {
            type: "object",
            properties: { sql: { type: "string" } },
            required: ["sql"],
            additionalProperties: false,
          },
        },
      },
    ],
  };
}

interface ToolCall {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: ToolCall[] };
    finish_reason?: string;
  }>;
}

type Message = Record<string, unknown>;

export interface RunAgentOptions {
  client: ChatClient;
  model: string;
  tools: SqlAgentTools;
  question: string;
  maxSteps?: number;
}

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const today = process.env.FORKPOINT_DEMO_TODAY ?? new Date().toISOString();
  const messages: Message[] = [
    { role: "system", content: systemPrompt(today) },
    { role: "user", content: options.question },
  ];
  const maxSteps = options.maxSteps ?? 8;

  for (let step = 0; step < maxSteps; step += 1) {
    const response = (await options.client.chat.completions.create({
      model: options.model,
      messages,
      tools: options.tools.definitions,
      temperature: 0,
      stream: false,
    })) as ChatResponse;

    const choice = response.choices?.[0];
    const message = choice?.message;
    if (message === undefined) throw new Error("The model returned no choices.");

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return message.content ?? "";
    }

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name ?? "";
      let output: unknown;
      try {
        const args = parseArguments(call.function?.arguments);
        output = await executeTool(options.tools, name, args);
      } catch (error) {
        output = { error: error instanceof Error ? error.message : String(error) };
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output),
      });
    }
  }

  throw new Error(`The agent did not finish within ${maxSteps} steps.`);
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined || raw === "") return {};
  const parsed = JSON.parse(raw) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

async function executeTool(
  tools: SqlAgentTools,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_tables":
      return tools.listTables();
    case "describe_table":
      return tools.describeTable(String(args.table));
    case "run_sql":
      return tools.runSql(String(args.sql));
    default:
      throw new Error(`Unknown tool "${name}".`);
  }
}

function systemPrompt(todayIso: string): string {
  return [
    "You are a careful SQL analyst with read-only access to a sales database.",
    `Today is ${todayIso}. "Last month" means the previous calendar month.`,
    "Inspect the schema before writing SQL. Use only the provided tools. Do not invent data.",
    "When you have the answer, reply in Chinese with the customer names and amounts.",
  ].join(" ");
}
