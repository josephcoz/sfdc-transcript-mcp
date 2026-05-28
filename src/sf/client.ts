import { Connection } from "jsforce";
import { loadToken, saveToken, type StoredToken } from "../auth/token-store.js";
import { clientId } from "../config.js";
import { refreshAccessToken } from "../auth/oauth.js";
import { logger } from "../logger.js";

/** Build a jsforce Connection from a stored token. */
export function connFor(token: StoredToken): Connection {
  return new Connection({ instanceUrl: token.instanceUrl, accessToken: token.accessToken });
}

/**
 * Run an operation against a connection, transparently refreshing the access
 * token once if the session has expired, then retrying.
 */
export async function withConnection<T>(
  alias: string | undefined,
  fn: (conn: Connection, token: StoredToken) => Promise<T>,
): Promise<T> {
  let token = loadToken(alias);
  try {
    return await fn(connFor(token), token);
  } catch (err) {
    if (!isSessionExpired(err)) throw err;
    logger.info("access token expired; refreshing", { alias: token.alias });
    const refreshed = await refreshAccessToken({
      loginHost: token.loginHost,
      clientId: clientId(),
      refreshToken: token.refreshToken,
    });
    token = {
      ...token,
      accessToken: refreshed.access_token,
      instanceUrl: refreshed.instance_url ?? token.instanceUrl,
      obtainedAt: new Date().toISOString(),
    };
    saveToken(token);
    return await fn(connFor(token), token);
  }
}

function isSessionExpired(err: unknown): boolean {
  const e = err as { errorCode?: string; message?: string };
  return (
    e?.errorCode === "INVALID_SESSION_ID" ||
    /INVALID_SESSION_ID|expired access\/refresh token|Session expired or invalid/i.test(e?.message ?? "")
  );
}
