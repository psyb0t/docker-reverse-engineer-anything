import assert from "node:assert/strict";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { loadConfig } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { createBridge, type Bridge } from "../src/server.ts";

const TOKEN = "x".repeat(48);
const FAKE_REA = fileURLToPath(
  new URL("./fixtures/fake-mcp.ts", import.meta.url),
);

function startBridge(
  overrides: Record<string, string> = {},
): Promise<{ bridge: Bridge; url: URL }> {
  const config = loadConfig({
    REA_BRIDGE_TOKEN: TOKEN,
    REA_BRIDGE_HOST: "127.0.0.1",
    REA_BRIDGE_PORT: "1",
    REA_BRIDGE_REA_COMMAND: process.execPath,
    REA_BRIDGE_REA_ARGS: JSON.stringify([FAKE_REA]),
    REA_BRIDGE_WORKDIR: process.cwd(),
    REA_BRIDGE_LOG_LEVEL: "error",
    ...overrides,
  });
  const bridge = createBridge(config, createLogger("error"));
  return new Promise((resolve) => {
    bridge.server.listen(0, "127.0.0.1", () => {
      const { port } = bridge.server.address() as AddressInfo;
      resolve({ bridge, url: new URL(`http://localhost:${String(port)}/mcp`) });
    });
  });
}

async function connect(
  url: URL,
  token = TOKEN,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "bridge-test", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const initializeBody = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "raw", version: "0" },
  },
});

describe("bridge", () => {
  let bridge: Bridge;
  let url: URL;

  before(async () => {
    ({ bridge, url } = await startBridge());
  });

  after(async () => {
    await bridge.close();
  });

  it("answers the health check without a token", async () => {
    const res = await fetch(new URL("/healthz", url));
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as { status: string }).status, "ok");
  });

  it("refuses requests without the right token", async () => {
    for (const authorization of [undefined, "Bearer wrong", `Basic ${TOKEN}`]) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      if (authorization !== undefined) headers.authorization = authorization;
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: initializeBody,
      });
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("www-authenticate"), 'Bearer realm="rea"');
    }
    assert.equal(bridge.sessionCount(), 0);
  });

  it("refuses a Host header outside the allow list", async () => {
    // fetch() will not send a forged Host header; node:http will.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "POST",
          headers: {
            host: "attacker.example",
            authorization: `Bearer ${TOKEN}`,
            "content-type": "application/json",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end(initializeBody);
    });
    assert.equal(status, 403);
    assert.equal(bridge.sessionCount(), 0);
  });

  it("refuses requests without a session that are not initialize", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(res.status, 400);
  });

  it("returns 404 for an unknown session", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-session-id": "not-a-session",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(res.status, 404);
  });

  it("rejects invalid JSON", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: "{not json",
    });
    assert.equal(res.status, 400);
  });

  it("relays tools, calls and progress to and from the child", async () => {
    const { client, transport } = await connect(url);
    try {
      const tools = await client.listTools();
      assert.deepEqual(
        tools.tools.map((tool) => tool.name),
        ["echo", "environment"],
      );

      const progress: number[] = [];
      const result = await client.callTool(
        { name: "echo", arguments: { text: "hello" } },
        {
          onprogress: (update) => {
            progress.push(update.progress);
          },
        },
      );
      assert.deepEqual(result.content, [{ type: "text", text: "hello" }]);
      assert.deepEqual(progress, [1]);
    } finally {
      await transport.terminateSession();
      await client.close();
    }
    await waitFor(() => bridge.sessionCount() === 0);
  });

  it("keeps the token and bridge settings out of the child environment", async () => {
    const { client, transport } = await connect(url);
    try {
      const result = await client.callTool({
        name: "environment",
        arguments: {},
      });
      const content = result.content as { type: string; text: string }[];
      const seen = JSON.parse(content[0]?.text ?? "{}") as {
        cwd: string;
        bridgeVariables: string[];
      };
      assert.deepEqual(seen.bridgeVariables, []);
      assert.equal(seen.cwd, process.cwd());
    } finally {
      await transport.terminateSession();
      await client.close();
    }
  });

  it("gives each session its own child process", async () => {
    const first = await connect(url);
    const second = await connect(url);
    try {
      assert.notEqual(first.transport.sessionId, second.transport.sessionId);
      assert.equal(bridge.sessionCount(), 2);
    } finally {
      for (const { client, transport } of [first, second]) {
        await transport.terminateSession();
        await client.close();
      }
    }
    await waitFor(() => bridge.sessionCount() === 0);
  });
});

describe("bridge limits", () => {
  it("refuses sessions beyond the limit and frees the slot on close", async () => {
    const { bridge, url } = await startBridge({ REA_BRIDGE_MAX_SESSIONS: "1" });
    try {
      const first = await connect(url);
      await assert.rejects(connect(url));
      await first.transport.terminateSession();
      await first.client.close();
      await waitFor(() => bridge.sessionCount() === 0);

      const again = await connect(url);
      await again.transport.terminateSession();
      await again.client.close();
    } finally {
      await bridge.close();
    }
  });

  it("closes idle sessions and their child", async () => {
    const { bridge, url } = await startBridge({
      REA_BRIDGE_IDLE_TIMEOUT_SECONDS: "1",
    });
    try {
      const { client } = await connect(url);
      assert.equal(bridge.sessionCount(), 1);
      await waitFor(() => bridge.sessionCount() === 0, 4000);
      await client.close();
    } finally {
      await bridge.close();
    }
  });

  it("closes every session on shutdown", async () => {
    const { bridge, url } = await startBridge();
    const { client } = await connect(url);
    assert.equal(bridge.sessionCount(), 1);
    await bridge.close();
    assert.equal(bridge.sessionCount(), 0);
    await client.close();
  });

  it("rejects oversized bodies", async () => {
    const { bridge, url } = await startBridge({
      REA_BRIDGE_MAX_BODY_BYTES: "1024",
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ padding: "p".repeat(2048) }),
      });
      assert.equal(res.status, 413);
    } finally {
      await bridge.close();
    }
  });
});
