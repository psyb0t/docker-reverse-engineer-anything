# Code style

- TypeScript, ESM, Node 24. Import local modules with their `.ts` extension (`./config.ts`); `tsc` rewrites them for `dist/`. Use only erasable syntax (no enums, no namespaces, no parameter properties), because tests and scripts run under Node's type stripping.
- `tsconfig.json` is strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, and eslint uses `typescript-eslint` `strictTypeChecked`. Fix the type, not the rule.
- Configuration is read once in `src/config.ts`. A bad value throws `ConfigError` with a message that names the variable and the bad value; never fall back silently. Name defaults and limits as constants at the top of the file.
- The installer throws `InstallError` with a message that tells the user what to do. Keep messages stable, because `docs/troubleshooting.md` quotes them.
- Logs are pino JSON lines through `createLogger` in `src/logger.ts`, with snake_case fields. The bridge logs to stdout, the installer to stderr. Never log the token or a request body, and keep the redaction list.
- Shell scripts use `set -euo pipefail` (POSIX `set -eu` for the `/bin/sh` entrypoint and launcher), tabs, and pass shellcheck. Logs from Bash scripts are JSON lines on stderr.
- Run `make format` before `make lint`. Prettier owns formatting for TypeScript, JSON, YAML and Markdown; `CHANGELOG.md` is excluded.
