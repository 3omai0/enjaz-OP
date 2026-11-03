import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";

export async function countUnread(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function listNotifications(userId: string, limit = 50) {
  const db = await getDb();
  return db.query.notifications.findMany({
    where: eq(notifications.userId, userId),
    orderBy: [desc(notifications.createdAt)],
    limit,
    with: { actor: { columns: { id: true, name: true } } },
  });
}
