import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mcpClients, mcpConnections, type McpClient, type SafeUser } from "@/db/schema";
import { clip } from "@/lib/utils";
import { CODE_TTL_MS, isPkceChallenge, OAUTH_SCOPE, randomToken, redirectMatches, sha256 } from "./oauth";

/** The parameters of a sign-in request, as Claude sends them to /oauth/authorize. */
export type AuthorizeParams = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
  resource?: string;
};

export const AUTHORIZE_FIELDS = ["response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"] as const;

export type ValidRequest = {
  client: McpClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
};

/**
 * Problems that must never send the person back to the client: an unknown
 * client or an address it did not register. They are shown on the page.
 */
export type FatalProblem = "unknown_client" | "bad_redirect";

/** Problems reported back to the client at its (verified) address, as OAuth expects. */
export type RedirectProblem = { redirectUri: string; state: string | null; error: "invalid_request" | "unsupported_response_type"; description: string };

export async function validateAuthorizeRequest(p: AuthorizeParams): Promise<{ ok: ValidRequest } | { fatal: FatalProblem } | { redirect: RedirectProblem }> {
  const clientId = (p.client_id ?? "").trim();
  if (!clientId || clientId.length > 100) return { fatal: "unknown_client" };
  const db = await getDb();
  const client = await db.query.mcpClients.findFirst({ where: eq(mcpClients.id, clientId) });
  if (!client) return { fatal: "unknown_client" };

  // Without an address, the only registered one is used; otherwise it must be one the client registered.
  const redirectUri = p.redirect_uri?.trim() || (client.redirectUris.length === 1 ? client.redirectUris[0] : "");
  if (!redirectUri || !redirectMatches(client.redirectUris, redirectUri)) return { fatal: "bad_redirect" };

  const state = p.state ?? null;
  const fail = (error: RedirectProblem["error"], description: string) => ({ redirect: { redirectUri, state, error, description } });
  if (state !== null && state.length > 2048) return fail("invalid_request", "state is too long");
  if (p.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
  if (!p.code_challenge || !isPkceChallenge(p.code_challenge)) return fail("invalid_request", "A PKCE code_challenge is required");
  if ((p.code_challenge_method ?? "plain") !== "S256") return fail("invalid_request", "code_challenge_method must be S256");

  return { ok: { client, redirectUri, state, codeChallenge: p.code_challenge, scope: clip(p.scope?.trim() || OAUTH_SCOPE, 200) } };
}

/** The client's address with OAuth result parameters added (keeping any query it already has). */
export function withParams(redirectUri: string, params: Record<string, string | null>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== null) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * The person approved the client: store a pending connection with a one-time
 * code (only its hash is kept) and return the code. Codes nobody exchanged in
 * time are cleared on the way.
 */
export async function issueCode(user: SafeUser, req: ValidRequest): Promise<string> {
  const code = randomToken();
  const db = await getDb();
  await db.delete(mcpConnections).where(and(isNull(mcpConnections.refreshTokenHash), lt(mcpConnections.codeExpiresAt, sql`now()`)));
  await db.insert(mcpConnections).values({
    userId: user.id,
    clientId: req.client.id,
    clientName: req.client.name,
    scope: req.scope,
    codeHash: sha256(code),
    codeChallenge: req.codeChallenge,
    redirectUri: req.redirectUri,
    codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    sessionVersion: user.sessionVersion,
  });
  return code;
}
