---
title: "Security"
description: "Why the container is the security boundary for REA, what each docker run hardening flag does, what the bridge enforces, and what to set before exposing it."
nav_order: 7
---

# Security

REA can run, drive and instrument the software it looks at, and it does no permission checks of its own. Anyone who can call its tools can run code inside the container. The container is the boundary, so keep it tight.

## Run it locked down

Every example in these docs uses the same flags. Keep all of them:

| Flag                                    | Why                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `--read-only`                           | Nothing REA or a target does can change the image's files.                                                                        |
| `--tmpfs /tmp:rw,nosuid,size=4g`        | Scratch space for JADX and Apktool, gone when the container stops. It cannot be `noexec`: the JVM loads native libraries from it. |
| `--tmpfs /home/rea:rw,nosuid,size=256m` | REA's home directory, also discarded on stop.                                                                                     |
| `--cap-drop ALL`                        | No Linux capabilities.                                                                                                            |
| `--security-opt no-new-privileges`      | No privilege gain through setuid binaries.                                                                                        |
| `-v "$PWD/targets:/work:ro"`            | REA sees only the targets, and cannot change them.                                                                                |
| `-p 127.0.0.1:8080:8080`                | The bridge answers only on the host's loopback.                                                                                   |

The image runs as the unprivileged `rea` user (UID 10001). Add `--network none` when the session needs no network. The CLI examples and the [skill's wrapper](agent-integrations.md#cli-wrapper) do. Never mount `/`, a home directory or the Docker socket.

## What the bridge enforces

- It won't start without a token of at least 32 characters.
- Every MCP request needs `Authorization: Bearer <token>`. The comparison is constant-time. Only `GET /healthz` is open, and it reveals nothing but the session count.
- The `Host` header must be in `REA_BRIDGE_ALLOWED_HOSTS`, which stops DNS rebinding from a browser. Turning that off takes an explicit `*`.
- Every `REA_BRIDGE_*` variable, the token included, is stripped from the environment REA runs with.
- Each MCP session gets its own REA process, so one client never sees another's analysis state. `REA_BRIDGE_MAX_SESSIONS` caps how many run at once.
- Request bodies are size-limited and must be JSON.
- Logs never contain the token or request bodies.

The [bridge source](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/src) is small enough to read, and its unit tests in [`tests/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/tests) check the token, `Host`, environment, session and body rules above.

## The stdio mode has no token

`mcp` mode serves REA's stdio MCP server directly. Whoever starts the container owns stdin and stdout, so there is nothing to authenticate. Keep the same hardening flags.

## Exposing it beyond localhost

The bridge speaks plain HTTP. If clients on other machines need it:

- Put a TLS reverse proxy in front, and keep the container port on 127.0.0.1 or a private network.
- Add the proxy's host name to `REA_BRIDGE_ALLOWED_HOSTS`.
- Use a fresh token from `openssl rand -hex 32`, and rotate it by restarting the container with a new one.

Anyone with the token can run code in the container. Treat it like an SSH key.

## Downloads

Everything the image or the installer downloads is fetched over HTTPS and checked against a SHA-256 committed to this repository: the JADX bridge jar, Apktool and Ghidra. npm packages install from a frozen lockfile with lifecycle scripts disabled, and only once they are at least seven days old. Base images are pinned by digest.

## Authorized use

Only analyze software you own or are authorized to examine. REA's [disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) applies. Run malware only on an isolated, disposable host, not on a machine you care about.
