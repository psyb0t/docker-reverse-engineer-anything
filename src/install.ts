// Entrypoint helper: installs the tools REA_INSTALL asks for and writes the
// environment REA needs for them to the file named by the first argument.
// Logs go to stderr; stdout stays free for REA's stdio MCP server.
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createLogger } from "./logger.ts";
import {
  InstallError,
  ensureTools,
  formatEnvFile,
  parseInstallList,
} from "./tools.ts";

const DEFAULT_TOOLS_DIR = "/opt/rea-tools";

function unzip(archivePath: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-q", archivePath, "-d", destination], {
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new InstallError(`unzip exited with code ${String(code)}`));
    });
  });
}

async function main(): Promise<void> {
  const logger = createLogger(
    process.env.REA_BRIDGE_LOG_LEVEL ?? "info",
    "rea-install",
    2,
  );
  const envFile = process.argv[2];
  if (envFile === undefined) {
    logger.error("usage: install.js ENV_FILE");
    process.exit(2);
  }
  try {
    const specs = parseInstallList(process.env.REA_INSTALL);
    const env = await ensureTools(
      specs,
      process.env.REA_TOOLS_DIR ?? DEFAULT_TOOLS_DIR,
      process.env,
      {
        fetch,
        extract: unzip,
        tmpdir: tmpdir(),
        arch: process.arch,
        logger,
      },
    );
    await writeFile(envFile, formatEnvFile(env), { mode: 0o600 });
  } catch (err) {
    if (err instanceof InstallError) {
      logger.error({ err: err.message }, "tool installation failed");
      process.exit(1);
    }
    throw err;
  }
}

await main();
