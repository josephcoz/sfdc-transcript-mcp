#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { logger } from "./logger.js";

/** Default: run the MCP server over stdio (what hosts launch). */
async function runStdioServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("server started (stdio)");
}

/**
 * `connect` subcommand: run the interactive browser OAuth flow once, so the
 * token is cached before a host ever launches the server. Usage:
 *   node dist/index.js connect [--production] [--alias <name>]
 */
async function runConnectCli(): Promise<void> {
  const { connectSalesforce } = await import("./auth/connect.js");
  const args = process.argv.slice(3);
  const production = args.includes("--production");
  const aliasIdx = args.indexOf("--alias");
  const alias = aliasIdx >= 0 ? args[aliasIdx + 1] : undefined;

  const c = await connectSalesforce({
    environment: production ? "production" : "sandbox",
    alias,
  });
  // CLI mode (not the stdio server), so stdout is safe to use here.
  console.log(
    JSON.stringify(
      {
        connected: true,
        alias: c.alias,
        orgId: c.orgId,
        username: c.username,
        instanceUrl: c.instanceUrl,
        environment: c.environment,
      },
      null,
      2,
    ),
  );
}

const run = process.argv[2] === "connect" ? runConnectCli : runStdioServer;

run().catch((err) => {
  logger.error("fatal", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
