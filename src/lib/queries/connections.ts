import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { mcpConnections } from "@/db/schema";

/** Apps (such as Claude) the person connected to their account, newest first. Pending sign-ins are left out. */
export async function listMcpConnections(userId: string) {
  const db = await getDb();
  return db
    .select({ id: mcpConnections.id, name: mcpConnections.clientName, createdAt: mcpConnections.createdAt, lastUsedAt: mcpConnections.lastUsedAt })
    .from(mcpConnections)
    .where(and(eq(mcpConnections.userId, userId), isNotNull(mcpConnections.refreshTokenHash)))
    .orderBy(desc(mcpConnections.createdAt));
}
