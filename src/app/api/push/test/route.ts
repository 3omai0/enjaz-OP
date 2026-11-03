import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n/server";
import { sendTestPush } from "@/lib/push";

/** One test every few seconds per person is plenty. */
const GAP_MS = 5_000;
const lastTest = new Map<string, number>();

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Send a short test notification to this device. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return reply({ ok: false }, 403);
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false }, 401);
  const parsed = z.object({ endpoint: z.string().max(2048) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false }, 400);

  const now = Date.now();
  if (now - (lastTest.get(user.id) ?? 0) < GAP_MS) return reply({ ok: false, error: "wait" }, 429);
  lastTest.set(user.id, now);

  const db = await getDb();
  const target = await db.query.pushSubscriptions.findFirst({
    where: and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, user.id)),
  });
  if (!target) return reply({ ok: false, error: "missing" }, 404);
  const outcome = await sendTestPush(target, await getLang());
  if (outcome === "gone") return reply({ ok: false, error: "gone" }, 410);
  return reply({ ok: outcome === "sent" }, outcome === "sent" ? 200 : 502);
}
