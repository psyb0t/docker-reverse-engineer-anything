import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";
import {
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
  type ProgressToken,
  type RequestId,
} from "@modelcontextprotocol/server";
import type { Logger } from "pino";

export interface SessionOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  idleTimeoutMs: number;
  logger: Logger;
  onInitialized: (session: ReaSession) => void;
  onClosed: (session: ReaSession) => void;
}

function progressTokenOf(message: JSONRPCMessage): ProgressToken | undefined {
  if (!isJSONRPCRequest(message)) return undefined;
  const meta: unknown = (message.params as { _meta?: unknown } | undefined)
    ?._meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  const token: unknown = (meta as { progressToken?: unknown }).progressToken;
  return typeof token === "string" || typeof token === "number"
    ? token
    : undefined;
}

function progressTokenOfNotification(
  message: JSONRPCMessage,
): ProgressToken | undefined {
  if (
    !isJSONRPCNotification(message) ||
    message.method !== "notifications/progress"
  )
    return undefined;
  const token: unknown = (
    message.params as { progressToken?: unknown } | undefined
  )?.progressToken;
  return typeof token === "string" || typeof token === "number"
    ? token
    : undefined;
}

// One MCP session: a Streamable HTTP transport facing the client, relayed
// message by message to its own `rea mcp` child over stdio. REA keeps analysis
// state per process, so sessions never share a child.
export class ReaSession {
  readonly transport: NodeStreamableHTTPServerTransport;
  private readonly child: StdioClientTransport;
  private readonly logger: Logger;
  private readonly options: SessionOptions;
  // Progress notifications name a token, not a request; this routes them to
  // the HTTP stream of the request that asked for progress.
  private readonly progressRoutes = new Map<ProgressToken, RequestId>();
  private idleTimer: NodeJS.Timeout | undefined;
  private closed = false;

  constructor(options: SessionOptions) {
    this.options = options;
    this.logger = options.logger;
    this.transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.logger.info({ session_id: sessionId }, "session initialized");
        options.onInitialized(this);
      },
    });
    this.child = new StdioClientTransport({
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd,
      stderr: "pipe",
    });
  }

  get sessionId(): string | undefined {
    return this.transport.sessionId;
  }

  async start(): Promise<void> {
    this.transport.onmessage = (message) => {
      this.fromClient(message);
    };
    this.transport.onclose = () => {
      void this.close("http transport closed");
    };
    this.transport.onerror = (err) => {
      this.logger.warn({ err }, "http transport error");
    };

    this.child.onmessage = (message) => {
      this.fromRea(message);
    };
    this.child.onclose = () => {
      void this.close("rea exited");
    };
    this.child.onerror = (err) => {
      this.logger.warn({ err }, "rea transport error");
    };

    // Attach before start so no early stderr output is lost. With stderr set to
    // "pipe" the SDK hands back a PassThrough, typed only as Stream.
    const stderr = this.child.stderr;
    if (stderr instanceof Readable) {
      const lines = createInterface({ input: stderr });
      lines.on("line", (line) => {
        this.logger.info({ source: "rea" }, line);
      });
    }

    await this.transport.start();
    await this.child.start();
    this.logger.info({ pid: this.child.pid }, "rea started");
    this.touch();
  }

  touch(): void {
    if (this.closed) return;
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.close("idle timeout");
    }, this.options.idleTimeoutMs);
    this.idleTimer.unref();
  }

  async close(reason: string): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.logger.info({ session_id: this.sessionId, reason }, "closing session");
    await Promise.allSettled([this.transport.close(), this.child.close()]);
    this.options.onClosed(this);
  }

  private fromClient(message: JSONRPCMessage): void {
    this.touch();
    const token = progressTokenOf(message);
    if (token !== undefined && isJSONRPCRequest(message))
      this.progressRoutes.set(token, message.id);
    this.child.send(message).catch((err: unknown) => {
      this.logger.warn({ err }, "could not forward message to rea");
    });
  }

  private fromRea(message: JSONRPCMessage): void {
    let relatedRequestId: RequestId | undefined;
    if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
      for (const [token, requestId] of this.progressRoutes) {
        if (requestId === message.id) this.progressRoutes.delete(token);
      }
    } else {
      const token = progressTokenOfNotification(message);
      if (token !== undefined)
        relatedRequestId = this.progressRoutes.get(token);
    }
    const sent =
      relatedRequestId === undefined
        ? this.transport.send(message)
        : this.transport.send(message, { relatedRequestId });
    sent.catch((err: unknown) => {
      // The client may have dropped the stream for this request; REA's reply has
      // nowhere to go, which is not a bridge failure.
      this.logger.debug({ err }, "could not deliver message from rea");
    });
  }
}
