# docker-reverse-engineer-anything

[![CI](https://github.com/psyb0t/docker-reverse-engineer-anything/actions/workflows/pipeline.yml/badge.svg?branch=main)](https://github.com/psyb0t/docker-reverse-engineer-anything/actions/workflows/pipeline.yml)
[![version](https://raw.githubusercontent.com/psyb0t/docker-reverse-engineer-anything/badges/version.svg)](https://github.com/psyb0t/docker-reverse-engineer-anything/releases)
[![license](https://raw.githubusercontent.com/psyb0t/docker-reverse-engineer-anything/badges/license.svg)](LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/psyb0t/reverse-engineer-anything?style=flat-square)](https://hub.docker.com/r/psyb0t/reverse-engineer-anything)

[REA (Reverse Engineer Anything)](https://github.com/morluto/rea) in a Docker
image, with everything it needs to tear apart Android APKs already inside, and
a Streamable HTTP MCP endpoint in front of it.

REA is morluto's MCP server and CLI that lets an AI agent inspect software it
has no source for: decompile APKs, trace references, read resources, poke at
devices over adb, dig through Electron bundles, .NET assemblies, Go and Rust
binaries. Upstream ships it as the [`rea-agents`](https://www.npmjs.com/package/rea-agents)
npm package that talks MCP over stdio and expects you to install a JDK, JADX
and Apktool yourself. This image does that part for you.

> This is an unofficial packaging. REA itself lives at
> [morluto/rea](https://github.com/morluto/rea) and is MIT-licensed. Bugs in
> REA's tools go there; bugs in the image or the HTTP bridge go here.

## Table of Contents

- [What's in the image](#whats-in-the-image)
- [Quick start](#quick-start)
- [Ways to run it](#ways-to-run-it)
- [Opt-in tools](#opt-in-tools)
- [Configuration](#configuration)
- [Security](#security)
- [Agent integrations](#agent-integrations)
- [Versions and updates](#versions-and-updates)
- [Development](#development)
- [License](#license)

## What's in the image

| Piece              | Version   | Why                                                               |
| ------------------ | --------- | ----------------------------------------------------------------- |
| REA (`rea-agents`) | 6.4.0     | The analysis engine, 170 MCP tools                                |
| OpenJDK 21 (full)  | Debian 13 | REA compiles its JADX bridge with `jdk.compiler`; a JRE won't do  |
| jadx-headless-mcp  | 0.7.1     | The exact JADX bridge jar REA pins, checked against REA's SHA-256 |
| Apktool            | 3.0.3     | Resource and string decoding                                      |
| adb                | 34.0.5    | Device tools; the version REA verified                            |
| Node.js            | 24        | Runs REA and the bridge                                           |

APK analysis needs no extra setup: `inspect_android_package`,
`search_android_classes`, `inspect_android_class`, `inspect_android_method`,
`trace_android_references` and `decode_android_resources` work out of the box,
and so do REA's static JavaScript/Electron, .NET, Go, Rust, WASM, SQLite and
capture tools.

Native-binary decompilation (the `.so` libraries inside an APK, or any other
ELF, PE or Mach-O) needs Ghidra. It is free but adds about 900 MB, so it is not
baked in: set `REA_INSTALL=ghidra` and the container fetches it on first start.
See [Opt-in tools](#opt-in-tools).

Images are built for `linux/amd64` and `linux/arm64`. CI runs the APK tests on
both architectures. Ghidra is amd64 only.

## Quick start

```bash
export REA_BRIDGE_TOKEN="$(openssl rand -hex 32)"
mkdir -p targets && cp /path/to/app.apk targets/

docker run -d --name rea \
  -e REA_BRIDGE_TOKEN \
  -p 127.0.0.1:8080:8080 \
  --read-only \
  --tmpfs /tmp:rw,nosuid,size=4g \
  --tmpfs /home/rea:rw,nosuid,size=256m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$PWD/targets:/work:ro" \
  psyb0t/reverse-engineer-anything:latest

claude mcp add --transport http rea http://localhost:8080/mcp \
  --header "Authorization: Bearer $REA_BRIDGE_TOKEN"
```

Then ask your agent something like "decompile the login flow in
/work/app.apk and show me where the token gets stored". Paths are container
paths: whatever you mount at `/work` is what REA sees.

## Ways to run it

The entrypoint takes one argument:

| Command       | What runs                                                                   |
| ------------- | --------------------------------------------------------------------------- |
| `bridge`      | Default. Streamable HTTP MCP on port 8080 at `/mcp`, bearer token required. |
| `mcp`         | REA's own stdio MCP server, for `docker run -i` from a stdio-only client.   |
| anything else | The REA CLI, e.g. `--help` or `inspect-android-package /work/app.apk`.      |

### Streamable HTTP bridge

The bridge is a small Node service in front of `rea mcp`. Each MCP session gets
its own REA process, because REA keeps analysis state per process. Messages
pass through untouched, progress notifications included. Sessions end on
`DELETE`, after the idle timeout, or when the container stops, and their REA
process goes with them.

### stdio MCP

For clients that only launch local commands:

```json
{
  "mcpServers": {
    "rea": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,nosuid,size=4g",
        "--tmpfs",
        "/home/rea:rw,nosuid,size=256m",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "-v",
        "/absolute/path/to/targets:/work:ro",
        "psyb0t/reverse-engineer-anything:latest",
        "mcp"
      ]
    }
  }
}
```

### CLI

```bash
docker run --rm --network none --read-only \
  --tmpfs /tmp:rw,nosuid,size=4g --tmpfs /home/rea:rw,nosuid,size=256m \
  --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/targets:/work:ro" \
  psyb0t/reverse-engineer-anything:latest \
  search-android-classes /work/app.apk MainActivity
```

Output is JSON. `--help` lists every command.

## Opt-in tools

Some tools REA can drive are free to redistribute but too big to put in every
image. Name them in `REA_INSTALL` and mount a volume at `/opt/rea-tools`:

```bash
docker run -d --name rea \
  -e REA_BRIDGE_TOKEN \
  -e REA_INSTALL=ghidra \
  -v rea-tools:/opt/rea-tools \
  -p 127.0.0.1:8080:8080 \
  --read-only \
  --tmpfs /tmp:rw,nosuid,size=4g \
  --tmpfs /home/rea:rw,nosuid,size=256m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$PWD/targets:/work:ro" \
  psyb0t/reverse-engineer-anything:latest
```

On start, before REA runs, the entrypoint installs each listed tool that is not
already in the volume. It downloads the version pinned in the image, refuses
it unless the SHA-256 matches, unpacks it, and points REA at it. Later starts
find it in the volume and skip the download. It works in every mode, `mcp` and
the CLI included, and logs to stderr only.

| Name     | Installs      | Download / installed | Architectures | Enables                                         |
| -------- | ------------- | -------------------- | ------------- | ----------------------------------------------- |
| `ghidra` | Ghidra 12.1.4 | 570 MB / 880 MB      | amd64         | native decompilation, functions, xrefs, strings |

The first start needs network access to GitHub. Without a volume, a
`--read-only` container has nowhere to put the tool and exits with a message
saying so; a writable one installs into its own layer and downloads again for
every new container. Ghidra's
official release has no arm64 decompiler, so on arm64 `REA_INSTALL=ghidra`
refuses with that reason instead of half-working.

### Bring your own

Paid or login-gated tools are never downloaded. Install them yourself and
point REA at them:

- **Ghidra builds of your own** (an arm64 build, a newer version): mount it and
  set `GHIDRA_INSTALL_DIR`. A set `GHIDRA_INSTALL_DIR` wins over
  `REA_INSTALL=ghidra`.
- **IDA**: mount your installation and set `REA_IDA_MCP_CONFIG`, per REA's
  [IDA guide](https://github.com/morluto/rea/blob/main/docs/ida-provider.md).
- **JEB**: run its MCP server where REA can reach it on loopback (a sidecar
  sharing the container's network namespace) and set `REA_JEB_MCP_URL`.
- **Hopper** is a desktop app and is not supported here.

## Configuration

| Variable                          | Default                     | Description                                                          |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `REA_BRIDGE_TOKEN`                | required                    | Bearer token, at least 32 characters. Never passed to REA.           |
| `REA_BRIDGE_PORT`                 | `8080`                      | Listen port inside the container.                                    |
| `REA_BRIDGE_HOST`                 | `0.0.0.0`                   | Listen address inside the container.                                 |
| `REA_BRIDGE_PATH`                 | `/mcp`                      | MCP endpoint path.                                                   |
| `REA_BRIDGE_ALLOWED_HOSTS`        | `localhost,127.0.0.1,[::1]` | Accepted `Host` header names (DNS rebinding guard). `*` disables it. |
| `REA_BRIDGE_MAX_SESSIONS`         | `4`                         | Concurrent MCP sessions, each with its own REA process.              |
| `REA_BRIDGE_IDLE_TIMEOUT_SECONDS` | `1800`                      | Idle sessions get closed and their REA process stopped.              |
| `REA_BRIDGE_MAX_BODY_BYTES`       | `4194304`                   | Largest accepted request body.                                       |
| `REA_BRIDGE_LOG_LEVEL`            | `info`                      | `debug`, `info`, `warn` or `error`. Logs are JSON on stdout.         |
| `REA_INSTALL`                     | unset                       | Comma-separated [opt-in tools](#opt-in-tools) to install on start.   |
| `REA_TOOLS_DIR`                   | `/opt/rea-tools`            | Where opt-in tools are installed. Mount a volume here.               |

REA's own variables pass straight through, for example `REA_JADX_HEAP_MIB` and
`REA_JADX_OPERATION_TIMEOUT_MS` for big APKs, `REA_LOG_LEVEL`, or
`REA_MCP_MAX_RESPONSE_BYTES`. See REA's
[documentation](https://github.com/morluto/rea/tree/main/docs). The image
presets `JAVA_HOME`, `REA_JADX_MCP_JAR`, `REA_APKTOOL_COMMAND` and
`REA_ADB_PATH`.

`GET /healthz` answers without a token: `{"status":"ok","sessions":N}`.

## Security

REA can run, drive and instrument the software it looks at, and it does no
permission checks of its own. The container is the boundary, so keep it tight:

- The bridge won't start without a token, compares it in constant time, checks
  the `Host` header, and never hands the token to REA.
- The image runs as an unprivileged `rea` user. Run it the way the examples do:
  read-only root, tmpfs for `/tmp` and `/home/rea`, all capabilities dropped,
  `no-new-privileges`, targets mounted read-only, port bound to 127.0.0.1.
- `/tmp` can't be `noexec`: the JVM loads native libraries from it.
- Exposing it beyond localhost? Put TLS in front and add the hostname to
  `REA_BRIDGE_ALLOWED_HOSTS`.
- Only analyze software you own or are authorized to examine. REA's
  [disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) applies.

## Agent integrations

- **Skill** for Claude Code, Codex and OpenClaw:
  `claude plugin install reverse-engineer-anything@psyb0t`,
  `codex plugin add reverse-engineer-anything@psyb0t`, or from
  [ClawHub](https://clawhub.ai). It teaches the agent the APK workflow and ships
  a locked-down CLI wrapper. Add the marketplace first with
  `claude plugin marketplace add psyb0t/agents`.
- **OpenClaw plugin** `@psyb0t/reverse-engineer-anything`: a stdio bridge to a
  running container. Set `REA_URL` and `REA_BRIDGE_TOKEN`.
- **MCP registry**: `io.github.psyb0t/reverse-engineer-anything`.

## Versions and updates

The image version is this repository's own (`VERSION`); REA's version is in the
table above and in `package.json`. REA ships releases almost daily. This image
only takes a REA release, or any other npm package, once it is at least seven
days old, installs with lifecycle scripts disabled from a frozen lockfile, and
checks every downloaded jar against a pinned SHA-256. The opt-in tools follow
the same rule: one version per image release, at least seven days old, checked
against its SHA-256. Base images are pinned by digest.

## Development

The host needs Docker, Make, Git and a shell. Everything else runs in
containers.

```bash
make help        # every target
make lint        # tsc, eslint, prettier, shellcheck, hadolint
make test        # bridge unit tests + the image against a real APK
make build       # build psyb0t/reverse-engineer-anything locally
make run         # run the bridge on 127.0.0.1:8080 (needs REA_BRIDGE_TOKEN)
make pkg-update PKG=rea-agents   # move to the newest REA that clears the age gate
```

The integration test starts the hardened container, checks that a missing
token gets a 401, then drives REA's Android tools through the bridge against
Appium's ApiDemos APK. It also starts a container with `REA_INSTALL=ghidra`
and has Ghidra analyze a binary through the bridge (on arm64 it checks for the
refusal instead). The Ghidra download is cached in the `rea-integration-tools`
volume; `make clean` removes it.

## License

WTFPL for this repository's code. REA is MIT, and the bundled tools keep their
own licenses: see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
