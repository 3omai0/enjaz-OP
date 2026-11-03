import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activities, type Project, type SafeUser } from "@/db/schema";
import { dashboardActivityFilter, projectActivityFilter } from "./access";

type Actor = Pick<SafeUser, "id" | "role">;

const feedWith = { actor: { columns: { id: true, name: true } }, project: { columns: { id: true, name: true, key: true } } } as const;

/** A project's activity log, without entries about tasks hidden from the user. */
export async function listProjectActivity(user: Actor, project: Pick<Project, "id" | "taskVisibility">, limit = 60) {
  const db = await getDb();
  return db.query.activities.findMany({
    where: and(eq(activities.projectId, project.id), projectActivityFilter(db, user, project)),
    orderBy: [desc(activities.createdAt)],
    limit,
    with: feedWith,
  });
}

/** Latest activity across the projects the user works in, with the same visibility rule. */
export async function listRecentActivity(user: Actor, limit = 10) {
  const db = await getDb();
  return db.query.activities.findMany({
    where: dashboardActivityFilter(db, user),
    orderBy: [desc(activities.createdAt)],
    limit,
    with: feedWith,
  });
}

export type ActivityItem = Awaited<ReturnType<typeof listProjectActivity>>[number];
