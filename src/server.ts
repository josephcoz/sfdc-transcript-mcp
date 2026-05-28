import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SObject } from "./types.js";
import { ProposedUpdate } from "./extract/schema.js";
import { textResult } from "./util.js";

const NOT_IMPLEMENTED = "Not implemented yet.";

/**
 * Build the MCP server and register all tools.
 *
 * Read tools carry `readOnlyHint: true`; the single write (apply_update) carries
 * `destructiveHint: true` so the host prompts for confirmation before it runs.
 * Handlers are stubs for now — wired up incrementally per PLAN.md.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: "sfdc-transcript-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "connect_salesforce",
    {
      title: "Connect Salesforce",
      description:
        "Authenticate to a Salesforce org via the browser (OAuth Authorization Code + PKCE) and cache the token locally on this machine. Sandbox by default; production must be requested explicitly.",
      inputSchema: {
        environment: z
          .enum(["sandbox", "production"])
          .default("sandbox")
          .describe("Which login host to use; defaults to sandbox (test.salesforce.com)"),
        loginHost: z
          .string()
          .optional()
          .describe("Custom My Domain login host, e.g. https://acme.my.salesforce.com"),
        alias: z.string().optional().describe("Label for this connection (for multiple orgs)"),
      },
      annotations: { title: "Connect Salesforce", readOnlyHint: false },
    },
    async () => textResult(NOT_IMPLEMENTED),
  );

  server.registerTool(
    "auth_status",
    {
      title: "Auth status",
      description: "List cached Salesforce connections and whether each token is still valid.",
      inputSchema: { alias: z.string().optional() },
      annotations: { title: "Auth status", readOnlyHint: true },
    },
    async () => textResult(NOT_IMPLEMENTED),
  );

  server.registerTool(
    "find_record",
    {
      title: "Find record",
      description:
        "Find the Salesforce record a meeting is about, by name, email, or domain.",
      inputSchema: {
        sobject: SObject,
        query: z.string().describe("Name, email, or domain to search for"),
        limit: z.number().int().positive().max(50).default(5),
        alias: z.string().optional(),
      },
      annotations: { title: "Find record", readOnlyHint: true },
    },
    async () => textResult(NOT_IMPLEMENTED),
  );

  server.registerTool(
    "list_writable_fields",
    {
      title: "List writable fields",
      description:
        "List the allow-listed, updateable fields for an sObject, with type and picklist metadata.",
      inputSchema: { sobject: SObject, alias: z.string().optional() },
      annotations: { title: "List writable fields", readOnlyHint: true },
    },
    async () => textResult(NOT_IMPLEMENTED),
  );

  server.registerTool(
    "suggest_updates",
    {
      title: "Suggest updates",
      description:
        "Parse a meeting transcript and return its turns plus the allow-listed candidate fields (with current values and constraints) for the model to propose updates against. Read-only: it proposes nothing on its own and writes nothing.",
      inputSchema: {
        transcript: z
          .object({
            path: z.string().optional().describe("Path to a MeetingScribe markdown transcript"),
            text: z.string().optional().describe("Raw transcript text (alternative to path)"),
          })
          .describe("Provide either a file path or raw text"),
        sobject: SObject,
        recordId: z.string().describe("The record the updates apply to"),
        alias: z.string().optional(),
      },
      annotations: { title: "Suggest updates", readOnlyHint: true },
    },
    async () => textResult(NOT_IMPLEMENTED),
  );

  server.registerTool(
    "apply_update",
    {
      title: "Apply update",
      description:
        "Validate model-proposed field updates against the allow-list and field metadata, then either dry-run (default) or write them to Salesforce after host confirmation. Always appends an audit entry.",
      inputSchema: {
        recordId: z.string(),
        sobject: SObject,
        updates: z.array(ProposedUpdate),
        dryRun: z
          .boolean()
          .default(true)
          .describe("When true (default), validate and report would-be changes without writing"),
        transcriptRef: z.object({
          title: z.string(),
          date: z.string(),
          hash: z.string().describe("Hash of the source transcript, for audit"),
        }),
        alias: z.string().optional(),
      },
      annotations: { title: "Apply update", destructiveHint: true },
    },
    async () => textResult(NOT_IMPLEMENTED),
  );

  return server;
}
