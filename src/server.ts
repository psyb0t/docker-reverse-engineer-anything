import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { hostHeaderValidation } from "@modelcontextprotocol/node";
import { isInitializeRequest } from "@modelcontextprotocol/server";
import type { Logger } from "pino";
import { createTokenCheck } from "./auth.ts";
import { childEnvironment, type BridgeConfig } from "./config.ts";
import { ReaSession } from "./session.ts";

const HEALTH_PATH = "/healthz";
const SESSION_HEADER = "mcp-session-id";
const HEADERS_TIMEOUT_MS = 30_000;
const MAX_CONNECTIONS = 128;

// JSON-RPC error codes used for transport-level refusals.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const SERVER_BUSY = -32000;
const SESSION_NOT_FOUND = -32001;

class BodyError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(status: number, code: number, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function sendRpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes)
      throw new BodyError(413, INVALID_REQUEST, "Request body too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError(
      400,
      PARSE_ERROR,
      "Parse error: body is not valid JSON",
    );
  }
}

function containsInitialize(body: unknown): boolean {
  const messages = Array.isArray(body) ? (body as unknown[]) : [body];
  return messages.some((message) => isInitializeRequest(message));
}

export interface Bridge {
  server: Server;
  sessionCount: () => number;
  close: () => Promise<void>;
}

export function createBridge(config: BridgeConfig, logger: Logger): Bridge {
  const isAuthorized = createTokenCheck(config.token);
  const hostAllowed =
    config.allowedHosts.length === 0
      ? undefined
      : hostHeaderValidation(config.allowedHosts);
  const childEnv = childEnvironment(process.env);
  // Every live child, initialized or not, counts against maxSessions.
  const live = new Set<ReaSession>();
  const byId = new Map<string, ReaSession>();

  async function openSession(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    log: Logger,
  ): Promise<void> {
    if (live.size >= config.maxSessions) {
      log.warn({ max_sessions: config.maxSessions }, "session limit reached");
      sendRpcError(
        res,
        503,
        SERVER_BUSY,
        "Too many active sessions; close one or retry later",
      );
      return;
    }
    const session = new ReaSession({
      command: config.reaCommand,
      args: config.reaArgs,
      env: childEnv,
      cwd: config.workdir,
      idleTimeoutMs: config.idleTimeoutMs,
      logger: log,
      onInitialized: (s) => {
        if (s.sessionId !== undefined) byId.set(s.sessionId, s);
      },
      onClosed: (s) => {
        live.delete(s);
        if (s.sessionId !== undefined) byId.delete(s.sessionId);
      },
    });
    live.add(session);
    try {
      await session.start();
      await session.transport.handleRequest(req, res, body);
    } catch (err) {
      log.error({ err }, "could not start session");
      if (!res.headersSent)
        sendRpcError(res, 500, SERVER_BUSY, "Could not start REA");
      await session.close("start failed");
      return;
    }
    if (session.sessionId === undefined)
      await session.close("initialize did not complete");
  }

  async function handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
    log: Logger,
  ): Promise<void> {
    if (hostAllowed !== undefined && !hostAllowed(req, res)) {
      log.warn({ host: req.headers.host }, "rejected host header");
      return;
    }
    if (!isAuthorized(req.headers.authorization)) {
      log.warn("rejected unauthenticated request");
      sendJson(
        res,
        401,
        { error: "unauthorized" },
        { "www-authenticate": 'Bearer realm="rea"' },
      );
      return;
    }

    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await readJsonBody(req, config.maxBodyBytes);
      } catch (err) {
        if (err instanceof BodyError) {
          sendRpcError(res, err.status, err.code, err.message);
          return;
        }
        throw err;
      }
    }

    const header = req.headers[SESSION_HEADER];
    const sessionId = Array.isArray(header) ? header[0] : header;
    if (sessionId !== undefined) {
      const session = byId.get(sessionId);
      if (session === undefined) {
        sendRpcError(res, 404, SESSION_NOT_FOUND, "Session not found");
        return;
      }
      session.touch();
      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (req.method !== "POST" || !containsInitialize(body)) {
      sendRpcError(
        res,
        400,
        INVALID_REQUEST,
        "Bad Request: no session ID; send initialize first",
      );
      return;
    }
    await openSession(
      req,
      res,
      body,
      log.child({ connection_id: randomUUID() }),
    );
  }

  const server = createServer((req, res) => {
    const log = logger.child({ request_id: randomUUID() });
    const path = new URL(req.url ?? "/", "http://bridge").pathname;

    if (path === HEALTH_PATH && req.method === "GET") {
      sendJson(res, 200, { status: "ok", sessions: live.size });
      return;
    }
    if (path !== config.path) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    handleMcp(req, res, log).catch((err: unknown) => {
      log.error({ err }, "request failed");
      if (!res.headersSent)
        sendRpcError(res, 500, SERVER_BUSY, "Internal error");
      else res.end();
    });
  });
  // Tool calls stream their results over SSE for as long as REA works on them
  // (native analysis can take minutes), so only the header phase is timed.
  server.requestTimeout = 0;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.maxConnections = MAX_CONNECTIONS;

  return {
    server,
    sessionCount: () => live.size,
    close: async () => {
      await Promise.allSettled(
        [...live].map((session) => session.close("bridge shutting down")),
      );
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      });
    },
  };
}
