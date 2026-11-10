# Supply chain

- pnpm is pinned through `packageManager` with its sha512; corepack verifies
  it.
- `release-age-cutoff` holds the UTC cutoff of the seven-day release-age gate
  and `scripts/pkg.sh` turns it into `minimumReleaseAge`. Change dependencies
  only through `make pkg-add`, `pkg-update`, `pkg-upgrade`, `pkg-remove` (which
  move the cutoff) or `pkg-lock` (which keeps it). Never hand-edit
  `pnpm-lock.yaml` or the `minimumReleaseAge` line.
- `savePrefix: ""` keeps versions exact, and `onlyBuiltDependencies` stays
  empty unless a reviewed package cannot work without its script.
- `rea-agents` is upgraded like any other dependency, through
  `make pkg-update PKG=rea-agents`. After an upgrade, check
  `src/android/JadxRelease.ts` at the new tag: if REA pins a new JADX bridge
  version or digest, update `JADX_MCP_VERSION` and `JADX_MCP_SHA256` in the
  `Dockerfile` to match, then run `make test`.
- Keep Apktool at 3.0.2 or later; earlier releases have known CVEs.
- Opt-in tools (`src/tools.ts`) carry one pinned version per release, an
  official HTTPS source and a committed SHA-256. Only redistributable tools go
  there; paid or login-gated tools are bring-your-own and documented, never
  downloaded. Ghidra's version must stay inside the range REA accepts (12.1.x
  for REA 6.4.0).
