// Bridge settings, read once from the environment at startup. Every invalid
// value stops the process with a ConfigError instead of falling back silently.

export const MIN_TOKEN_LENGTH = 32;

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 8080;
const DEFAULT_PATH = "/mcp";
const DEFAULT_ALLOWED_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const DEFAULT_MAX_SESSIONS = 4;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800;
const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
const DEFAULT_REA_COMMAND = "rea";
const DEFAULT_WORKDIR = "/work";
const DEFAULT_LOG_LEVEL = "info";
const LOG_LEVELS = ["debug", "info", "warn", "error"];

// Variables with this prefix configure the bridge and never reach REA.
export const BRIDGE_ENV_PREFIX = "REA_BRIDGE_";

export interface BridgeConfig {
  token: string;
  host: string;
  port: number;
  path: string;
  // Empty means any Host header is accepted (REA_BRIDGE_ALLOWED_HOSTS=*).
  allowedHosts: string[];
  maxSessions: number;
  idleTimeoutMs: number;
  maxBodyBytes: number;
  reaCommand: string;
  reaArgs: string[];
  workdir: string;
  logLevel: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

function readInteger(
  env: Env,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]+$/.test(raw))
    throw new ConfigError(`${name} must be a whole number, got "${raw}"`);
  const value = Number(raw);
  if (value < min || value > max) {
    throw new ConfigError(
      `${name} must be between ${String(min)} and ${String(max)}, got ${raw}`,
    );
  }
  return value;
}

function readList(env: Env, name: string, fallback: string[]): string[] {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (raw.trim() === "*") return [];
  const items = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item !== "");
  if (items.length === 0) throw new ConfigError(`${name} has no entries`);
  return items;
}

// Tests point the bridge at a stand-in MCP server; production uses `rea mcp`.
function readArgs(env: Env, name: string, fallback: string[]): string[] {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`${name} must be a JSON array of strings`);
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new ConfigError(`${name} must be a JSON array of strings`);
  }
  return parsed;
}

export function loadConfig(env: Env): BridgeConfig {
  const token = env.REA_BRIDGE_TOKEN ?? "";
  if (token === "") {
    throw new ConfigError(
      "REA_BRIDGE_TOKEN is required; generate one with: openssl rand -hex 32",
    );
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(
      `REA_BRIDGE_TOKEN must be at least ${String(MIN_TOKEN_LENGTH)} characters`,
    );
  }

  const path = env.REA_BRIDGE_PATH ?? DEFAULT_PATH;
  if (!path.startsWith("/"))
    throw new ConfigError(`REA_BRIDGE_PATH must start with "/", got "${path}"`);

  const logLevel = env.REA_BRIDGE_LOG_LEVEL ?? DEFAULT_LOG_LEVEL;
  if (!LOG_LEVELS.includes(logLevel)) {
    throw new ConfigError(
      `REA_BRIDGE_LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}, got "${logLevel}"`,
    );
  }

  return {
    token,
    host: env.REA_BRIDGE_HOST ?? DEFAULT_HOST,
    port: readInteger(env, "REA_BRIDGE_PORT", DEFAULT_PORT, 1, 65535),
    path,
    allowedHosts: readList(
      env,
      "REA_BRIDGE_ALLOWED_HOSTS",
      DEFAULT_ALLOWED_HOSTS,
    ),
    maxSessions: readInteger(
      env,
      "REA_BRIDGE_MAX_SESSIONS",
      DEFAULT_MAX_SESSIONS,
      1,
      64,
    ),
    idleTimeoutMs:
      readInteger(
        env,
        "REA_BRIDGE_IDLE_TIMEOUT_SECONDS",
        DEFAULT_IDLE_TIMEOUT_SECONDS,
        1,
        86400,
      ) * 1000,
    maxBodyBytes: readInteger(
      env,
      "REA_BRIDGE_MAX_BODY_BYTES",
      DEFAULT_MAX_BODY_BYTES,
      1024,
      64 * 1024 * 1024,
    ),
    reaCommand: env.REA_BRIDGE_REA_COMMAND ?? DEFAULT_REA_COMMAND,
    reaArgs: readArgs(env, "REA_BRIDGE_REA_ARGS", ["mcp"]),
    workdir: env.REA_BRIDGE_WORKDIR ?? DEFAULT_WORKDIR,
    logLevel,
  };
}

// The environment REA runs with: everything the container was given except the
// bridge's own settings, so the token never reaches the child process.
export function childEnvironment(env: Env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && !name.startsWith(BRIDGE_ENV_PREFIX))
      result[name] = value;
  }
  return result;
}
