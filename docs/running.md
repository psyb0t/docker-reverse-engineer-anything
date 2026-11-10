---
title: "Running the image"
description: "Run REA from the image as a Streamable HTTP MCP server, as a stdio MCP server for docker run -i clients, or as one-off REA CLI commands."
nav_order: 2
---

# Running the image

The image's [entrypoint](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/docker/entrypoint.sh) takes one argument that picks the mode:

| Command       | What runs                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| `bridge`      | Default. Streamable HTTP MCP on port 8080 at `/mcp`, bearer token required.   |
| `mcp`         | REA's own stdio MCP server, for `docker run -i` from a stdio-only client.     |
| anything else | The REA CLI, for example `--help` or `inspect-android-package /work/app.apk`. |

Every mode runs under `tini` as the unprivileged `rea` user, with `/work` as the working directory. When `REA_INSTALL` is set, the entrypoint installs the [opt-in tools](opt-in-tools.md) before any mode starts.

All examples below use the same hardening flags: a read-only root, tmpfs for `/tmp` and `/home/rea`, all capabilities dropped, `no-new-privileges`, and the targets mounted read-only. [Security](security.md) explains each one. Keep them when you adapt an example.

## Streamable HTTP bridge

This is the default mode and the one to use for an agent session.

```bash
export REA_BRIDGE_TOKEN="$(openssl rand -hex 32)"

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

The bridge is a small Node service in front of `rea mcp`. Each MCP session gets its own REA process, because REA keeps analysis state per process. Messages pass through untouched, progress notifications included. Sessions end on `DELETE`, after the idle timeout, or when the container stops, and their REA process goes with them. The [HTTP bridge](http-bridge.md) page covers endpoints, limits and every status code.

The bridge refuses to start without `REA_BRIDGE_TOKEN` of at least 32 characters. Check that it is up:

```bash
curl -s http://localhost:8080/healthz
```

```json
{
  "status": "ok",
  "sessions": 0
}
```

### Connect a client

Claude Code:

```bash
claude mcp add --transport http rea http://localhost:8080/mcp \
  --header "Authorization: Bearer $REA_BRIDGE_TOKEN"
```

Any client that speaks Streamable HTTP takes the same URL and header. A client that only launches local stdio commands can use the [OpenClaw plugin](agent-integrations.md#openclaw-plugin), which bridges stdio to the running container, or REA's own stdio server below.

## stdio MCP

For clients that only launch local commands, run REA's stdio server directly. There is no bridge and no token in this mode: the client owns the container's stdin and stdout.

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

Stdout is the MCP channel in this mode, so the opt-in tool installer logs to stderr only.

## CLI

Any other arguments go to the REA CLI. One command, one container, no network:

```bash
docker run --rm --network none --read-only \
  --tmpfs /tmp:rw,nosuid,size=4g \
  --tmpfs /home/rea:rw,nosuid,size=256m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$PWD/targets:/work:ro" \
  psyb0t/reverse-engineer-anything:latest \
  search-android-classes /work/app.apk MainActivity
```

Output is JSON. `--help` lists every command. The [skill's wrapper script](agent-integrations.md#cli-wrapper) runs the same thing with the flags filled in.

## Targets and paths

REA sees only what you mount. Mount the directory that holds the targets read-only at `/work` and address files by their container path, `/work/app.apk`, never the host path.

`/tmp` needs room: JADX and Apktool work on private copies of each APK there. It cannot be `noexec`, because the JVM loads native libraries from it.

## Android devices

adb runs inside the container. To reach a device over the network, run the container on a network that can see it, then connect from a tool call or with `adb connect HOST:PORT`. USB passthrough needs the device node passed with `--device`. Network adb is the simpler route.

Tools that install, start or drive apps on a device change real state on that device. Static APK analysis never runs the app.
