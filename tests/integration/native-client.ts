// Drives REA's native analysis through the bridge after REA_INSTALL=ghidra:
// opens a binary that ships in the image (/usr/bin/tini), lists the functions
// Ghidra recovered, and checks the session is bound to Ghidra. Run by
// tests/integration/run.sh.
import assert from "node:assert/strict";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

const URL_MCP = new URL("http://localhost:8080/mcp");
const BINARY = "/usr/bin/tini";
// Ghidra imports and auto-analyzes before it answers the first query.
const TOOL_TIMEOUT_MS = 600_000;

function log(msg: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ level: "INFO", msg, ...fields })}\n`,
  );
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const started = Date.now();
  const result = await client.callTool(
    { name, arguments: args },
    { timeout: TOOL_TIMEOUT_MS, resetTimeoutOnProgress: true },
  );
  const text = JSON.stringify(result);
  assert.notEqual(
    result.isError,
    true,
    `${name} returned an error: ${text.slice(0, 2000)}`,
  );
  log("tool call passed", { tool: name, ms: Date.now() - started });
  return text;
}

async function main(): Promise<void> {
  const token = process.env.REA_BRIDGE_TOKEN ?? "";
  assert.ok(token.length >= 32, "REA_BRIDGE_TOKEN is not set");

  const transport = new StreamableHTTPClientTransport(URL_MCP, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({
    name: "rea-native-integration-test",
    version: "0.0.0",
  });
  await client.connect(transport);
  try {
    await call(client, "open_binary", { path: BINARY });

    // Function inventory only exists once Ghidra has imported and analyzed it.
    const procedures = await call(client, "list_procedures", {});
    assert.match(
      procedures,
      /FUN_|entry|main/,
      `list_procedures returned no functions: ${procedures.slice(0, 1500)}`,
    );

    const session = await call(client, "binary_session", {});
    assert.match(
      session,
      /ghidra/i,
      `binary_session does not name the Ghidra provider: ${session.slice(0, 1500)}`,
    );
  } finally {
    await transport.terminateSession();
    await client.close();
  }
}

await main();
