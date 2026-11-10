---
title: "Opt-in tools"
description: "Install Ghidra on first start with REA_INSTALL=ghidra into a volume, checked against a pinned SHA-256, or point REA at your own Ghidra, IDA or JEB."
nav_order: 4
---

# Opt-in tools

Some tools REA can drive are free to redistribute but too big to put in every image. Name them in `REA_INSTALL` and mount a volume at `/opt/rea-tools`:

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

| Name     | Installs      | Download / installed | Architectures | Enables                                         |
| -------- | ------------- | -------------------- | ------------- | ----------------------------------------------- |
| `ghidra` | Ghidra 12.1.4 | 570 MB / 880 MB      | amd64         | native decompilation, functions, xrefs, strings |

`REA_INSTALL` is a comma-separated list. Names are case-insensitive, and an unknown name stops the container with the list of supported ones.

## What happens on start

Before REA runs, the entrypoint runs the installer in [`src/install.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/install.ts) for each listed tool:

1. If the variable that points REA at your own copy is already set (`GHIDRA_INSTALL_DIR` for Ghidra), it skips the tool and uses yours.
2. If the volume already holds an intact copy of the pinned version, it uses that.
3. Otherwise it downloads the version pinned in [`src/tools.ts`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/src/tools.ts) over HTTPS, refuses it unless the SHA-256 matches, unpacks it into a staging directory, checks that the files REA needs are there, and moves it into place as `<name>-<version>`. Older versions of the same tool in the volume are removed.
4. It exports the variables REA needs (`GHIDRA_INSTALL_DIR`) and starts the requested mode.

Later starts find the tool in the volume and skip the download. Installing works in every mode, `mcp` and the CLI included, and logs JSON to stderr only, so stdout stays free for the stdio MCP server. Any failure stops the container with exit code 1 and the reason in the log. [Troubleshooting](troubleshooting.md#opt-in-tool-installer) lists each message.

The first start needs network access to GitHub. Downloads time out after 30 minutes and are capped at 2 GiB.

## Volumes and read-only roots

Without a volume, a `--read-only` container has nowhere to put the tool and exits with a message saying so. A writable container without a volume installs into its own layer and downloads again for every new container. `REA_TOOLS_DIR` moves the install location if `/opt/rea-tools` does not suit you.

## Ghidra on arm64

Ghidra's official release has no arm64 native decompiler, so on arm64 `REA_INSTALL=ghidra` refuses with that reason instead of half-working. Use the amd64 image, or build Ghidra for arm64 yourself and bring it as below.

## Bring your own

Paid or login-gated tools are never downloaded. Install them yourself and point REA at them:

- **Ghidra builds of your own** (an arm64 build, a newer version): mount it and set `GHIDRA_INSTALL_DIR`. A set `GHIDRA_INSTALL_DIR` wins over `REA_INSTALL=ghidra`. REA 6.4.0 accepts Ghidra 12.1.x.
- **IDA**: mount your installation and set `REA_IDA_MCP_CONFIG`, per REA's [IDA guide](https://github.com/morluto/rea/blob/main/docs/ida-provider.md).
- **JEB**: run its MCP server where REA can reach it on loopback (a sidecar sharing the container's network namespace) and set `REA_JEB_MCP_URL`.
- **Hopper** is a desktop app and is not supported here.

## Native code inside an APK

For a native library inside an APK, pull it out with REA's `extract_artifact` tool (or mount it next to the APK), then `open_binary` it and use the function tools.
