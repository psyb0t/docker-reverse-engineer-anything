# Code style

- Import local modules with their `.ts` extension (`./config.ts`); `tsc` rewrites them for `dist/`. Use only erasable syntax (no enums, no namespaces, no parameter properties), because tests and scripts run under Node's type stripping.
- Configuration is read once in `src/config.ts`. A bad value throws `ConfigError` with a message that names the variable and the bad value.
- The installer throws `InstallError` with a message that tells the user what to do. Keep messages stable, because `docs/troubleshooting.md` quotes them.
- Logs are pino JSON lines through `createLogger` in `src/logger.ts`, with snake_case fields. The bridge logs to stdout, the installer to stderr.
- The entrypoint and the `apktool` launcher run under `/bin/sh`, so they use POSIX `set -eu` instead of `set -euo pipefail`.
- Prettier (`make format`) owns formatting for TypeScript, JSON, YAML and Markdown; `CHANGELOG.md` is excluded.
