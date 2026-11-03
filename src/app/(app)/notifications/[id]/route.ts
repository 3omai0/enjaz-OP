import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { safePath } from "@/lib/actions/types";
import { requireUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/utils";

/**
 * Where a device notification leads when it is tapped: the notification is
 * marked read and the browser goes on to its task or project. Only the
 * recipient can open it; anyone else lands on their own notifications.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let target = "/notifications";
  if (isUuid(id)) {
    const db = await getDb();
    const [row] = await db
      .update(notifications)
      .set({ readAt: sql`coalesce(${notifications.readAt}, now())` })
      .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
      .returning({ href: notifications.href });
    if (row) target = safePath(row.href, "/notifications");
  }
  return NextResponse.redirect(new URL(target, req.url), { status: 303, headers: { "Cache-Control": "no-store" } });
}
