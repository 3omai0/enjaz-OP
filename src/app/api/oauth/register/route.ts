import { and, lt, notExists, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { mcpClients, mcpConnections } from "@/db/schema";
import { isAllowedRedirect, json, preflight, randomToken } from "@/lib/mcp/oauth";
import { clip } from "@/lib/utils";

/**
 * Dynamic Client Registration (RFC 7591). Claude registers itself here the
 * first time someone adds the connector. A registration grants nothing by
 * itself: a person still has to sign in and approve it. Registrations that
 * never led to a connection are cleared after a day.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "The body must be JSON." }, 400);
  }
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every((u) => typeof u === "string" && isAllowedRedirect(u))) {
    return json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be 1 to 10 https addresses (or http on localhost)." }, 400);
  }
  const redirectUris = [...new Set(uris as string[])];
  const name = clip(typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "MCP client", 100);
  const id = `mcp_${randomToken(18)}`;

  const db = await getDb();
  await db
    .delete(mcpClients)
    .where(and(lt(mcpClients.createdAt, sql`now() - interval '1 day'`), notExists(db.select({ one: sql`1` }).from(mcpConnections).where(sql`${mcpConnections.clientId} = ${mcpClients.id}`))));
  await db.insert(mcpClients).values({ id, name, redirectUris });

  return json(
    {
      client_id: id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    201
  );
}

export const OPTIONS = preflight;
export const dynamic = "force-dynamic";
