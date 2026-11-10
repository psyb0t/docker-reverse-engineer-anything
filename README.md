# reverse-engineer-anything

[![CI](https://github.com/psyb0t/docker-reverse-engineer-anything/actions/workflows/pipeline.yml/badge.svg?branch=main)](https://github.com/psyb0t/docker-reverse-engineer-anything/actions/workflows/pipeline.yml)
[![version](https://raw.githubusercontent.com/psyb0t/docker-reverse-engineer-anything/badges/version.svg)](https://github.com/psyb0t/docker-reverse-engineer-anything/releases)
[![license](https://raw.githubusercontent.com/psyb0t/docker-reverse-engineer-anything/badges/license.svg)](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/LICENSE)
[![Docker Pulls](https://img.shields.io/docker/pulls/psyb0t/reverse-engineer-anything?style=flat-square)](https://hub.docker.com/r/psyb0t/reverse-engineer-anything)

[REA (Reverse Engineer Anything)](https://github.com/morluto/rea) in a Docker image, with everything it needs to tear apart Android APKs already inside, and a Streamable HTTP MCP endpoint in front of it.

REA is morluto's MCP server and CLI that lets an AI agent inspect software it has no source for: decompile APKs, trace references, read resources, poke at devices over adb, dig through Electron bundles, .NET assemblies, Go and Rust binaries. Upstream ships it as the [`rea-agents`](https://www.npmjs.com/package/rea-agents) npm package that talks MCP over stdio and expects you to install a JDK, JADX and Apktool yourself. This image does that part for you.

> This is an unofficial packaging. REA itself lives at [morluto/rea](https://github.com/morluto/rea) and is MIT-licensed. Bugs in REA's tools go there; bugs in the image or the HTTP bridge go here.

## Table of contents

- [What's in the image](#whats-in-the-image)
- [Quick start](#quick-start)
- [Ways to run it](#ways-to-run-it)
- [Documentation](#documentation)
- [Agent integrations](#agent-integrations)
- [Development](#development)
- [Sponsor](#sponsor)
- [License](#license)

## What's in the image

REA (`rea-agents`) 6.4.0 with its 170 MCP tools, a full OpenJDK 21, the exact jadx-headless-mcp jar REA pins, Apktool 3.0.3, adb and Node.js 24, for `linux/amd64` and `linux/arm64`. APK analysis works out of the box, and so do REA's static JavaScript/Electron, .NET, Go, Rust, WASM, SQLite and capture tools.

Native decompilation needs Ghidra, which adds about 900 MB, so it is not baked in: set `REA_INSTALL=ghidra` and the container fetches it on first start, checked against a pinned SHA-256 (amd64 only). The [image page](https://psyb0t.github.io/docker-reverse-engineer-anything/image/) has the versions and the update policy, and [opt-in tools](https://psyb0t.github.io/docker-reverse-engineer-anything/opt-in-tools/) covers Ghidra, IDA and JEB.

## Quick start

```bash
export REA_BRIDGE_TOKEN="$(openssl rand -hex 32)"
mkdir -p targets
cp /path/to/app.apk targets/

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

Then ask your agent something like "decompile the login flow in /work/app.apk and show me where the token gets stored". Paths are container paths: whatever you mount at `/work` is what REA sees.

REA can run, drive and instrument the software it looks at, and does no permission checks of its own. The container is the boundary, so keep every hardening flag above. Only analyze software you own or are authorized to examine. [Security](https://psyb0t.github.io/docker-reverse-engineer-anything/security/) explains each flag and what to do before exposing the bridge beyond localhost.

## Ways to run it

The entrypoint takes one argument:

| Command       | What runs                                                                   |
| ------------- | --------------------------------------------------------------------------- |
| `bridge`      | Default. Streamable HTTP MCP on port 8080 at `/mcp`, bearer token required. |
| `mcp`         | REA's own stdio MCP server, for `docker run -i` from a stdio-only client.   |
| anything else | The REA CLI, e.g. `--help` or `inspect-android-package /work/app.apk`.      |

The bridge gives each MCP session its own REA process and passes messages through untouched. [Running the image](https://psyb0t.github.io/docker-reverse-engineer-anything/running/) has a full example for each mode.

## Documentation

The full documentation lives at **[psyb0t.github.io/docker-reverse-engineer-anything](https://psyb0t.github.io/docker-reverse-engineer-anything/)**.

| Section                                                                                             | What it covers                                                    |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Running the image](https://psyb0t.github.io/docker-reverse-engineer-anything/running/)             | HTTP bridge, stdio MCP and CLI, client setup, Android devices     |
| [What's in the image](https://psyb0t.github.io/docker-reverse-engineer-anything/image/)             | Bundled versions, architectures, tags and the update policy       |
| [Opt-in tools](https://psyb0t.github.io/docker-reverse-engineer-anything/opt-in-tools/)             | Ghidra on demand, and bringing your own Ghidra, IDA or JEB        |
| [Configuration](https://psyb0t.github.io/docker-reverse-engineer-anything/configuration/)           | Every environment variable, default and valid range               |
| [HTTP bridge](https://psyb0t.github.io/docker-reverse-engineer-anything/http-bridge/)               | Endpoints, sessions, status codes, limits and logs                |
| [Security](https://psyb0t.github.io/docker-reverse-engineer-anything/security/)                     | Hardening flags, what the bridge enforces, exposing it safely     |
| [Agent integrations](https://psyb0t.github.io/docker-reverse-engineer-anything/agent-integrations/) | The skill and its CLI wrapper, the OpenClaw plugin, the MCP entry |
| [Troubleshooting](https://psyb0t.github.io/docker-reverse-engineer-anything/troubleshooting/)       | Startup refusals, installer errors and HTTP errors, with fixes    |
| [Development](https://psyb0t.github.io/docker-reverse-engineer-anything/development/)               | Layout, Make targets, dependencies, tests, CI and releases        |

## Agent integrations

- **Skill** for Claude Code, Codex and OpenClaw: `claude plugin install reverse-engineer-anything@psyb0t` (after `claude plugin marketplace add psyb0t/agents`), `codex plugin add reverse-engineer-anything@psyb0t`, or from [ClawHub](https://clawhub.ai). It teaches the agent the APK workflow and ships a locked-down CLI wrapper.
- **OpenClaw plugin** `@psyb0t/reverse-engineer-anything`: a stdio bridge to a running container. Set `REA_URL` and `REA_BRIDGE_TOKEN`.
- **MCP registry**: `io.github.psyb0t/reverse-engineer-anything`.

Details are on the [agent integrations](https://psyb0t.github.io/docker-reverse-engineer-anything/agent-integrations/) page.

## Development

The host needs Docker, Make, Git and a shell. Everything else runs in containers.

```bash
make help                       # every target
make lint                       # tsc, eslint, prettier, shellcheck, hadolint
make test                       # bridge unit tests + the image against a real APK
make build                      # build psyb0t/reverse-engineer-anything locally
make run                        # run the bridge on 127.0.0.1:8080 (needs REA_BRIDGE_TOKEN)
make docs                       # build the documentation site into .testing/docs-site
make pkg-update PKG=rea-agents  # move to the newest REA that clears the age gate
```

The [development page](https://psyb0t.github.io/docker-reverse-engineer-anything/development/) covers the dependency rules, the tests and CI. Agents working on the code start at [AGENTS.md](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/AGENTS.md).

## Sponsor

<a href="https://www.buymeacoffee.com/psyb0t"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me a Coffee" height="60" width="217"></a>

## License

WTFPL for this repository's code. REA is MIT, and the bundled tools keep their own licenses: see [THIRD_PARTY_NOTICES.md](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/THIRD_PARTY_NOTICES.md).
