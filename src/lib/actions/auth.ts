"use server";

import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { pushSubscriptions, users, type UserRole } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { isLang, LANG_COOKIE } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { countUsers, findUserByEmail } from "@/lib/queries/users";
import { guard } from "./helpers";
import { safeNext, str, type ActionState } from "./types";

async function rememberLocale(locale: string) {
  if (!isLang(locale)) return;
  const store = await cookies();
  store.set(LANG_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

/**
 * A real bcrypt hash to compare against when the email is unknown, so a
 * wrong email takes as long as a wrong password and does not reveal which
 * addresses have accounts.
 */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= hashPassword("injaz-timing-equalizer"));

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const { t } = await getT();
    const email = str(formData, "email").toLowerCase().slice(0, 254);
    const password = String(formData.get("password") ?? "").slice(0, 128);
    const next = safeNext(str(formData, "next"));

    if (!z.email().safeParse(email).success || password.length === 0) {
      return { error: t(dict.auth.invalidCredentials) };
    }

    const user = await findUserByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
    if (!user || !valid) return { error: t(dict.auth.invalidCredentials) };
    if (!user.isActive) return { error: t(dict.auth.inactive) };

    const db = await getDb();
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await createSession(user);
    await rememberLocale(user.locale);
    redirect(next);
  });
}

/** Sign out. The form sends this device's push address (if any) so its notifications stop too. */
export async function logoutAction(formData?: FormData) {
  const endpoint = formData ? str(formData, "pushEndpoint") : "";
  const session = await getSession();
  if (session && endpoint) {
    try {
      const db = await getDb();
      await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, session.sub)));
    } catch (err) {
      console.error(err);
    }
  }
  await destroySession();
  redirect("/login");
}

const setupSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.email(),
    password: z.string().min(8).max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

type CreatedAdmin = { id: string; name: string; email: string; role: UserRole; session_version: number };

/** First-run: creates the administrator when the users table is empty. */
export async function setupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guard(async () => {
    const { t, lang } = await getT();
    if ((await countUsers()) > 0) return { error: t(dict.auth.setupClosed) };

    const parsed = setupSchema.safeParse({
      name: str(formData, "name"),
      email: str(formData, "email").toLowerCase(),
      password: String(formData.get("password") ?? ""),
      confirm: String(formData.get("confirm") ?? ""),
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (key === "name") fieldErrors.name = t(dict.common.required);
        else if (key === "email") fieldErrors.email = t(dict.common.invalidEmail);
        else if (key === "password") fieldErrors.password = t(dict.common.passwordMin);
        else if (key === "confirm") fieldErrors.confirm = t(dict.auth.passwordsMismatch);
      }
      return { fieldErrors };
    }

    // One statement that only inserts while the table is still empty, so two
    // people finishing setup at the same moment cannot both become administrator.
    const db = await getDb();
    const passwordHash = await hashPassword(parsed.data.password);
    const result = await db.execute(sql`
      insert into ${users} (name, email, password_hash, role, locale, last_login_at)
      select ${parsed.data.name}::text, ${parsed.data.email}::text, ${passwordHash}::text, 'admin'::user_role, ${lang}::varchar, now()
      where not exists (select 1 from ${users})
      returning id, name, email, role, session_version`);
    const created = (result as unknown as { rows: CreatedAdmin[] }).rows[0];
    if (!created) return { error: t(dict.auth.setupClosed) };

    await createSession({ id: created.id, name: created.name, email: created.email, role: created.role, sessionVersion: Number(created.session_version) });
    redirect("/dashboard");
  });
}
