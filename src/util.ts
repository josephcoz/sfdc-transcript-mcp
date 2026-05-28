import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Wrap a plain string as an MCP text tool result. */
export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Wrap a JSON-serializable value as a pretty-printed MCP text tool result. */
export function jsonResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/** Wrap an error message as an MCP tool result flagged as an error. */
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
