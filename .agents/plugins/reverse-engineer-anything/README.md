# @psyb0t/reverse-engineer-anything

An OpenClaw/MCP plugin that connects your agent to a self-hosted
[reverse-engineer-anything](https://github.com/psyb0t/docker-reverse-engineer-anything)
container over the [Model Context Protocol](https://modelcontextprotocol.io).

The container runs [REA](https://github.com/morluto/rea) (`rea-agents`) with
JADX, Apktool and adb, behind a Streamable HTTP endpoint at `/mcp` that
requires a bearer token. This package is a thin stdio↔HTTP bridge (via
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote)) for MCP clients that
speak local stdio servers. It forwards everything to your running container and
sends your token as an `Authorization` header.

> The container is **self-hosted**. This plugin does not ship REA or the
> image. It connects to a container that **you** run.

## Start a local container

```bash
export REA_BRIDGE_TOKEN="$(openssl rand -hex 32)"
docker run -d --name rea \
  -e REA_BRIDGE_TOKEN \
  -p 127.0.0.1:8080:8080 \
  --read-only --tmpfs /tmp:rw,nosuid,size=4g --tmpfs /home/rea:rw,nosuid,size=256m \
  --cap-drop ALL --security-opt no-new-privileges \
  -v "$PWD/targets:/work:ro" \
  psyb0t/reverse-engineer-anything:latest
```

Files to analyze go in `targets/` and are addressed by their container path,
for example `/work/app.apk`.

## Configure

| Variable           | Required | Description                                              |
| ------------------ | -------- | -------------------------------------------------------- |
| `REA_URL`          | yes      | Base URL of the container, e.g. `http://localhost:8080`. |
| `REA_BRIDGE_TOKEN` | yes      | The token the container was started with.                |

## Tools

Every tool REA registers becomes available to your agent, including the
Android set: `inspect_android_package`, `search_android_classes`,
`inspect_android_class`, `inspect_android_method`, `trace_android_references`
and `decode_android_resources`, plus the adb device tools.

## Security

MCP traffic, including your tool inputs, goes to whatever `REA_URL` points at.
Use only a container you run. REA can execute and instrument targets inside the
container, so analyze only software you are authorized to examine.

## License

MIT. REA itself is MIT; see the container repository for bundled tool notices.
