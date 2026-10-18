#!/usr/bin/env node
// reverse-engineer-anything MCP bridge. A thin stdio<->HTTP proxy: forwards MCP
// over stdio to a running reverse-engineer-anything container's Streamable
// HTTP endpoint (`$REA_URL/mcp`), authenticating with `$REA_BRIDGE_TOKEN`.
//
// stdout IS the MCP protocol channel, so diagnostics go to stderr only. The
// sole output here is a fatal pre-launch console.error (user-facing CLI
// output). The token is passed to the proxy as an argv header, never logged.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const MCP_PATH = "/mcp";

const base = process.env.REA_URL;
const token = process.env.REA_BRIDGE_TOKEN;

if (!base || !token) {
  console.error(
    `[reverse-engineer-anything-mcp] Missing ${base ? "REA_BRIDGE_TOKEN" : "REA_URL"}.

Point this bridge at your running container, e.g.:
  export REA_URL=http://localhost:8080
  export REA_BRIDGE_TOKEN=the-token-the-container-was-started-with

The container is self-hosted; see https://github.com/psyb0t/docker-reverse-engineer-anything`,
  );
  process.exit(1);
}

const url = `${base.replace(/\/+$/, "")}${MCP_PATH}`;
const proxyEntry = require.resolve("mcp-remote/dist/proxy.js");

const args = [
  proxyEntry,
  url,
  "--transport",
  "http-only",
  "--header",
  `Authorization: Bearer ${token}`,
  ...process.argv.slice(2),
];

const result = spawnSync(process.execPath, args, { stdio: "inherit" });
process.exit(result.status ?? 1);
