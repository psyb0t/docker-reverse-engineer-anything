// Stand-in for `rea mcp` in the bridge tests: a minimal JSON-RPC server over
// stdio with an echo tool that reports progress and a tool that reveals what
// the child process can see of its environment.
import { createInterface } from "node:readline";

type Message = {
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
};

function write(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle(message: Message): void {
  if (message.id === undefined || message.method === undefined) return;
  const { id, method } = message;
  const params = message.params ?? {};

  switch (method) {
    case "initialize":
      write({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fake-rea", version: "0.0.0" },
        },
      });
      return;
    case "ping":
      write({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      write({
        jsonrpc: "2.0",
        id,
        result: {
          tools: [
            {
              name: "echo",
              inputSchema: {
                type: "object",
                properties: { text: { type: "string" } },
              },
            },
            {
              name: "environment",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        },
      });
      return;
    case "tools/call": {
      const name = params.name;
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const meta = (params._meta ?? {}) as Record<string, unknown>;
      if (meta.progressToken !== undefined) {
        write({
          jsonrpc: "2.0",
          method: "notifications/progress",
          params: { progressToken: meta.progressToken, progress: 1, total: 1 },
        });
      }
      const text =
        name === "environment"
          ? JSON.stringify({
              cwd: process.cwd(),
              bridgeVariables: Object.keys(process.env).filter((key) =>
                key.startsWith("REA_BRIDGE_"),
              ),
            })
          : typeof args.text === "string"
            ? args.text
            : "";
      write({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text }] },
      });
      return;
    }
    default:
      write({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.trim() !== "") handle(JSON.parse(line) as Message);
});
