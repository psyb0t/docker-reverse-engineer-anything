# Changelog

All notable changes to this project are documented here. The project follows
[Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-18

### Fixed

- The pipeline started the amd64 and arm64 checks at the same time, and their shared concurrency group cancelled the amd64 run, so v0.1.0 was never built or published. The arm64 checks now run after the amd64 checks. v0.1.1 is the first published release and contains everything listed under 0.1.0.

## [0.1.0] - 2026-10-18

### Added

- Docker image `psyb0t/reverse-engineer-anything` with REA (`rea-agents`) 6.4.0 and the Android toolchain it drives: OpenJDK 21, the jadx-headless-mcp 0.7.1 jar REA pins, Apktool 3.0.3 and adb, for `linux/amd64` and `linux/arm64`.
- Streamable HTTP MCP bridge on port 8080 at `/mcp`. It requires a bearer token of at least 32 characters, checks the `Host` header, runs one REA process per MCP session, caps concurrent sessions, closes idle ones and keeps its own settings, the token included, out of REA's environment.
- `mcp` mode for REA's stdio MCP server and pass-through to the REA CLI.
- `REA_INSTALL=ghidra` installs Ghidra 12.1.4 on first start into a volume at `REA_TOOLS_DIR` (`/opt/rea-tools`), verified against a pinned SHA-256, and points REA at it for native decompilation. amd64 only; on arm64 it refuses with the reason. A user-set `GHIDRA_INSTALL_DIR` takes precedence.
- Agent skill with a locked-down CLI wrapper, Claude Code and Codex plugin manifests, and an OpenClaw bridge plugin.
- Dependency lifecycle through `make pkg-*`: pnpm with a seven-day release-age gate, exact versions, a frozen lockfile and lifecycle scripts disabled.
- Integration tests that run the hardened image against Appium's ApiDemos APK on amd64 and arm64, and Ghidra native analysis on amd64.
