import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import open from "open";
import { SObject } from "./types.js";
import { ProposedUpdate } from "./extract/schema.js";
import { textResult, jsonResult, errorResult } from "./util.js";
import { logger } from "./logger.js";
import { clientId, defaultLoginHost } from "./config.js";
import { resolveLoginHost } from "./auth/hosts.js";
import { createPkce, randomState } from "./auth/pkce.js";
import { startLoopback } from "./auth/loopback.js";
import { buildAuthorizeUrl, exchangeCode, fetchIdentity } from "./auth/oauth.js";
import { saveToken, loadToken, listTokens, type StoredToken } from "./auth/token-store.js";

const NOT_IMPLEMENTED = "Not implemented yet.";

/**
 * Build the MCP server and register all tools.
 *
 * Read tools carry `readOnlyHint: true`; the single write (apply_update) carries
 * `destructiveHint: true` so the host prompts for confirmation before it runs.
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
    async ({ environment, loginHost, alias }) => {
      const loop = await startLoopback();
      try {
        const cid = clientId();
        const host = resolveLoginHost({ environment, loginHost, envDefault: defaultLoginHost() });
        const pkce = createPkce();
        const state = randomState();
        const authUrl = buildAuthorizeUrl({
          loginHost: host,
          clientId: cid,
          redirectUri: loop.redirectUri,
          challenge: pkce.challenge,
          state,
        });
        logger.info("opening browser for Salesforce authorization", { host });
        await open(authUrl);
        const code = await loop.waitForCode(state);
        const token = await exchangeCode({
          loginHost: host,
          clientId: cid,
          redirectUri: loop.redirectUri,
          code,
          verifier: pkce.verifier,
        });
        if (!token.refresh_token) {
          throw new Error(
            "No refresh_token returned. Ensure the 'refresh_token' (offline access) scope is enabled on your External Client App.",
          );
        }
        const id = await fetchIdentity(token.id, token.access_token);
        const stored: StoredToken = {
          alias: alias?.trim() || id.orgId,
          orgId: id.orgId,
          username: id.username,
          instanceUrl: token.instance_url,
          loginHost: host,
          environment,
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          scope: token.scope,
          obtainedAt: new Date().toISOString(),
        };
        saveToken(stored);
        logger.info("connected", { alias: stored.alias, org: id.orgId, env: environment });
        return jsonResult({
          connected: true,
          alias: stored.alias,
          orgId: id.orgId,
          username: id.username,
          instanceUrl: token.instance_url,
          environment,
        });
      } catch (err) {
        return errorResult(`connect_salesforce failed: ${(err as Error).message}`);
      } finally {
        loop.close();
      }
    },
  );

  server.registerTool(
    "auth_status",
    {
      title: "Auth status",
      description: "List cached Salesforce connections and whether each token is still valid.",
      inputSchema: { alias: z.string().optional() },
      annotations: { title: "Auth status", readOnlyHint: true },
    },
    async ({ alias }) => {
      try {
        const tokens = alias ? [loadToken(alias)] : listTokens();
        const connections = await Promise.all(
          tokens.map(async (t) => ({
            alias: t.alias,
            username: t.username,
            orgId: t.orgId,
            environment: t.environment,
            instanceUrl: t.instanceUrl,
            obtainedAt: t.obtainedAt,
            valid: await tokenIsValid(t),
          })),
        );
        return jsonResult({ connections });
      } catch (err) {
        return errorResult(`auth_status failed: ${(err as Error).message}`);
      }
    },
  );

  server.registerTool(
    "find_record",
    {
      title: "Find record",
      description: "Find the Salesforce record a meeting is about, by name, email, or domain.",
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

/** Best-effort token validity check via the userinfo endpoint. */
async function tokenIsValid(t: StoredToken): Promise<boolean> {
  try {
    const res = await fetch(`${t.instanceUrl}/services/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${t.accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
