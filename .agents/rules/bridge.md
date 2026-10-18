# Bridge security contract

REA can run and instrument the programs it analyzes, so the bridge is a remote
code-execution surface by design. These properties are tested and must hold:

- The bridge refuses to start without `REA_BRIDGE_TOKEN` of at least 32
  characters. Every MCP request needs `Authorization: Bearer <token>`, compared
  in constant time. Only `GET /healthz` is open.
- `Host` headers are checked against `REA_BRIDGE_ALLOWED_HOSTS` to stop DNS
  rebinding. Disabling it takes an explicit `*`.
- Every `REA_BRIDGE_*` variable, the token included, is stripped from the
  environment REA runs with.
- Each MCP session gets its own `rea mcp` process. Sessions never share one.
  The process is stopped on DELETE, idle timeout, transport close and shutdown,
  and `REA_BRIDGE_MAX_SESSIONS` caps how many run at once.
- Request bodies are size-limited and must be JSON.
- The image runs as the unprivileged `rea` user. Documented `docker run`
  examples use a read-only root, tmpfs for `/tmp` and `/home/rea`, all
  capabilities dropped, `no-new-privileges`, targets mounted read-only and the
  port published on 127.0.0.1. Keep every example that way.
- Logs never include the token or request bodies; the pino redaction list in
  `src/logger.ts` stays in place.

The bridge forwards JSON-RPC messages without interpreting tools. It must not
grow tool-specific behavior; that belongs in REA upstream.
