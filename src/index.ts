#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("server started (stdio)");
}

main().catch((err) => {
  logger.error("fatal", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
