---
title: "Configuration"
description: "Every REA_BRIDGE_* and REA_INSTALL environment variable with defaults and valid ranges, plus the REA variables that pass through to REA."
nav_order: 5
---

# Configuration

Everything is set through environment variables on `docker run`. The bridge reads its settings once at startup in [`src/config.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/config.ts), and any invalid value stops it with exit code 2 instead of falling back to a default. [Troubleshooting](troubleshooting.md#bridge-startup-refusals) lists each message.

## Bridge

These apply to the default `bridge` mode.

| Variable                          | Default                     | Valid values                       | Description                                                                               |
| --------------------------------- | --------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `REA_BRIDGE_TOKEN`                | required                    | 32 characters or more              | Bearer token every MCP request must send. Never passed to REA.                            |
| `REA_BRIDGE_PORT`                 | `8080`                      | 1 to 65535                         | Listen port inside the container.                                                         |
| `REA_BRIDGE_HOST`                 | `0.0.0.0`                   | an address                         | Listen address inside the container.                                                      |
| `REA_BRIDGE_PATH`                 | `/mcp`                      | starts with `/`                    | MCP endpoint path.                                                                        |
| `REA_BRIDGE_ALLOWED_HOSTS`        | `localhost,127.0.0.1,[::1]` | comma-separated host names, or `*` | Accepted `Host` header names, port ignored (DNS rebinding guard). `*` disables the check. |
| `REA_BRIDGE_MAX_SESSIONS`         | `4`                         | 1 to 64                            | Concurrent MCP sessions, each with its own REA process.                                   |
| `REA_BRIDGE_IDLE_TIMEOUT_SECONDS` | `1800`                      | 1 to 86400                         | Idle sessions get closed and their REA process stopped.                                   |
| `REA_BRIDGE_MAX_BODY_BYTES`       | `4194304`                   | 1024 to 67108864                   | Largest accepted request body.                                                            |
| `REA_BRIDGE_LOG_LEVEL`            | `info`                      | `debug`, `info`, `warn`, `error`   | Log level. Logs are JSON lines on stdout. The opt-in tool installer uses the same level.  |
| `REA_BRIDGE_WORKDIR`              | `/work`                     | a directory                        | Working directory of each REA process. The image sets it to `/work`.                      |

Generate a token with:

```bash
openssl rand -hex 32
```

Host names in `REA_BRIDGE_ALLOWED_HOSTS` are compared in lowercase. Write an IPv6 address in brackets, like `[::1]`. When you put a reverse proxy in front, add the host name clients use.

Two more variables exist for the bridge's own tests: `REA_BRIDGE_REA_COMMAND` (default `rea`) and `REA_BRIDGE_REA_ARGS` (a JSON array of strings, default `["mcp"]`) replace the command each session runs. Leave them unset in production.

Every variable whose name starts with `REA_BRIDGE_` is removed from the environment REA runs with, so the token never reaches REA or the programs it starts.

## Opt-in tools

These apply to every mode. See [Opt-in tools](opt-in-tools.md).

| Variable             | Default          | Description                                                                               |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `REA_INSTALL`        | unset            | Comma-separated opt-in tools to install on start. Today: `ghidra`.                        |
| `REA_TOOLS_DIR`      | `/opt/rea-tools` | Where opt-in tools are installed. Mount a volume here.                                    |
| `GHIDRA_INSTALL_DIR` | unset            | Your own Ghidra. When set, `REA_INSTALL=ghidra` skips the download and REA uses this one. |

## REA's own variables

Everything else passes straight through to REA. Useful ones:

| Variable                        | Use                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `REA_JADX_HEAP_MIB`             | More heap for JADX on big APKs.                                                   |
| `REA_JADX_OPERATION_TIMEOUT_MS` | A longer JADX timeout on big APKs.                                                |
| `REA_LOG_LEVEL`                 | REA's own log level. In bridge mode REA's stderr lines show up in the bridge log. |
| `REA_MCP_MAX_RESPONSE_BYTES`    | REA's cap on one MCP response.                                                    |
| `REA_IDA_MCP_CONFIG`            | Bring your own IDA.                                                               |
| `REA_JEB_MCP_URL`               | Bring your own JEB.                                                               |

REA's [documentation](https://github.com/morluto/rea/tree/main/docs) has the full list. The image presets `JAVA_HOME`, `REA_JADX_MCP_JAR`, `REA_APKTOOL_COMMAND` and `REA_ADB_PATH` (see [preset paths](image.md#preset-paths)). Override them only if you mount a replacement tool.
