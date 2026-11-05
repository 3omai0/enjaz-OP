import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTHORIZE_FIELDS, issueCode, validateAuthorizeRequest, withParams, type AuthorizeParams } from "@/lib/mcp/authorize";
import { originFromHeaders } from "@/lib/mcp/oauth";

/**
 * The person's answer on the consent page (/oauth/authorize). Only a signed-in
 * person, posting from this site, can approve: the session cookie is
 * SameSite=Lax (never sent with a cross-site POST) and the Origin is checked.
 */
export async function POST(req: Request) {
  const origin = originFromHeaders(req.headers);
  const sentFrom = req.headers.get("origin");
  if (sentFrom && sentFrom !== origin && sentFrom !== new URL(req.url).origin) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const form = await req.formData();
  const params: AuthorizeParams = {};
  for (const key of AUTHORIZE_FIELDS) {
    const value = form.get(key);
    if (typeof value === "string") params[key] = value;
  }

  const user = await getCurrentUser();
  if (!user) {
    const back = `/oauth/authorize?${new URLSearchParams(params as Record<string, string>)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, origin), 303);
  }

  const checked = await validateAuthorizeRequest(params);
  if ("fatal" in checked) return new NextResponse("Invalid sign-in request", { status: 400 });
  if ("redirect" in checked) {
    const { redirectUri, state, error, description } = checked.redirect;
    return NextResponse.redirect(withParams(redirectUri, { error, error_description: description, state }), 303);
  }

  const { ok } = checked;
  if (form.get("decision") !== "allow") {
    return NextResponse.redirect(withParams(ok.redirectUri, { error: "access_denied", error_description: "The person declined.", state: ok.state, iss: origin }), 303);
  }
  const code = await issueCode(user, ok);
  return NextResponse.redirect(withParams(ok.redirectUri, { code, state: ok.state, iss: origin }), 303);
}

export const dynamic = "force-dynamic";
