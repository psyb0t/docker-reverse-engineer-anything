# Agent surface

Applies to `.agents/skills/`, `.agents/plugins/`, `.agents/.claude-plugin/`, `.agents/.codex-plugin/`, `server.json` and `glama.json`.

- The skill (`.agents/skills/reverse-engineer-anything/SKILL.md` and `references/setup.md`) must name only tools, variables, defaults and flags that exist in the code, the image and the docs site. Change all of them together.
- `scripts/rea.sh` in the skill always runs the image with `--network=none` (unless `--network` is passed), `--read-only`, `--cap-drop=ALL`, `no-new-privileges`, tmpfs for `/tmp` and `/home/rea`, and the target directory mounted read-only at `/work`. `tests/integration/run.sh` runs it against the pinned APK; keep it working there. `-h` and `--usage` print the wrapper's help, and `--help` passes through to REA.
- The OpenClaw plugin (`.agents/plugins/reverse-engineer-anything/`) is MIT, unlike the WTFPL repository. `bin/cli.js` only proxies stdio through `mcp-remote` to `$REA_URL/mcp` with `Authorization: Bearer $REA_BRIDGE_TOKEN`. Stdout is the MCP channel, so diagnostics go to stderr and the token is never logged.
- `server.json` and the OpenClaw plugin's `package.json` and `openclaw.plugin.json` keep version `0.0.0`; the publish workflows stamp the release version. `.agents/.codex-plugin/plugin.json` carries the release version, written by `make version`.
- `server.json` and the `io.modelcontextprotocol.server.name` label in the `Dockerfile` share the name `io.github.psyb0t/reverse-engineer-anything`. Keep them equal, or the MCP registry refuses the image.
- `pipeline.yml` publishes exactly the directories listed in `skill_names` and `plugin_names` of the `publish-to-clawhub` job. Add a new skill or plugin directory there when it should be published.
- Every documented `docker run` in the skill keeps the hardening flags from `bridge.md`.
