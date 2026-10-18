import { pino, type Logger } from "pino";

// JSON lines; the container runtime owns collection and rotation. The bridge
// logs to stdout. The tool installer logs to stderr, because in `mcp` mode
// stdout is REA's protocol channel.
export function createLogger(
  level: string,
  service = "rea-bridge",
  fd: 1 | 2 = 1,
): Logger {
  return pino(
    {
      level,
      base: { service },
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          'req.headers["x-api-key"]',
          "*.authorization",
          "*.token",
          "*.secret",
          "*.password",
          "*.api_key",
          "*.apiKey",
        ],
        censor: "[REDACTED]",
      },
    },
    pino.destination({ fd, sync: true }),
  );
}
