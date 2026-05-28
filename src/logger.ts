// stderr-only logger.
//
// CRITICAL: an MCP stdio server speaks JSON-RPC over stdout. Anything written to
// stdout that isn't a protocol message corrupts the stream and breaks the host
// connection. So we NEVER use console.log here — only console.error (stderr),
// which hosts capture for diagnostics.

function safe(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function emit(level: string, msg: string, meta?: unknown): void {
  const suffix = meta === undefined ? "" : ` ${safe(meta)}`;
  console.error(`[sfdc-transcript-mcp] ${level} ${msg}${suffix}`);
}

export const logger = {
  info: (msg: string, meta?: unknown) => emit("INFO", msg, meta),
  warn: (msg: string, meta?: unknown) => emit("WARN", msg, meta),
  error: (msg: string, meta?: unknown) => emit("ERROR", msg, meta),
  debug: (msg: string, meta?: unknown) => {
    if (process.env.SFDC_MCP_DEBUG) emit("DEBUG", msg, meta);
  },
};
