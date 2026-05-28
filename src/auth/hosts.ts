import type { SfEnvironment } from "../types.js";

/**
 * Resolve the Salesforce login host.
 *
 * Precedence: an explicit `loginHost` (My Domain) wins, then a configured
 * `envDefault` (SF_LOGIN_HOST), then the environment default. Sandbox is the
 * default so production is always a deliberate choice.
 */
export function resolveLoginHost(opts: {
  environment?: SfEnvironment;
  loginHost?: string;
  envDefault?: string;
}): string {
  const explicit = opts.loginHost?.trim() || opts.envDefault?.trim();
  if (explicit) return normalizeHost(explicit);
  return opts.environment === "production"
    ? "https://login.salesforce.com"
    : "https://test.salesforce.com";
}

function normalizeHost(host: string): string {
  const withScheme = /^https?:\/\//i.test(host) ? host : `https://${host}`;
  return withScheme.replace(/\/+$/, "");
}
