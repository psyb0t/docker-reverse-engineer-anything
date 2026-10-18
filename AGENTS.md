# docker-reverse-engineer-anything

Docker packaging for [REA](https://github.com/morluto/rea) (`rea-agents`), the
reverse-engineering MCP server and CLI by morluto, plus a Streamable HTTP bridge
in front of its stdio MCP server. This repository does not fork or modify REA;
it installs the published npm package.

The image ships REA with the Android toolchain it drives: a full JDK 21 (REA
compiles its JADX bridge with `jdk.compiler`), the exact JADX bridge jar REA
pins, Apktool and adb. APK analysis is the feature that must keep working.

## Layout

- `src/` is the bridge (TypeScript, Node 24, ESM). `session.ts` relays one MCP
  session between a `NodeStreamableHTTPServerTransport` and its own `rea mcp`
  child over stdio. `server.ts` owns HTTP, auth, host checks and session limits.
- `src/tools.ts` and `src/install.ts` are the opt-in installer the entrypoint
  runs when `REA_INSTALL` is set (Ghidra today).
- `docker/` holds the entrypoint (`bridge`, `mcp`, or REA CLI arguments) and the
  Apktool launcher.
- `tests/*.test.ts` test the bridge against `tests/fixtures/fake-mcp.ts`.
  `tests/integration/` tests the built image against a pinned real APK.
- `.agents/` is the agent integration surface: the skill, the Claude and Codex
  manifests, and the OpenClaw bridge plugin. `CLAUDE.md` and `.claude` are
  local, gitignored symlinks to this file and `.agents`.

## Commands

The host needs only Docker, Make, Git and a shell. Everything else runs in
containers.

- `make lint`: tsc, eslint, prettier, shellcheck and hadolint.
- `make test`: bridge unit tests, then the image integration test (CLI, stdio
  MCP, the hardened bridge and REA's Android tools on ApiDemos).
- `make build`, `make run`: build the image, run the bridge on 127.0.0.1:8080.
- `make pkg-*`: the only way to change dependencies. See the supply-chain rule.

## Rules

Read `.agents/rules/` before changing anything: `supply-chain.md` for
dependencies, downloads and images, `bridge.md` for the bridge's security
contract.
