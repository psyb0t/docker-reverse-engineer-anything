---
title: "Agent integrations"
description: "Install the reverse-engineer-anything skill in Claude Code, Codex or OpenClaw, use its locked-down CLI wrapper, the OpenClaw MCP plugin, and the MCP registry entry."
nav_order: 8
---

# Agent integrations

Everything an agent needs lives in [`.agents/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/.agents): a skill, the Claude Code and Codex plugin manifests, and an OpenClaw plugin.

## Skill

The [`reverse-engineer-anything` skill](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/.agents/skills/reverse-engineer-anything) teaches the agent the APK workflow (package overview, class search, decompiled classes and methods, reference tracing, decoded resources), the safety rules, and how to run the container. It ships a CLI wrapper.

Claude Code, after adding the marketplace once:

```bash
claude plugin marketplace add psyb0t/agents
claude plugin install reverse-engineer-anything@psyb0t
```

Codex:

```bash
codex plugin add reverse-engineer-anything@psyb0t
```

OpenClaw: install it from [ClawHub](https://clawhub.ai). Every release publishes it there.

The skill needs Docker on the host. It pulls `psyb0t/reverse-engineer-anything` from Docker Hub.

## CLI wrapper

[`scripts/rea.sh`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/.agents/skills/reverse-engineer-anything/scripts/rea.sh) in the skill runs one REA CLI command in the image, locked down: no network, a read-only root, all capabilities dropped, `no-new-privileges`, a 512-process limit, a 6 GiB memory limit, and the target directory mounted read-only at `/work`.

```bash
scripts/rea.sh --dir ./apks inspect-android-package /work/app.apk
scripts/rea.sh --dir ./apks search-android-classes /work/app.apk MainActivity
scripts/rea.sh --dir ./apks inspect-android-method /work/app.apk com.example.MainActivity onCreate
```

| Option          | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| `--dir DIR`     | Directory mounted read-only at `/work`. Defaults to the current directory.    |
| `--network`     | Allow network access, for adb over TCP or website analysis. Off by default.   |
| `-h`, `--usage` | The wrapper's own help. `--help` goes to REA and lists every REA command.     |
| `REA_IMAGE`     | Environment variable that replaces `psyb0t/reverse-engineer-anything:latest`. |

Results are JSON on stdout. Pass container paths (`/work/...`), never host paths.

## OpenClaw plugin

[`@psyb0t/reverse-engineer-anything`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/.agents/plugins/reverse-engineer-anything) is a stdio bridge for MCP clients that only launch local commands. It runs [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) against a container you already run, at `$REA_URL/mcp`, and sends `REA_BRIDGE_TOKEN` as the `Authorization` header.

| Variable           | Required | Description                                                                                |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| `REA_URL`          | yes      | Base URL of the container, for example `http://localhost:8080`. The plugin appends `/mcp`. |
| `REA_BRIDGE_TOKEN` | yes      | The token the container was started with.                                                  |

The plugin does not ship REA or the image. It is MIT-licensed, unlike the rest of this repository.

## MCP registry

The image is listed in the MCP registry as `io.github.psyb0t/reverse-engineer-anything`, from [`server.json`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/server.json). The entry describes the OCI image with the Streamable HTTP transport at `http://localhost:8080/mcp` and the required `Authorization` header and `REA_BRIDGE_TOKEN`. The image's `io.modelcontextprotocol.server.name` label proves the registry entry owns the image.
