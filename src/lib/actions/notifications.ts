"use server";

import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/utils";
import { revalidateAll } from "./helpers";

export async function markAllReadAction() {
  const user = await requireUser();
  const db = await getDb();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidateAll();
}

export async function markReadAction(id: string) {
  const user = await requireUser();
  if (!isUuid(id)) return;
  const db = await getDb();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
  revalidateAll();
}
