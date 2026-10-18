# Supply chain

- pnpm only, pinned through `packageManager` with its sha512; corepack verifies
  it. Never npm or yarn.
- Every third-party npm release must be at least seven days old.
  `release-age-cutoff` holds the UTC cutoff and `scripts/pkg.sh` turns it into
  `minimumReleaseAge`. Change dependencies only through `make pkg-add`,
  `pkg-update`, `pkg-upgrade`, `pkg-remove` (which move the cutoff) or
  `pkg-lock` (which keeps it). Never hand-edit `pnpm-lock.yaml` or the
  `minimumReleaseAge` line.
- Exact versions only (`savePrefix: ""`). Installs are always
  `--frozen-lockfile --ignore-scripts`; `onlyBuiltDependencies` stays empty
  unless a reviewed package cannot work without its script.
- `rea-agents` is upgraded like any other dependency, through
  `make pkg-update PKG=rea-agents`, and only to a release that clears the age
  gate. After an upgrade, check `src/android/JadxRelease.ts` at the new tag:
  if REA pins a new JADX bridge version or digest, update `JADX_MCP_VERSION`
  and `JADX_MCP_SHA256` in the `Dockerfile` to match, then run `make test`.
- Downloaded files (the JADX bridge jar, Apktool, the test APK) are fetched over
  HTTPS and checked against a committed SHA-256 before use. Base and tool images
  are pinned by digest.
- Keep Apktool at 3.0.2 or later; earlier releases have known CVEs.
- Opt-in tools (`src/tools.ts`) follow the same rules: one pinned version per
  release, at least seven days old, an official HTTPS source and a committed
  SHA-256. Only redistributable tools go there; paid or login-gated tools are
  bring-your-own and documented, never downloaded. Ghidra's version must stay
  inside the range REA accepts (12.1.x for REA 6.4.0).
