import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mcpConnections, users } from "@/db/schema";
import { ACCESS_TOKEN_TTL_SECONDS, json, pkceMatches, preflight, randomToken, sha256, signAccessToken } from "@/lib/mcp/oauth";

/**
 * Token endpoint (RFC 6749). Claude trades the one-time code for tokens, and
 * later its refresh token for new ones. Refresh tokens rotate on every use:
 * the old one stops working as soon as the new one is issued.
 */

const fail = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);

async function readParams(req: Request): Promise<URLSearchParams | null> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
    }
    return new URLSearchParams(await req.text());
  } catch {
    return null;
  }
}

/** The account must still be active and unchanged (no password change or deactivation) since it was connected. */
async function accountStillValid(userId: string, sessionVersion: number) {
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { isActive: true, sessionVersion: true } });
  return !!user && user.isActive && user.sessionVersion === sessionVersion;
}

async function issue(connection: { id: string; userId: string; sessionVersion: number; scope: string | null }, refreshToken: string) {
  const accessToken = await signAccessToken({ userId: connection.userId, connectionId: connection.id, sv: connection.sessionVersion });
  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: connection.scope ?? undefined,
  });
}

export async function POST(req: Request) {
  const params = await readParams(req);
  if (!params) return fail("invalid_request", "Unreadable body.");
  const grant = params.get("grant_type");
  const clientId = params.get("client_id");
  const db = await getDb();
  const refreshToken = randomToken();

  if (grant === "authorization_code") {
    const code = params.get("code") ?? "";
    const verifier = params.get("code_verifier") ?? "";
    if (!code || !verifier) return fail("invalid_request", "code and code_verifier are required.");
    const pending = await db.query.mcpConnections.findFirst({ where: and(eq(mcpConnections.codeHash, sha256(code)), gt(mcpConnections.codeExpiresAt, sql`now()`)) });
    if (!pending || !pending.codeChallenge) return fail("invalid_grant", "The code is invalid or expired.");
    if (clientId && clientId !== pending.clientId) return fail("invalid_grant", "The code was issued to another client.");
    const redirectUri = params.get("redirect_uri");
    if (redirectUri && redirectUri !== pending.redirectUri) return fail("invalid_grant", "redirect_uri does not match.");
    if (!pkceMatches(verifier, pending.codeChallenge)) return fail("invalid_grant", "PKCE verification failed.");
    if (!(await accountStillValid(pending.userId, pending.sessionVersion))) return fail("invalid_grant", "The account is no longer available.");

    // Clearing the code in the same statement makes it single use, even when two requests race.
    const [connection] = await db
      .update(mcpConnections)
      .set({ codeHash: null, codeChallenge: null, codeExpiresAt: null, refreshTokenHash: sha256(refreshToken), lastUsedAt: new Date() })
      .where(and(eq(mcpConnections.id, pending.id), eq(mcpConnections.codeHash, pending.codeHash as string)))
      .returning();
    if (!connection) return fail("invalid_grant", "The code was already used.");
    return issue(connection, refreshToken);
  }

  if (grant === "refresh_token") {
    const presented = params.get("refresh_token") ?? "";
    if (!presented) return fail("invalid_request", "refresh_token is required.");
    const current = await db.query.mcpConnections.findFirst({ where: eq(mcpConnections.refreshTokenHash, sha256(presented)) });
    if (!current) return fail("invalid_grant", "The refresh token is invalid or was revoked.");
    if (clientId && clientId !== current.clientId) return fail("invalid_grant", "The refresh token belongs to another client.");
    if (!(await accountStillValid(current.userId, current.sessionVersion))) {
      await db.delete(mcpConnections).where(eq(mcpConnections.id, current.id));
      return fail("invalid_grant", "The account changed; connect again.");
    }
    const [connection] = await db
      .update(mcpConnections)
      .set({ refreshTokenHash: sha256(refreshToken), lastUsedAt: new Date() })
      .where(and(eq(mcpConnections.id, current.id), eq(mcpConnections.refreshTokenHash, current.refreshTokenHash as string)))
      .returning();
    if (!connection) return fail("invalid_grant", "The refresh token was already used.");
    return issue(connection, refreshToken);
  }

  return fail("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export const OPTIONS = preflight;
export const dynamic = "force-dynamic";
