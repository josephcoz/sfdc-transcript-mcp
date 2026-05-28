import open from "open";
import type { SfEnvironment } from "../types.js";
import { logger } from "../logger.js";
import { clientId, defaultLoginHost, callbackHost } from "../config.js";
import { resolveLoginHost } from "./hosts.js";
import { createPkce, randomState } from "./pkce.js";
import { startLoopback } from "./loopback.js";
import { buildAuthorizeUrl, exchangeCode, fetchIdentity } from "./oauth.js";
import { saveToken, type StoredToken } from "./token-store.js";

export interface ConnectOptions {
  environment: SfEnvironment;
  loginHost?: string;
  alias?: string;
}

/**
 * Run the full browser OAuth (Authorization Code + PKCE) flow and persist the
 * resulting tokens locally. Shared by the connect_salesforce MCP tool and the
 * `connect` CLI subcommand.
 */
export async function connectSalesforce(opts: ConnectOptions): Promise<StoredToken> {
  const loop = await startLoopback(callbackHost());
  try {
    const cid = clientId();
    const host = resolveLoginHost({
      environment: opts.environment,
      loginHost: opts.loginHost,
      envDefault: defaultLoginHost(),
    });
    const pkce = createPkce();
    const state = randomState();
    const authUrl = buildAuthorizeUrl({
      loginHost: host,
      clientId: cid,
      redirectUri: loop.redirectUri,
      challenge: pkce.challenge,
      state,
    });
    logger.info("opening browser for Salesforce authorization", {
      host,
      redirectUri: loop.redirectUri,
    });
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
        "No refresh_token returned. Ensure the 'refresh_token' (offline access) scope is enabled on your app.",
      );
    }
    const id = await fetchIdentity(token.id, token.access_token);
    const stored: StoredToken = {
      alias: opts.alias?.trim() || id.orgId,
      orgId: id.orgId,
      username: id.username,
      instanceUrl: token.instance_url,
      loginHost: host,
      environment: opts.environment,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      scope: token.scope,
      obtainedAt: new Date().toISOString(),
    };
    saveToken(stored);
    logger.info("connected", { alias: stored.alias, org: id.orgId, env: opts.environment });
    return stored;
  } finally {
    loop.close();
  }
}
