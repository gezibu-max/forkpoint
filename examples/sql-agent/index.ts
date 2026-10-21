import { Forkpoint } from "../../src/index.js";
import { createClient } from "./client.js";
import { ensureDatabase } from "./db.js";
import { createTools, runAgent } from "./agent.js";

const question =
  process.env.FORKPOINT_DEMO_QUESTION ?? "上个月销售额最高的 10 个客户是谁？请给出客户名和销售额。";

const db = ensureDatabase();
const selection = createClient();
const tools = createTools(db);
const forkpoint = new Forkpoint({ store: process.env.FORKPOINT_STORE ?? ".forkpoint" });
const client = forkpoint.wrapOpenAI(selection.client);

try {
  const answer = await forkpoint.run("sql-agent-fail", () =>
    runAgent({
      client,
      model: selection.model,
      tools,
      question,
    }),
  );
  process.stdout.write(`\n[answer]\n${answer}\n`);
} finally {
  db.close();
}
