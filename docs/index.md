---
title: "Home"
description: "reverse-engineer-anything runs REA in Docker with JDK 21, JADX, Apktool and adb for APK analysis, behind a token-guarded Streamable HTTP MCP endpoint."
nav_order: 1
permalink: /
seo:
  type: WebSite
---

# reverse-engineer-anything

[REA (Reverse Engineer Anything)](https://github.com/morluto/rea) in a Docker image, with everything it needs to take Android APKs apart already inside, and a Streamable HTTP MCP endpoint in front of it.

REA is morluto's MCP server and CLI that lets an AI agent inspect software it has no source for: decompile APKs, trace references, read resources, poke at devices over adb, dig through Electron bundles, .NET assemblies, Go and Rust binaries. Upstream ships it as the [`rea-agents`](https://www.npmjs.com/package/rea-agents) npm package, which speaks MCP over stdio and expects you to install a JDK, JADX and Apktool yourself. This image does that part for you, and adds an HTTP bridge so an agent can reach it over the network with a bearer token.

This is an unofficial packaging. REA lives at [morluto/rea](https://github.com/morluto/rea) and is MIT-licensed. Bugs in REA's tools go there. Bugs in the image or the HTTP bridge go to [this repository](https://github.com/psyb0t/docker-reverse-engineer-anything/issues).

## Quick start

Generate a token, put the APK in a directory, and start the container locked down:

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
```

Connect Claude Code to it:

```bash
claude mcp add --transport http rea http://localhost:8080/mcp \
  --header "Authorization: Bearer $REA_BRIDGE_TOKEN"
```

Then ask your agent something like "decompile the login flow in /work/app.apk and show me where the token gets stored". Paths are container paths: whatever you mount at `/work` is what REA sees.

## Find your way

| You want to                                               | Read                                        |
| --------------------------------------------------------- | ------------------------------------------- |
| Run it as an HTTP MCP server, a stdio MCP server or a CLI | [Running the image](running.md)             |
| Know what is installed and which architectures work       | [What's in the image](image.md)             |
| Decompile native code with Ghidra, or bring IDA or JEB    | [Opt-in tools](opt-in-tools.md)             |
| Look up an environment variable                           | [Configuration](configuration.md)           |
| Understand endpoints, sessions, status codes and logs     | [HTTP bridge](http-bridge.md)               |
| Expose it safely, or check what it can reach              | [Security](security.md)                     |
| Install the skill or the OpenClaw plugin                  | [Agent integrations](agent-integrations.md) |
| Fix a refusal or an error                                 | [Troubleshooting](troubleshooting.md)       |
| Build, test or change the project                         | [Development](development.md)               |

## Authorized use only

REA can run, drive and instrument the software it looks at. Only analyze software you own or are authorized to examine. REA's [disclaimer](https://github.com/morluto/rea/blob/main/DISCLAIMER.md) applies.
