import { ConfigError, loadConfig } from "./config.ts";
import { createLogger } from "./logger.ts";
import { createBridge } from "./server.ts";

function main(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      createLogger("error").error(
        { err: err.message },
        "invalid configuration",
      );
      process.exit(2);
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);
  const bridge = createBridge(config, logger);

  bridge.server.listen(config.port, config.host, () => {
    logger.info(
      {
        host: config.host,
        port: config.port,
        path: config.path,
        max_sessions: config.maxSessions,
        allowed_hosts:
          config.allowedHosts.length === 0 ? "*" : config.allowedHosts,
      },
      "rea bridge listening",
    );
  });

  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    bridge
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, "shutdown failed");
        process.exit(1);
      });
  };
  process.on("SIGTERM", () => {
    stop("SIGTERM");
  });
  process.on("SIGINT", () => {
    stop("SIGINT");
  });
}

main();
