# syntax=docker/dockerfile:1
# REA (rea-agents) with the Android toolchain it drives, plus a Streamable
# HTTP bridge in front of its stdio MCP server.
ARG NODE_IMAGE=node:24-trixie-slim@sha256:7f486cabe892bff8fef04c0f7da8dba84a560be3e4e2740b7a86afc57ebec315

FROM ${NODE_IMAGE} AS pnpm
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    COREPACK_ENABLE_AUTO_PIN=0
WORKDIR /tmp/corepack
COPY package.json ./package.json
RUN corepack install -g "$(node -p 'require("./package.json").packageManager')" \
    && corepack enable pnpm \
    && rm -rf /tmp/corepack

FROM pnpm AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

# Production dependencies only. No lifecycle script runs; node-pty comes from
# its prebuilt per-platform package, resolved for the target architecture.
FROM pnpm AS prod-deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Java tools REA drives for APKs, checked against pinned SHA-256 digests. The
# JADX bridge version is the one REA itself pins and rejects any other.
FROM ${NODE_IMAGE} AS android-tools
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG JADX_MCP_VERSION=0.7.1
ARG JADX_MCP_SHA256=6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75
ARG APKTOOL_VERSION=3.0.3
ARG APKTOOL_SHA256=dbf930b076c6b9be08d57c449cacefc3bdd6b71ebd59b3066fc0e1f5b14f9423
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /out/jadx /out/apktool \
    && curl -fsSL --proto '=https' --tlsv1.2 -o "/out/jadx/jadx-headless-mcp-${JADX_MCP_VERSION}-all.jar" \
        "https://github.com/1013503897/jadx-headless-mcp/releases/download/v${JADX_MCP_VERSION}/jadx-headless-mcp-${JADX_MCP_VERSION}-all.jar" \
    && echo "${JADX_MCP_SHA256}  /out/jadx/jadx-headless-mcp-${JADX_MCP_VERSION}-all.jar" | sha256sum -c - \
    && curl -fsSL --proto '=https' --tlsv1.2 -o /out/apktool/apktool.jar \
        "https://github.com/iBotPeaches/Apktool/releases/download/v${APKTOOL_VERSION}/apktool_${APKTOOL_VERSION}.jar" \
    && echo "${APKTOOL_SHA256}  /out/apktool/apktool.jar" | sha256sum -c -

FROM ${NODE_IMAGE} AS runtime
ARG JADX_MCP_VERSION=0.7.1
# The MCP registry verifies image ownership through this label.
LABEL io.modelcontextprotocol.server.name="io.github.psyb0t/reverse-engineer-anything" \
      org.opencontainers.image.title="reverse-engineer-anything" \
      org.opencontainers.image.description="REA (rea-agents) reverse-engineering MCP server with the Android toolchain and a Streamable HTTP bridge" \
      org.opencontainers.image.source="https://github.com/psyb0t/docker-reverse-engineer-anything" \
      org.opencontainers.image.licenses="WTFPL AND MIT AND Apache-2.0 AND GPL-2.0-only WITH Classpath-exception-2.0"
# A full JDK, not a JRE: REA compiles its JADX bridge with jdk.compiler. procps
# provides the ps REA needs for process ownership checks on Linux. unzip unpacks
# the opt-in tools REA_INSTALL asks for.
RUN mkdir -p /usr/share/man/man1 \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        adb \
        ca-certificates \
        openjdk-21-jdk-headless \
        procps \
        tini \
        unzip \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s "/usr/lib/jvm/java-21-openjdk-$(dpkg --print-architecture)" /opt/java \
    && groupadd --gid 10001 rea \
    && useradd --uid 10001 --gid rea --home-dir /home/rea --create-home --shell /usr/sbin/nologin rea \
    && mkdir -p /work /opt/rea-tools \
    && chown rea:rea /opt/rea-tools

COPY --from=android-tools /out/jadx /opt/jadx
COPY --from=android-tools /out/apktool /opt/apktool
COPY --chmod=0755 docker/apktool /usr/local/bin/apktool
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /src/dist /app/dist
COPY package.json /app/package.json
COPY --chmod=0755 docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    HOME=/home/rea \
    TMPDIR=/tmp \
    JAVA_HOME=/opt/java \
    PATH=/app/node_modules/.bin:/opt/java/bin:${PATH} \
    REA_JADX_MCP_JAR=/opt/jadx/jadx-headless-mcp-${JADX_MCP_VERSION}-all.jar \
    REA_APKTOOL_COMMAND=/usr/local/bin/apktool \
    REA_ADB_PATH=/usr/bin/adb \
    REA_TOOLS_DIR=/opt/rea-tools \
    REA_BRIDGE_WORKDIR=/work

USER rea:rea
WORKDIR /work
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["bridge"]
