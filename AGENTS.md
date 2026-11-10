# reverse-engineer-anything

Instructions for coding agents (Codex, Claude Code and others) and for people changing this repository. Users of the image want the documentation site, https://psyb0t.github.io/docker-reverse-engineer-anything/, not this file.

## Agent setup

`CLAUDE.md` is a committed symlink to `AGENTS.md`, and `.claude` is a committed symlink to `.agents`, so Claude Code reads the same instructions, rules and skills as Codex. Claude's Edit and Write tools refuse to write through a symlink, so edit `AGENTS.md` and `.agents/rules/*.md` directly.

## What it is

Docker packaging for [REA](https://github.com/morluto/rea) (`rea-agents`), the reverse-engineering MCP server and CLI by morluto, plus a Streamable HTTP bridge in front of its stdio MCP server. This repository does not fork or modify REA. It installs the published npm package.

The image `psyb0t/reverse-engineer-anything` ships REA with the Android toolchain it drives: a full JDK 21 (REA compiles its JADX bridge with `jdk.compiler`), the exact JADX bridge jar REA pins, Apktool and adb. APK analysis is the feature that must keep working. Ghidra is opt-in and installed at container start by `REA_INSTALL=ghidra`.

## Architecture

- `docker/entrypoint.sh` runs under `tini` as the `rea` user (UID 10001). When `REA_INSTALL` is set it first runs `node /app/dist/install.js <env-file>` and sources the variables it writes. Then `bridge` (the default) execs `node /app/dist/main.js`, `mcp` execs `rea mcp`, and anything else execs `rea "$@"`.
- `src/main.ts` loads `src/config.ts` (exits 2 on a `ConfigError`), starts the server from `src/server.ts`, and closes every session on `SIGTERM`/`SIGINT`.
- `src/server.ts` is a plain `node:http` server. `GET /healthz` is open. On the MCP path (`REA_BRIDGE_PATH`, default `/mcp`) it checks the `Host` header (`hostHeaderValidation` from `@modelcontextprotocol/node`), then the bearer token (`src/auth.ts`, SHA-256 digests compared with `timingSafeEqual`), then reads a size-limited JSON body. A request with an `mcp-session-id` goes to that session; an `initialize` without one opens a new session if `REA_BRIDGE_MAX_SESSIONS` allows. No request timeout, a 30 s header timeout and 128 connections at most.
- `src/session.ts` (`ReaSession`) pairs one `NodeStreamableHTTPServerTransport` facing the client with one `StdioClientTransport` running `rea mcp`, and relays JSON-RPC messages unchanged. It routes progress notifications back to the request that carried the progress token, logs REA's stderr lines with `source: "rea"`, and closes on `DELETE`, idle timeout, transport close, REA exit or shutdown.
- `src/config.ts` strips every `REA_BRIDGE_*` variable from the environment REA gets (`childEnvironment`).
- `src/tools.ts` holds the opt-in tool specs (`TOOLS`, Ghidra only) and the installer logic: pinned URL and SHA-256, install into `REA_TOOLS_DIR/<name>-<version>` with a `.rea-install.json` marker, arch refusal, user override through `GHIDRA_INSTALL_DIR`. `src/install.ts` is the entrypoint helper that runs it with `unzip` and logs to stderr.
- `src/logger.ts` builds the pino logger: JSON lines, uppercase level, ISO time, a redaction list for tokens and auth headers.

Request path: client -> `POST /mcp` -> host check -> token check -> body -> `ReaSession` -> `rea mcp` over stdio -> back through the same session's HTTP response or SSE stream.

## Stack

- TypeScript run by Node 24 (`node:24-trixie-slim`, pinned by digest), ESM, `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Tests and scripts run as `.ts` directly under Node's type stripping; the image runs `tsc` output from `dist/`.
- Runtime dependencies: `rea-agents`, `@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `@modelcontextprotocol/node`, `pino`. Exact versions in `package.json`, resolved by pnpm through `scripts/pkg.sh` with a seven-day release-age gate.
- Lint: `tsc`, eslint (`typescript-eslint` strict type-checked), prettier, shellcheck, hadolint. Tests: `node --test`.
- Image: Debian 13 packages `openjdk-21-jdk-headless`, `adb`, `procps`, `tini`, `unzip`. JADX bridge jar and Apktool downloaded in the `android-tools` stage and checked against SHA-256 build args.
- CI: `.github/workflows/pipeline.yml` calling `psyb0t/reusable-github-workflows`.

## Layout

| Path                                                | What it holds                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/`                                              | The bridge and the opt-in tool installer                                                            |
| `docker/`                                           | `entrypoint.sh` and the `apktool` launcher                                                          |
| `Dockerfile`                                        | The production image: `pnpm`, `build`, `prod-deps`, `android-tools`, `runtime` stages               |
| `Dockerfile.dev`                                    | `tools` (Node and pnpm) and `dev` (locked dependencies at `/opt/deps`) images for every Make target |
| `tests/*.test.ts`                                   | Bridge, config, auth and installer unit tests                                                       |
| `tests/fixtures/fake-mcp.ts`                        | Stand-in for `rea mcp` used by the unit tests                                                       |
| `tests/integration/`                                | `run.sh` and the MCP clients that test the built image against the pinned APK and Ghidra            |
| `scripts/`                                          | `pkg.sh` (dependency lifecycle), `set-version.sh`, `fetch-fixtures.ts`                              |
| `release-age-cutoff`, `pnpm-workspace.yaml`         | The release-age gate and pnpm's supply-chain settings                                               |
| `docs/`                                             | The documentation site (GitHub Pages, Jekyll, Just the Docs)                                        |
| `.agents/skills/reverse-engineer-anything/`         | The agent skill, its `references/setup.md` and the `scripts/rea.sh` CLI wrapper                     |
| `.agents/plugins/reverse-engineer-anything/`        | The OpenClaw stdio-to-HTTP MCP plugin (MIT)                                                         |
| `.agents/.claude-plugin/`, `.agents/.codex-plugin/` | Claude Code and Codex plugin manifests                                                              |
| `.agents/rules/`                                    | Rules for changing this repository                                                                  |
| `server.json`, `glama.json`                         | MCP registry and Glama metadata                                                                     |
| `THIRD_PARTY_NOTICES.md`                            | Licenses of what the image redistributes                                                            |
| `.github/workflows/`                                | `pipeline.yml` plus repository housekeeping workflows                                               |

## Commands

The host needs only Docker, Make, Git and a shell. Everything else runs in containers.

```bash
make help                       # every target
make lint                       # tsc, eslint, prettier, shellcheck, hadolint
make format                     # apply prettier
make test                       # test-unit, then test-integration
make test-unit                  # bridge unit tests against the stand-in MCP server
make test-integration           # build the image, fetch the APK, run tests/integration/run.sh
make build                      # build psyb0t/reverse-engineer-anything:v<VERSION> and :latest
make run                        # run the bridge on 127.0.0.1:8080 (needs REA_BRIDGE_TOKEN)
make docs                       # build the site into .testing/docs-site
make version V=X.Y.Z            # set VERSION and the Codex manifest, no commit, no tag
make pkg-update PKG=rea-agents  # the only way to change a dependency (see supply-chain rule)
make clean                      # drop the test image, the Ghidra cache volume and fixtures
```

## Project-specific landmines

- The opt-in tool installer (`src/install.ts`, run by the entrypoint before any mode when `REA_INSTALL` is set) must log to stderr only. In `mcp` mode stdout is REA's protocol channel, and one stray byte breaks the client.
- The JADX bridge version and SHA-256 in the `Dockerfile` must match what the installed REA pins in its `src/android/JadxRelease.ts`. REA rejects any other jar.
- `code-workflow.yml` takes its concurrency group from the caller's workflow, event and ref, so two calls of it in one run cancel each other unless one `needs` the other. The arm64 `code-arm64` job waits for `code` for that reason. The same bug kept v0.1.0 from publishing.
- The integration test's Ghidra download is about 570 MB and is cached in the `rea-integration-tools` volume.

## Rules

Rules for every change live in `.agents/rules/`, one file per topic. Read the ones that match what you are touching before editing.
