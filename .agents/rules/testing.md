# Testing

- Bridge changes get a case in `tests/bridge.test.ts`, `tests/config.test.ts` or `tests/auth.test.ts`. The bridge tests start the real server with `REA_BRIDGE_REA_COMMAND` and `REA_BRIDGE_REA_ARGS` pointed at `tests/fixtures/fake-mcp.ts`; extend that stand-in rather than mocking the transport.
- Installer changes get a case in `tests/tools.test.ts`, which injects `fetch`, `extract`, `arch` and a temporary directory through `InstallDeps`. Never download a real tool in a unit test.
- `make test-integration` builds the image and runs `tests/integration/run.sh`: the CLI, stdio MCP, the skill wrapper, the hardened bridge with a real MCP client on Appium's ApiDemos APK, and `REA_INSTALL=ghidra` (analysis on amd64, refusal on arm64). Run it for any change to the Dockerfile, the entrypoint, the bridge, the installer, the skill wrapper or a dependency.
- The test APK comes from `scripts/fetch-fixtures.ts`, pinned by URL and SHA-256, into the gitignored `tests/.fixtures/`. Change both values together.
- Every container the integration test starts carries the `rea-integration-<pid>` name prefix and the same hardening flags as the docs; `cleanup` removes them on exit.
