---
title: "Development"
description: "Repository layout, Make targets, the age-gated pnpm dependency workflow, unit and image integration tests, the CI pipeline and how releases are cut."
nav_order: 10
---

# Development

The host needs Docker, Make, Git and a shell. Everything else runs in containers: `Dockerfile.dev` builds a `tools` image with Node and pnpm and a `dev` image with the locked dependencies.

## Layout

| Path                                                                                                    | What it holds                                                              |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`src/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/src)                      | The bridge and the opt-in tool installer (TypeScript, Node 24, ESM)        |
| [`docker/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/docker)                | The entrypoint and the Apktool launcher                                    |
| [`Dockerfile`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/Dockerfile)         | The production image                                                       |
| [`Dockerfile.dev`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/Dockerfile.dev) | The `tools` and `dev` images every Make target runs in                     |
| [`tests/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/tests)                  | Bridge unit tests, a stand-in MCP server, and the image integration test   |
| [`scripts/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/scripts)              | The dependency script, the version script and the fixture download         |
| [`.agents/`](https://github.com/psyb0t/docker-reverse-engineer-anything/tree/main/.agents)              | The skill, plugin manifests, the OpenClaw plugin and the contributor rules |
| `docs/`                                                                                                 | This site                                                                  |

## Make targets

```bash
make help                       # every target
make lint                       # tsc, eslint, prettier, shellcheck, hadolint
make format                     # apply prettier
make test                       # unit tests, then the image integration test
make test-unit                  # bridge unit tests only
make build                      # build psyb0t/reverse-engineer-anything locally
make run                        # run the bridge on 127.0.0.1:8080 (needs REA_BRIDGE_TOKEN)
make docs                       # build this site into .testing/docs-site
make version V=X.Y.Z            # set the version in VERSION and the Codex manifest
make pkg-update PKG=rea-agents  # move to the newest REA that clears the age gate
make clean                      # drop the test image, the Ghidra cache volume and fixtures
```

## Dependencies

pnpm is the only package manager, pinned with its sha512 in `packageManager` and checked by corepack. Every third-party npm release must be at least seven days old: [`release-age-cutoff`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/release-age-cutoff) holds the UTC cutoff, and [`scripts/pkg.sh`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/scripts/pkg.sh) turns it into pnpm's `minimumReleaseAge` before every resolution.

Change dependencies only through the Make targets:

| Target                          | Effect                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| `make pkg-add PKG=name[@X.Y.Z]` | Add an exact version. Moves the cutoff to seven days ago.    |
| `make pkg-update PKG=name`      | Update one package. Moves the cutoff.                        |
| `make pkg-upgrade`              | Update everything. Moves the cutoff.                         |
| `make pkg-remove PKG=name`      | Remove a package. Moves the cutoff.                          |
| `make pkg-lock`                 | Regenerate the lockfile under the existing cutoff.           |
| `make audit`                    | Check production dependencies against the advisory database. |

Installs always use `--frozen-lockfile --ignore-scripts`. After a `rea-agents` upgrade, check REA's `src/android/JadxRelease.ts` at the new tag: if REA pins a new JADX bridge version or digest, update `JADX_MCP_VERSION` and `JADX_MCP_SHA256` in the `Dockerfile` to match, then run `make test`.

## Tests

`make test-unit` runs the bridge tests in `tests/*.test.ts` with `node --test`. They start the real bridge against [`tests/fixtures/fake-mcp.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/tests/fixtures/fake-mcp.ts), a stand-in for `rea mcp`, and cover configuration, authentication, host checks, sessions, limits and the tool installer.

`make test-integration` builds the image as `reverse-engineer-anything:test`, downloads Appium's ApiDemos APK into `tests/.fixtures` (checked against a pinned SHA-256), and runs [`tests/integration/run.sh`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/tests/integration/run.sh):

1. The REA CLI answers `--help`.
2. `mcp` mode lists `inspect_android_package` over stdio.
3. The skill's `rea.sh` wrapper analyzes the APK.
4. The bridge starts hardened, refuses a missing token with `401`, and a real MCP client drives REA's Android tools through it.
5. On amd64, a container with `REA_INSTALL=ghidra` installs Ghidra and analyzes a native binary through the bridge. On arm64 it checks for the refusal instead.

The Ghidra download is cached in the `rea-integration-tools` volume. `make clean` removes it.

## CI

[`.github/workflows/pipeline.yml`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/.github/workflows/pipeline.yml) runs on every push, through the shared [reusable workflows](https://github.com/psyb0t/reusable-github-workflows):

- **Every branch**: `make lint` and `make test` on amd64, then `make test-integration` on a native arm64 runner. The arm64 job waits for the amd64 one, because both share one concurrency group and a second concurrent call would cancel the first.
- **`main`**: after both pass, builds the image for `linux/amd64` and `linux/arm64`, pushes `latest` and `sha-<commit>`, scans it with Grype (findings go to the Security tab without failing the run). The README badges refresh as soon as `code` passes.
- **`v*` tags**: no checks run again. The pipeline waits for the `main` run of the tagged commit to succeed, promotes its `sha-<commit>` image to the release tag without rebuilding, cuts the GitHub release from the annotated tag message, refreshes the badges, publishes the skill to ClawHub and publishes `server.json` to the MCP registry.

The runner needs only Docker, Make and Bash. Nothing in lint or tests needs credentials.

## Releases

`make version V=X.Y.Z` writes `VERSION` and `.agents/.codex-plugin/plugin.json`. `server.json` and the OpenClaw plugin keep their `0.0.0` placeholders, and the publish workflows stamp them from the tag. A release is an annotated `vX.Y.Z` tag on a commit whose `main` run passed. The CHANGELOG entry is written at release time.

## Documentation

This site is `docs/`, built by GitHub Pages from `main` with the Just the Docs theme. `make docs` builds it locally with the same image GitHub uses, into `.testing/docs-site`. Every page needs front matter with a unique `title` and a `description`, and one `#` heading. Links to files outside `docs/` use full GitHub URLs.
