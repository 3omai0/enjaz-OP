import { NextResponse } from "next/server";
import { fireDueRecurringTasks } from "@/lib/queries/recurring";

/**
 * Creates every recurring task whose time has come and sends its reminders.
 * Meant to be called about once a minute by a scheduler (Vercel Cron, or an
 * external cron service on the Hobby plan). It is protected by CRON_SECRET:
 * send it as `Authorization: Bearer <secret>` (what Vercel Cron does) or as
 * the `x-cron-secret` header. Without the secret set, the route stays closed.
 */
const SECRET = process.env.CRON_SECRET?.trim() ?? "";

function authorized(req: Request) {
  if (!SECRET) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  return bearer === SECRET || header === SECRET;
}

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const result = await fireDueRecurringTasks();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron] recurring tasks failed", err);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = run;
export const POST = run;
export const dynamic = "force-dynamic";
