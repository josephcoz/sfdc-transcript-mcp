// Environment-derived configuration. Kept tiny and lazy so the server can start
// (and list tools) even before the user has set everything up.

/**
 * A pre-registered PUBLIC OAuth client (PKCE, no secret), so this key is not
 * confidential — same distribution model as the Salesforce CLI / gh CLI. Users
 * can override it via SF_CLIENT_ID to point at their own External Client App.
 */
const DEFAULT_CLIENT_ID =
  "3MVG9HtWXcDGV.nGfF6UdPB.DOR28uAfenwwV3pT5gOOp3INbswygeE5DzbQQILBSOyHJUPg7e0QAWRsZ..dh";

/** The OAuth client (Consumer Key). Defaults to the bundled public client. */
export function clientId(): string {
  return process.env.SF_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID;
}

/** Optional default login host (e.g. a My Domain). Overrides the environment default. */
export function defaultLoginHost(): string | undefined {
  return process.env.SF_LOGIN_HOST?.trim() || undefined;
}

/**
 * The OAuth redirect URI registered on the app: a static web relay page that
 * forwards the auth code to the local loopback server. Salesforce sees a real
 * HTTPS callback (no browser cert warning); the relay hands off to 127.0.0.1.
 * Must exactly match the app's registered callback URL.
 */
export function redirectUri(): string {
  // Trailing slash is the canonical Astro/Cloudflare URL (avoids a 307 hop).
  return process.env.SF_REDIRECT_URI?.trim() || "https://josephcoz.com/sfdc-connect/";
}
