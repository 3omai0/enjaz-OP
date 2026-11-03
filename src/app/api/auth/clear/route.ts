import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Drops a session cookie that no longer works (its user was deleted,
 * deactivated or signed out everywhere) and sends the visitor to the login
 * page; without this the proxy and the app would bounce between /login and
 * /dashboard. A working session is left alone, so a link to this address
 * cannot be used to sign someone out.
 */
export async function GET(req: Request) {
  if (await getCurrentUser()) return NextResponse.redirect(new URL("/dashboard", req.url));
  const res = NextResponse.redirect(new URL("/login", req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
