import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

/**
 * Pages reachable without a session. The API routes answer for themselves instead of redirecting.
 * Claude's connector (/api/mcp) and its sign-in endpoints use access tokens, not the cookie.
 */
const PUBLIC_PATHS = ["/login", "/setup", "/api/auth/clear", "/api/updates", "/api/lang", "/api/push", "/api/cron", "/api/mcp", "/api/oauth", "/.well-known"];

/**
 * Route guard. Anything that is not a public page needs a valid session
 * cookie; signed-in users are kept away from the login page. The app layout
 * re-checks the user against the database, this is only the fast path.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (pathname === "/") {
    return NextResponse.redirect(new URL(session ? "/dashboard" : "/login", req.url));
  }

  if (!session && !isPublic) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

/**
 * Static files skip the guard. That includes the web app manifest and the
 * service worker (sw.js): browsers fetch them without the session cookie, and
 * a redirect to the login page would stop the app from installing.
 */
export const config = {
  matcher: ["/((?!_next|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|js|webmanifest)$).*)"],
};
