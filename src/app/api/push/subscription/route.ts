import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { isPushEndpoint, pushEnabled } from "@/lib/push";
import { clip } from "@/lib/utils";

/** Old subscriptions beyond this many per person are dropped (a new phone, a reinstalled browser...). */
const MAX_DEVICES = 20;

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;
const subscriptionSchema = z.object({
  endpoint: z.string().max(2048),
  keys: z.object({
    // A P-256 public key (65 bytes) and a 16 byte secret, base64url encoded.
    p256dh: z.string().min(80).max(100).regex(BASE64URL),
    auth: z.string().min(16).max(44).regex(BASE64URL),
  }),
  previousEndpoint: z.string().max(2048).optional(),
});
const endpointSchema = z.object({ endpoint: z.string().max(2048) });

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Only this site's own pages and service worker may change a subscription. */
function fromThisSite(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

/**
 * Save this device for the signed-in person. Called when notifications are
 * turned on and again on every visit, so a device that signs in as someone
 * else moves to them and a renewed subscription replaces the old one.
 */
export async function POST(req: Request) {
  if (!fromThisSite(req)) return reply({ ok: false }, 403);
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false }, 401);
  if (!pushEnabled()) return reply({ ok: false }, 503);
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPushEndpoint(parsed.data.endpoint)) return reply({ ok: false }, 400);

  const { endpoint, keys, previousEndpoint } = parsed.data;
  const userAgent = clip(req.headers.get("user-agent") ?? "", 300) || null;
  const db = await getDb();
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
      // Visits that change nothing do not rewrite the row.
      setWhere: sql`(${pushSubscriptions.userId}, ${pushSubscriptions.p256dh}, ${pushSubscriptions.auth}) is distinct from (excluded.user_id, excluded.p256dh, excluded.auth)`,
    });

  const stale = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .orderBy(sql`${pushSubscriptions.createdAt} desc`)
    .offset(MAX_DEVICES);
  const drop = stale.map((r) => r.id);
  if (previousEndpoint && previousEndpoint !== endpoint) {
    await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, previousEndpoint), eq(pushSubscriptions.userId, user.id)));
  }
  if (drop.length > 0) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, drop));
  return reply({ ok: true });
}

/** Forget this device (notifications turned off here). */
export async function DELETE(req: Request) {
  if (!fromThisSite(req)) return reply({ ok: false }, 403);
  const user = await getCurrentUser();
  if (!user) return reply({ ok: false }, 401);
  const parsed = endpointSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false }, 400);
  const db = await getDb();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, parsed.data.endpoint), eq(pushSubscriptions.userId, user.id)));
  return reply({ ok: true });
}
