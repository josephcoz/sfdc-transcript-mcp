import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import type { SfEnvironment } from "../types.js";

export interface StoredToken {
  alias: string;
  orgId: string;
  username: string;
  instanceUrl: string;
  loginHost: string;
  environment: SfEnvironment;
  accessToken: string;
  refreshToken: string;
  scope?: string;
  obtainedAt: string;
}

const paths = envPaths("sfdc-transcript-mcp", { suffix: "" });

function tokenDir(): string {
  const dir = join(paths.data, "tokens");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function fileFor(key: string): string {
  return join(tokenDir(), `${sanitize(key)}.json`);
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Persist a connection's tokens with 0600 perms. Never logged. */
export function saveToken(t: StoredToken): void {
  const f = fileFor(t.alias);
  writeFileSync(f, JSON.stringify(t, null, 2), { mode: 0o600 });
  chmodSync(f, 0o600);
}

export function listTokens(): StoredToken[] {
  const dir = tokenDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as StoredToken);
}

/** Load one connection. With no alias: the sole connection, else an error. */
export function loadToken(alias?: string): StoredToken {
  if (alias) {
    const f = fileFor(alias);
    if (!existsSync(f)) {
      throw new Error(`No saved connection for alias "${alias}". Run connect_salesforce first.`);
    }
    return JSON.parse(readFileSync(f, "utf8")) as StoredToken;
  }
  const all = listTokens();
  if (all.length === 0) throw new Error("No Salesforce connection. Run connect_salesforce first.");
  if (all.length > 1) {
    throw new Error(`Multiple connections (${all.map((t) => t.alias).join(", ")}); pass an alias.`);
  }
  return all[0];
}

/** Update only the access token for a connection (after a refresh). */
export function updateAccessToken(alias: string, accessToken: string): void {
  const t = loadToken(alias);
  t.accessToken = accessToken;
  saveToken(t);
}
