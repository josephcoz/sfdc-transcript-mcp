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
 * Host used in the OAuth redirect URI. Salesforce rejects http and bare-localhost
 * callbacks, so we default to a loopback-resolving domain (localtest.me -> 127.0.0.1).
 * Must match a callback URL registered on the External Client App.
 */
export function callbackHost(): string {
  return process.env.SF_CALLBACK_HOST?.trim() || "localtest.me";
}
