---
title: "What's in the image"
description: "The REA version, OpenJDK 21, the pinned JADX bridge, Apktool, adb and Node.js in the image, the supported architectures and how updates are gated."
nav_order: 3
---

# What's in the image

`psyb0t/reverse-engineer-anything` installs the published `rea-agents` npm package. It does not fork or modify REA. Around it sits the Android toolchain REA drives, built by the [Dockerfile](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/Dockerfile):

| Piece                 | Version   | Why                                                                 |
| --------------------- | --------- | ------------------------------------------------------------------- |
| REA (`rea-agents`)    | 6.4.0     | The analysis engine, 170 MCP tools                                  |
| OpenJDK 21 (full JDK) | Debian 13 | REA compiles its JADX bridge with `jdk.compiler`, so a JRE won't do |
| jadx-headless-mcp     | 0.7.1     | The exact JADX bridge jar REA pins, checked against REA's SHA-256   |
| Apktool               | 3.0.3     | Resource and string decoding                                        |
| adb                   | 34.0.5    | Device tools, the version REA verified                              |
| Node.js               | 24        | Runs REA and the bridge                                             |

The image also carries `procps` (REA calls `ps` for process ownership checks), `tini` as PID 1 and `unzip` for the [opt-in tools](opt-in-tools.md).

## What works out of the box

APK analysis needs no extra setup. `inspect_android_package`, `search_android_classes`, `inspect_android_class`, `inspect_android_method`, `trace_android_references` and `decode_android_resources` work as soon as the container starts, and so do REA's static JavaScript/Electron, .NET, Go, Rust, WASM, SQLite and capture tools.

Native-binary decompilation (the `.so` libraries inside an APK, or any other ELF, PE or Mach-O) needs Ghidra. It is free but adds about 900 MB, so it is not baked in. Set `REA_INSTALL=ghidra` and the container fetches it on first start. See [Opt-in tools](opt-in-tools.md).

## Preset paths

The image sets the variables REA needs to find its tools, so you do not have to:

| Variable              | Value                                       |
| --------------------- | ------------------------------------------- |
| `JAVA_HOME`           | `/opt/java`                                 |
| `REA_JADX_MCP_JAR`    | `/opt/jadx/jadx-headless-mcp-0.7.1-all.jar` |
| `REA_APKTOOL_COMMAND` | `/usr/local/bin/apktool`                    |
| `REA_ADB_PATH`        | `/usr/bin/adb`                              |
| `REA_TOOLS_DIR`       | `/opt/rea-tools`                            |
| `REA_BRIDGE_WORKDIR`  | `/work`                                     |

## Architectures

Images are built for `linux/amd64` and `linux/arm64`. CI runs the APK integration tests on both architectures, on a native arm64 runner for arm64, because REA has only verified its Android path on x86-64. Ghidra is amd64 only.

## Tags

| Tag            | Points at                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------- |
| `latest`       | The newest build of `main`                                                                |
| `vX.Y.Z`       | A release. The same image digest `main` built for that commit, promoted without a rebuild |
| `sha-<commit>` | The build of one `main` commit                                                            |

## Versions and updates

The image version is this repository's own, in [`VERSION`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/VERSION). REA's version is in the table above and in [`package.json`](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/package.json).

REA ships releases almost daily. This image only takes a REA release, or any other npm package, once it is at least seven days old. It installs from a frozen lockfile with lifecycle scripts disabled, and checks every downloaded jar against a pinned SHA-256. The opt-in tools follow the same rule: one version per image release, at least seven days old, checked against its SHA-256. Base images are pinned by digest.

## Licenses

This repository's code is WTFPL. REA is MIT, and the bundled tools keep their own licenses: see [THIRD_PARTY_NOTICES.md](https://github.com/psyb0t/docker-reverse-engineer-anything/blob/main/THIRD_PARTY_NOTICES.md).
