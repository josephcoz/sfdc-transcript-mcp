// Environment-derived configuration. Kept tiny and lazy so the server can start
// (and list tools) even before the user has set everything up.

/** The External Client App's Consumer Key (Client ID). Required for any auth. */
export function clientId(): string {
  const id = process.env.SF_CLIENT_ID?.trim();
  if (!id) {
    throw new Error(
      "SF_CLIENT_ID is not set. Set it to your Salesforce External Client App's Consumer Key (Client ID).",
    );
  }
  return id;
}

/** Optional default login host (e.g. a My Domain). Overrides the environment default. */
export function defaultLoginHost(): string | undefined {
  return process.env.SF_LOGIN_HOST?.trim() || undefined;
}

/** Path to the field allow-list JSON. Required before any write can be proposed/applied. */
export function allowlistPath(): string | undefined {
  return process.env.SF_ALLOWLIST_PATH?.trim() || undefined;
}

/**
 * The OAuth redirect URI registered on the app: a static web relay page that
 * forwards the auth code to the local loopback server. Salesforce sees a real
 * HTTPS callback (no browser cert warning); the relay hands off to 127.0.0.1.
 * Must exactly match the app's registered callback URL.
 */
export function redirectUri(): string {
  return process.env.SF_REDIRECT_URI?.trim() || "https://josephcoz.com/sfdc-connect";
}
