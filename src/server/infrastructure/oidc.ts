import { SignJWT, jwtVerify } from "jose";
import * as client from "openid-client";
import { DomainError } from "../domain/rules";
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET);
export async function oidcConfig() {
  if (
    !process.env.OIDC_ISSUER ||
    !process.env.OIDC_CLIENT_ID ||
    !process.env.OIDC_CLIENT_SECRET ||
    process.env.AUTH_MODE !== "oidc"
  )
    throw new DomainError(
      503,
      "Identidade corporativa não configurada. Configure OIDC_ISSUER, OIDC_CLIENT_ID e OIDC_CLIENT_SECRET.",
    );
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    throw new Error("AUTH_SECRET inválido");
  return client.discovery(
    new URL(process.env.OIDC_ISSUER),
    process.env.OIDC_CLIENT_ID,
    process.env.OIDC_CLIENT_SECRET,
  );
}
export async function startOidc() {
  const config = await oidcConfig();
  const verifier = client.randomPKCECodeVerifier(),
    state = client.randomState(),
    nonce = client.randomNonce();
  const challenge = await client.calculatePKCECodeChallenge(verifier);
  const redirectUri = `${process.env.APP_ORIGIN}/api/auth/oidc/callback`;
  const token = await new SignJWT({ verifier, state, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key());
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    nonce,
  });
  return { url, token };
}
export async function finishOidc(url: URL, token: string) {
  const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
  const config = await oidcConfig();
  const tokens = await client.authorizationCodeGrant(config, url, {
    pkceCodeVerifier: String(payload.verifier),
    expectedState: String(payload.state),
    expectedNonce: String(payload.nonce),
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new DomainError(401, "Identidade inválida.");
  return {
    subject: `${process.env.OIDC_ISSUER}|${claims.sub}`,
    name: String(claims.name || claims.sub),
    email: String(claims.email || ""),
  };
}
