import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { getDb } from "@/db";
import { mcpConnections, users, type SafeUser } from "@/db/schema";

/*
 * Sign-in for Claude and other MCP clients (OAuth 2.1).
 *
 * Claude registers itself (Dynamic Client Registration), sends the person to
 * /oauth/authorize where they approve it while signed in to Injaz, then trades
 * the one-time code (protected with PKCE) for an access token and a refresh
 * token. Access tokens are short-lived signed tokens; every MCP call also
 * checks that the connection still exists and the account is still active,
 * so disconnecting in Settings or changing the password ends access at once.
 */

export const MCP_PATH = "/api/mcp";
export const OAUTH_SCOPE = "injaz";
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_AUDIENCE = "injaz-mcp";
const LAST_USED_EVERY_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * The public address of this app, such as https://injaz.example.com. APP_URL
 * wins when set (useful behind unusual proxies); otherwise it comes from the
 * request, which is what Vercel and most hosts forward correctly.
 */
export function originFromHeaders(h: Headers): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100").split(",")[0].trim();
  const proto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() || (LOCAL_HOST.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export const mcpUrl = (origin: string) => `${origin}${MCP_PATH}`;
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource`;

/** RFC 9728: tells Claude which server signs people in for the MCP endpoint. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Injaz | إنجاز",
  };
}

/** RFC 8414: where to register, sign in and get tokens. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [OAUTH_SCOPE, "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}

/* ------------------------------------------------------------------ */
/* Secrets                                                             */
/* ------------------------------------------------------------------ */

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE (S256): the verifier Claude kept must hash to the challenge it sent when the person approved. */
export const pkceMatches = (verifier: string, challenge: string) => /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) && safeEqual(sha256(verifier), challenge);

export const isPkceChallenge = (value: string) => /^[A-Za-z0-9_-]{43,128}$/.test(value);

let cachedKey: Uint8Array | null = null;

/**
 * Key for access tokens, derived from AUTH_SECRET but different from the
 * session key, so an access token never works as a browser session (and a
 * session cookie never works as an access token).
 */
function accessKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is missing or shorter than 32 characters.");
  cachedKey = new Uint8Array(createHmac("sha256", secret).update("injaz-mcp-access-token").digest());
  return cachedKey;
}

type AccessClaims = { userId: string; connectionId: string; sv: number };

export async function signAccessToken(claims: AccessClaims) {
  return new SignJWT({ cid: claims.connectionId, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(claims.userId)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessKey());
}

async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, accessKey(), { algorithms: ["HS256"], audience: TOKEN_AUDIENCE });
    if (!payload.sub || typeof payload.cid !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, connectionId: payload.cid, sv: payload.sv };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Redirect addresses                                                  */
/* ------------------------------------------------------------------ */

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** An address a client may register: https anywhere, or http on this machine (Claude Code and desktop tools). */
export function isAllowedRedirect(value: string) {
  if (typeof value !== "string" || value.length > 500) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}

/**
 * Whether the address in a sign-in request is one the client registered.
 * Exact match, except that loopback addresses match on any port, since
 * native apps listen on a port chosen at random (RFC 8252, section 7.3).
 */
export function redirectMatches(registered: readonly string[], requested: string) {
  if (registered.includes(requested)) return true;
  let want: URL;
  try {
    want = new URL(requested);
  } catch {
    return false;
  }
  if (want.protocol !== "http:" || !LOOPBACK.has(want.hostname)) return false;
  return registered.some((r) => {
    try {
      const have = new URL(r);
      return have.protocol === "http:" && LOOPBACK.has(have.hostname) && have.pathname === want.pathname && have.search === want.search;
    } catch {
      return false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Checking a call                                                     */
/* ------------------------------------------------------------------ */

export type McpCaller = { user: SafeUser; connectionId: string };

/**
 * The person behind a bearer token, or null when the token is missing,
 * expired, disconnected, or the account was deactivated or its password
 * changed since Claude was connected.
 */
export async function authenticate(req: Request): Promise<McpCaller | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const claims = await verifyAccessToken(match[1]);
  if (!claims) return null;

  const db = await getDb();
  const [connection, user] = await Promise.all([
    db.query.mcpConnections.findFirst({
      where: and(eq(mcpConnections.id, claims.connectionId), eq(mcpConnections.userId, claims.userId)),
      columns: { id: true, lastUsedAt: true, sessionVersion: true, refreshTokenHash: true },
    }),
    db.query.users.findFirst({ where: eq(users.id, claims.userId), columns: { passwordHash: false } }),
  ]);
  if (!connection?.refreshTokenHash || !user || !user.isActive) return null;
  if (user.sessionVersion !== claims.sv || connection.sessionVersion !== claims.sv) return null;

  const last = connection.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - last > LAST_USED_EVERY_MS) {
    await db.update(mcpConnections).set({ lastUsedAt: new Date() }).where(eq(mcpConnections.id, connection.id));
  }
  return { user, connectionId: connection.id };
}

/** CORS for the endpoints that tools such as the MCP Inspector call from a browser. Tokens travel in headers, never cookies. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS_HEADERS });

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache", ...extra } });
}

/** 401 that points Claude at the sign-in metadata, which starts the "Connect" flow. */
export function unauthorized(origin: string, hadToken: boolean) {
  const params = [`resource_metadata="${resourceMetadataUrl(origin)}"`, `scope="${OAUTH_SCOPE}"`];
  if (hadToken) params.unshift(`error="invalid_token"`);
  return json({ error: hadToken ? "invalid_token" : "unauthorized", error_description: "Sign in to Injaz to use this connector." }, 401, {
    "WWW-Authenticate": `Bearer ${params.join(", ")}`,
  });
}
