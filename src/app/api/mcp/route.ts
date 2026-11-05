import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { runAsUser } from "@/lib/auth/acting";
import { authenticate, CORS_HEADERS, json, originFromHeaders, preflight, unauthorized } from "@/lib/mcp/oauth";
import { buildMcpServer } from "@/lib/mcp/server";

/**
 * The MCP endpoint Claude connects to (Streamable HTTP, stateless). Each
 * request carries the person's access token; without a valid one the answer
 * is a 401 pointing at the sign-in metadata, which is what makes Claude show
 * "Connect". Answers are plain JSON: every tool finishes within the request.
 */
async function handle(req: Request): Promise<Response> {
  const origin = originFromHeaders(req.headers);
  const caller = await authenticate(req);
  if (!caller) return unauthorized(origin, req.headers.has("authorization"));

  if (req.method !== "POST") {
    // No server-initiated stream in stateless mode.
    return json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, 405, { Allow: "POST, OPTIONS" });
  }

  const server = buildMcpServer(caller.user, origin);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const res = await runAsUser(caller.user, () => transport.handleRequest(req));
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    headers.set("Cache-Control", "no-store");
    const body = await res.arrayBuffer();
    return new Response(body.byteLength > 0 ? body : null, { status: res.status, headers });
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export const OPTIONS = preflight;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
