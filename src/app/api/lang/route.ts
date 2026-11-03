import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { safePath } from "@/lib/actions/types";
import { getCurrentUser } from "@/lib/auth/session";
import { isLang, LANG_COOKIE } from "@/lib/i18n";

/**
 * Language switch. The form posts here, the preference is saved (cookie, and
 * the account when signed in), and the browser reloads the same page in the
 * new language. A full load is the most reliable way to flip the reading
 * direction and fonts, and no page is left cached in the old language.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  // Only this site's own pages may switch the language.
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return new NextResponse(null, { status: 403 });

  const form = await req.formData();
  const lang = form.get("lang");
  const back = safePath(String(form.get("back") ?? ""), "/dashboard");
  const res = NextResponse.redirect(new URL(back, url.origin), 303);
  if (!isLang(lang)) return res;

  res.cookies.set(LANG_COOKIE, lang, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  const user = await getCurrentUser();
  if (user && user.locale !== lang) {
    const db = await getDb();
    await db.update(users).set({ locale: lang, updatedAt: new Date() }).where(eq(users.id, user.id));
  }
  return res;
}
