import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConfigError,
  MIN_TOKEN_LENGTH,
  childEnvironment,
  loadConfig,
} from "../src/config.ts";

const TOKEN = "t".repeat(MIN_TOKEN_LENGTH);

describe("loadConfig", () => {
  it("requires a token", () => {
    assert.throws(() => loadConfig({}), ConfigError);
  });

  it("rejects a short token", () => {
    assert.throws(
      () => loadConfig({ REA_BRIDGE_TOKEN: "short" }),
      /at least 32/,
    );
  });

  it("applies safe defaults", () => {
    const config = loadConfig({ REA_BRIDGE_TOKEN: TOKEN });
    assert.equal(config.port, 8080);
    assert.equal(config.path, "/mcp");
    assert.deepEqual(config.allowedHosts, ["localhost", "127.0.0.1", "[::1]"]);
    assert.equal(config.maxSessions, 4);
    assert.equal(config.idleTimeoutMs, 1_800_000);
    assert.equal(config.reaCommand, "rea");
    assert.deepEqual(config.reaArgs, ["mcp"]);
    assert.equal(config.workdir, "/work");
  });

  it("parses overrides", () => {
    const config = loadConfig({
      REA_BRIDGE_TOKEN: TOKEN,
      REA_BRIDGE_PORT: "9000",
      REA_BRIDGE_ALLOWED_HOSTS: "Rea.Example.com, localhost",
      REA_BRIDGE_MAX_SESSIONS: "2",
      REA_BRIDGE_REA_ARGS: '["--flag"]',
    });
    assert.equal(config.port, 9000);
    assert.deepEqual(config.allowedHosts, ["rea.example.com", "localhost"]);
    assert.equal(config.maxSessions, 2);
    assert.deepEqual(config.reaArgs, ["--flag"]);
  });

  it("turns host checking off only for an explicit *", () => {
    assert.deepEqual(
      loadConfig({ REA_BRIDGE_TOKEN: TOKEN, REA_BRIDGE_ALLOWED_HOSTS: "*" })
        .allowedHosts,
      [],
    );
  });

  it("rejects malformed numbers, paths, levels and argument lists", () => {
    const base = { REA_BRIDGE_TOKEN: TOKEN };
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_PORT: "80x" }),
      ConfigError,
    );
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_PORT: "70000" }),
      ConfigError,
    );
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_MAX_SESSIONS: "0" }),
      ConfigError,
    );
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_PATH: "mcp" }),
      ConfigError,
    );
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_LOG_LEVEL: "trace" }),
      ConfigError,
    );
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_REA_ARGS: "mcp" }),
      ConfigError,
    );
    assert.throws(
      () => loadConfig({ ...base, REA_BRIDGE_REA_ARGS: "[1]" }),
      ConfigError,
    );
  });
});

describe("childEnvironment", () => {
  it("drops every bridge variable, the token included", () => {
    const env = childEnvironment({
      REA_BRIDGE_TOKEN: TOKEN,
      REA_BRIDGE_PORT: "8080",
      REA_JADX_MCP_JAR: "/opt/jadx.jar",
      PATH: "/usr/bin",
      UNSET: undefined,
    });
    assert.deepEqual(env, {
      REA_JADX_MCP_JAR: "/opt/jadx.jar",
      PATH: "/usr/bin",
    });
  });
});
