import { authorizationServerMetadata, json, originFromHeaders, preflight, protectedResourceMetadata } from "@/lib/mcp/oauth";

/**
 * Discovery documents. next.config.ts serves them at the standard addresses:
 * /.well-known/oauth-protected-resource (and the same with /api/mcp after it)
 * and /.well-known/oauth-authorization-server (and openid-configuration).
 */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const origin = originFromHeaders(req.headers);
  if (kind === "protected-resource") return json(protectedResourceMetadata(origin), 200, { "Cache-Control": "public, max-age=300" });
  if (kind === "authorization-server") return json(authorizationServerMetadata(origin), 200, { "Cache-Control": "public, max-age=300" });
  return json({ error: "not_found" }, 404);
}

export const OPTIONS = preflight;
export const dynamic = "force-dynamic";
