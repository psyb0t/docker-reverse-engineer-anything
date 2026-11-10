---
title: "Troubleshooting"
description: "Exact bridge startup refusals, opt-in tool installer errors and HTTP errors from reverse-engineer-anything, with the cause and the fix for each."
nav_order: 9
---

# Troubleshooting

Logs are JSON lines. Read them with `docker logs rea`. In bridge mode the startup refusal is the `err` field of the `invalid configuration` line.

## Bridge startup refusals

The bridge checks its settings before it listens and exits with code 2 on the first bad one. The messages come from [`src/config.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/config.ts).

| Message                                                                   | Fix                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `REA_BRIDGE_TOKEN is required; generate one with: openssl rand -hex 32`   | Pass `-e REA_BRIDGE_TOKEN` with a value set in your shell.                                                                              |
| `REA_BRIDGE_TOKEN must be at least 32 characters`                         | Use `openssl rand -hex 32`, which gives 64.                                                                                             |
| `REA_BRIDGE_PATH must start with "/", got "..."`                          | Write the path with a leading slash, like `/mcp`.                                                                                       |
| `REA_BRIDGE_LOG_LEVEL must be one of debug, info, warn, error, got "..."` | Use one of those four, in lowercase.                                                                                                    |
| `REA_BRIDGE_PORT must be a whole number, got "..."`                       | Digits only. The same message appears for `REA_BRIDGE_MAX_SESSIONS`, `REA_BRIDGE_IDLE_TIMEOUT_SECONDS` and `REA_BRIDGE_MAX_BODY_BYTES`. |
| `REA_BRIDGE_MAX_SESSIONS must be between 1 and 64, got ...`               | Stay inside the range. [Configuration](configuration.md#bridge) lists each variable's range.                                            |
| `REA_BRIDGE_ALLOWED_HOSTS has no entries`                                 | The value held only commas or spaces. List host names, or use `*` to turn the check off.                                                |

## Opt-in tool installer

With `REA_INSTALL` set, the installer runs before any mode and stops the container with exit code 1 on failure. It logs `tool installation failed` with the reason in `err`, on stderr. Messages from [`src/tools.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/tools.ts) and [`src/install.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/install.ts):

| Message                                                                                            | Fix                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `REA_INSTALL lists unknown tool "..."; supported: ghidra`                                          | Fix the name.                                                                                                        |
| `cannot install ghidra: the official Ghidra release has no native decompiler for linux arm64; ...` | Use the amd64 image, or mount your own Ghidra build and set `GHIDRA_INSTALL_DIR`.                                    |
| `/opt/rea-tools is not writable; mount a volume there, e.g. -v rea-tools:/opt/rea-tools`           | Mount a volume at `REA_TOOLS_DIR`. A `--read-only` container needs one.                                              |
| `downloading ghidra failed: HTTP ...`                                                              | The container could not fetch the release from GitHub. Check its network access on the first start.                  |
| `ghidra checksum mismatch: expected ..., got ...`                                                  | The download is not the pinned release. Nothing was installed. Retry, and check for a proxy that rewrites downloads. |
| `ghidra download exceeds 2147483648 bytes`                                                         | Same as above: the server sent something other than the pinned archive.                                              |
| `ghidra archive is missing ...`                                                                    | The archive lacks a file REA needs. Report it as a bug here.                                                         |
| `unzip exited with code ...`                                                                       | Unpacking failed, for example because the volume is full. Free space and restart.                                    |

## HTTP errors

| You see                                      | Cause                                                                              | Fix                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `401`                                        | The token is missing or wrong.                                                     | Send `Authorization: Bearer <token>` with the exact token the container got.             |
| `403`                                        | The `Host` header is not in `REA_BRIDGE_ALLOWED_HOSTS`.                            | Add the host name clients use, for example a proxy's name.                               |
| `404` `Session not found`                    | The session ended: idle timeout, `DELETE`, REA exited, or the container restarted. | Reconnect. The client starts a new session with `initialize`.                            |
| `400` `no session ID; send initialize first` | The client sent a request without a session and it was not `initialize`.           | Use an MCP client, or send `initialize` first and reuse the `mcp-session-id` it returns. |
| `413`                                        | The request body exceeds `REA_BRIDGE_MAX_BODY_BYTES`.                              | Raise the limit.                                                                         |
| `503`                                        | Every session slot is busy.                                                        | Close sessions you no longer use, or raise `REA_BRIDGE_MAX_SESSIONS`.                    |
| Connection refused                           | Nothing listens on that port.                                                      | Check `docker ps` and `docker logs rea`. The bridge may have refused to start.           |

[HTTP bridge](http-bridge.md#status-codes) lists every response body.

## Analysis problems

- **A file is not found**: pass the container path (`/work/app.apk`), not the host path, and check the directory is mounted at `/work`.
- **Large APKs time out or run out of memory**: raise `REA_JADX_HEAP_MIB` and `REA_JADX_OPERATION_TIMEOUT_MS`, give the container more memory, and make sure the `/tmp` tmpfs is big enough for a copy of the APK.
- **Native tools say Ghidra is missing**: start the container with `REA_INSTALL=ghidra` and a volume, or set `GHIDRA_INSTALL_DIR`. See [Opt-in tools](opt-in-tools.md).
- **adb sees no device**: the container needs a network that reaches the device, or `--device` for USB. The CLI wrapper needs `--network`.
