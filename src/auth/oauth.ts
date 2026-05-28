// Salesforce OAuth 2.0 Authorization Code + PKCE (public client — no secret).
// Uses the global fetch in Node 22+.

const SCOPES = ["api", "refresh_token", "offline_access"];

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  id: string;
  scope?: string;
  token_type?: string;
  issued_at?: string;
}

export interface Identity {
  orgId: string;
  userId: string;
  username: string;
}

/** Build the authorize URL the user's browser is sent to. */
export function buildAuthorizeUrl(p: {
  loginHost: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const u = new URL(`${p.loginHost}/services/oauth2/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", p.state);
  return u.toString();
}

/** Exchange an authorization code (+ PKCE verifier) for tokens. */
export function exchangeCode(p: {
  loginHost: string;
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
}): Promise<TokenResponse> {
  return postToken(p.loginHost, {
    grant_type: "authorization_code",
    code: p.code,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
  });
}

/** Exchange a refresh token for a fresh access token. */
export function refreshAccessToken(p: {
  loginHost: string;
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return postToken(p.loginHost, {
    grant_type: "refresh_token",
    client_id: p.clientId,
    refresh_token: p.refreshToken,
  });
}

async function postToken(loginHost: string, fields: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${loginHost}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(fields),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Salesforce token endpoint ${res.status}: ${text}`);
  return JSON.parse(text) as TokenResponse;
}

/** Resolve org/user identity from the `id` URL returned with the tokens. */
export async function fetchIdentity(idUrl: string, accessToken: string): Promise<Identity> {
  const res = await fetch(idUrl, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Salesforce identity endpoint ${res.status}`);
  const j = (await res.json()) as { organization_id: string; user_id: string; username: string };
  return { orgId: j.organization_id, userId: j.user_id, username: j.username };
}
