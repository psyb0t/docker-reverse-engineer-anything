---
title: "HTTP bridge"
description: "How the Streamable HTTP bridge relays MCP to one rea mcp process per session: endpoints, authentication, session lifecycle, limits, status codes and logs."
nav_order: 6
---

# HTTP bridge

REA speaks MCP over stdio only. The bridge in [`src/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/src) is a Node service that accepts MCP over Streamable HTTP and relays every JSON-RPC message, unchanged, to a `rea mcp` child process over stdio. It does not interpret tools. Whatever REA registers is what the client sees.

## Endpoints

| Method and path | Auth         | What it does                                                                                                               |
| --------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /mcp`     | Bearer token | Sends JSON-RPC messages. Without an `mcp-session-id` header the body must contain `initialize`, which opens a new session. |
| `GET /mcp`      | Bearer token | Opens the server-to-client event stream of an existing session.                                                            |
| `DELETE /mcp`   | Bearer token | Ends a session and stops its REA process.                                                                                  |
| `GET /healthz`  | none         | Returns `{"status":"ok","sessions":N}`, where `N` counts live REA processes.                                               |

`REA_BRIDGE_PATH` moves `/mcp`. Any other path answers `404` with `{"error":"not found"}`.

Every MCP request goes through the same checks, in order:

1. The `Host` header must match `REA_BRIDGE_ALLOWED_HOSTS` (port ignored), unless that is `*`.
2. `Authorization: Bearer <token>` must match `REA_BRIDGE_TOKEN`. The bridge compares SHA-256 digests with a constant-time comparison, so timing does not reveal the token's length or content.
3. A `POST` body must be valid JSON no larger than `REA_BRIDGE_MAX_BODY_BYTES`.

## Sessions

Each MCP session gets its own `rea mcp` process, because REA keeps analysis state per process. Two sessions never share one. Implemented in [`src/session.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/session.ts).

- An `initialize` request starts a new REA process, and the response carries a random UUID in the `mcp-session-id` header. Later requests send that header. If the `initialize` does not complete, the bridge stops that REA process again.
- Every message from the client resets the session's idle timer.
- Progress notifications from REA go back on the HTTP stream of the request that asked for them.
- A session ends on `DELETE`, after `REA_BRIDGE_IDLE_TIMEOUT_SECONDS` without a message, when the client's transport closes, when REA exits, or when the container stops. Its REA process stops with it.
- At most `REA_BRIDGE_MAX_SESSIONS` REA processes run at once, counting ones still initializing. One more `initialize` gets `503`.

REA's stderr lines go into the bridge log at `info` with `"source":"rea"`.

## Status codes

Refusals from the bridge itself. MCP-level errors from REA arrive inside normal JSON-RPC responses.

| Status | Body                                                                   | Cause                                                                              |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `401`  | `{"error":"unauthorized"}` with `WWW-Authenticate: Bearer realm="rea"` | Missing or wrong token.                                                            |
| `403`  | JSON-RPC error                                                         | `Host` header not in `REA_BRIDGE_ALLOWED_HOSTS`.                                   |
| `400`  | JSON-RPC `-32700` `Parse error: body is not valid JSON`                | The body is not JSON.                                                              |
| `400`  | JSON-RPC `-32600` `Bad Request: no session ID; send initialize first`  | No `mcp-session-id` header and the request is not an `initialize` `POST`.          |
| `404`  | JSON-RPC `-32001` `Session not found`                                  | The session ID is unknown, or the session already ended. Start a new one.          |
| `404`  | `{"error":"not found"}`                                                | A path other than the MCP path or `GET /healthz`.                                  |
| `413`  | JSON-RPC `-32600` `Request body too large`                             | The body exceeds `REA_BRIDGE_MAX_BODY_BYTES`.                                      |
| `503`  | JSON-RPC `-32000` `Too many active sessions; close one or retry later` | `REA_BRIDGE_MAX_SESSIONS` REA processes are running.                               |
| `500`  | JSON-RPC `-32000` `Could not start REA` or `Internal error`            | REA failed to start, or the bridge hit an unexpected error. The log has the cause. |

## Limits

| Limit               | Value                                                    | Where                             |
| ------------------- | -------------------------------------------------------- | --------------------------------- |
| Request body        | `REA_BRIDGE_MAX_BODY_BYTES`, 4 MiB by default            | [Configuration](configuration.md) |
| Concurrent sessions | `REA_BRIDGE_MAX_SESSIONS`, 4 by default                  | [Configuration](configuration.md) |
| Idle session        | `REA_BRIDGE_IDLE_TIMEOUT_SECONDS`, 30 minutes by default | [Configuration](configuration.md) |
| Request headers     | must arrive within 30 seconds                            | fixed                             |
| Open connections    | 128                                                      | fixed                             |
| Request duration    | none                                                     | fixed                             |

There is no request timeout on purpose. Tool calls stream their results for as long as REA works on them, and native analysis can take minutes.

## Logs

The bridge writes JSON lines to stdout with `"service":"rea-bridge"`, an uppercase `level` and an ISO `time`. Each request carries a `request_id`, each new session a `connection_id`, and session events a `session_id`. The bridge never logs request bodies, and the pino redaction list in [`src/logger.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/logger.ts) replaces authorization headers, cookies, tokens, secrets, passwords and API keys with `[REDACTED]`.

The opt-in tool installer logs the same way to stderr with `"service":"rea-install"`.

On `SIGTERM` or `SIGINT` the bridge closes every session, stops their REA processes and exits.
