import { randomBytes, createHash } from "node:crypto";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface Pkce {
  verifier: string;
  challenge: string;
  method: "S256";
}

/** Generate a PKCE verifier + S256 challenge for a public-client auth-code flow. */
export function createPkce(): Pkce {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, method: "S256" };
}

/** Random `state` value for CSRF protection on the redirect. */
export function randomState(): string {
  return base64url(randomBytes(24));
}
