import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export type ShellState = {
  /** Session version of the account, or null when it no longer exists or is deactivated. */
  sessionVersion: number | null;
  unread: number;
  /** Open tasks assigned to the user, in projects that are not archived. */
  myOpen: number;
  /** Open general tasks (nobody assigned) the user can see, in projects that are not archived. */
  generalOpen: number;
  /** Open tasks in the user's personal space (never counted in the two numbers above). */
  personalOpen: number;
  /**
   * Fingerprint of everything the user can see (tasks, activity, projects,
   * notifications). It changes whenever something visible to them changes, and
   * only then, so the browser knows when to refresh without downloading data.
   */
  version: string;
};

type Row = {
  sv: number | null;
  unread: number;
  my_open: number;
  general_open: number;
  personal_open: number;
  task_count: number;
  tasks_at: string | null;
  activity_at: string | null;
  notified_at: string | null;
  project_count: number;
  projects_at: string | null;
  comment_count: number;
  label_count: number;
  assignee_count: number;
};

/**
 * Everything the app shell needs in a single query: the counters in the
 * sidebar and the live-update fingerprint. The visibility rule matches the
 * rest of the app: staff see every task of team projects, employees their
 * own and general tasks plus every task of projects that show all tasks.
 * Personal spaces belong to their owner alone: the user's own is in the
 * fingerprint (so its page refreshes too) and counted apart; nobody else's is.
 */
export async function getShellState(userId: string): Promise<ShellState> {
  const db = await getDb();
  const result = await db.execute(sql`
    with me as (
      select id, role, session_version from users where id = ${userId} and is_active
    ),
    staff as (
      select exists (select 1 from me where role in ('admin', 'manager')) as yes
    ),
    scope as (
      select p.id, p.task_visibility, p.status, p.updated_at, p.personal_owner_id is not null as personal from projects p
      where p.personal_owner_id = ${userId}
         or (p.personal_owner_id is null and ((select yes from staff)
           or exists (select 1 from project_members pm where pm.project_id = p.id and pm.user_id = ${userId})))
    ),
    assigned as (
      select a.task_id, bool_or(a.user_id = ${userId}) as mine
      from task_assignees a join tasks t on t.id = a.task_id join scope s on s.id = t.project_id
      group by a.task_id
    ),
    visible as (
      select t.id, t.updated_at, coalesce(x.mine, false) as mine, x.task_id is null as general, s.personal, t.status, s.status as project_status
      from tasks t join scope s on s.id = t.project_id
      left join assigned x on x.task_id = t.id
      where s.personal or (select yes from staff) or s.task_visibility = 'all' or x.task_id is null or x.mine
    )
    select
      (select session_version from me) as sv,
      (select count(*)::int from notifications n where n.user_id = ${userId} and n.read_at is null) as unread,
      (select count(*)::int from visible v where v.mine and not v.personal and v.status <> 'done' and v.project_status <> 'archived') as my_open,
      (select count(*)::int from visible v where v.general and not v.personal and v.status <> 'done' and v.project_status <> 'archived') as general_open,
      (select count(*)::int from visible v where v.personal and v.status <> 'done') as personal_open,
      (select count(*)::int from visible) as task_count,
      (select max(v.updated_at)::text from visible v) as tasks_at,
      (select max(a.created_at)::text from activities a join scope s on s.id = a.project_id
        where a.task_id in (select id from visible)
           or (a.task_id is null and ((select yes from staff) or a.type <> 'task_deleted' or a.payload->>'audience' in ('general', ${userId}::text)
             or coalesce(a.payload->'audienceIds', '[]'::jsonb) @> jsonb_build_array(${userId}::text)))) as activity_at,
      (select max(n.created_at)::text from notifications n where n.user_id = ${userId}) as notified_at,
      (select count(*)::int from scope) as project_count,
      (select max(s.updated_at)::text from scope s) as projects_at,
      (select count(*)::int from comments c where c.task_id in (select id from visible)) as comment_count,
      (select count(*)::int from labels l where l.project_id in (select id from scope)) as label_count,
      (select count(*)::int from task_assignees a where a.task_id in (select id from visible)) as assignee_count
  `);
  const row = (result as unknown as { rows: Row[] }).rows[0];
  const parts = [row.task_count, row.tasks_at, row.activity_at, row.unread, row.notified_at, row.project_count, row.projects_at, row.my_open, row.general_open, row.personal_open, row.comment_count, row.label_count, row.assignee_count];
  return {
    sessionVersion: row.sv === null || row.sv === undefined ? null : Number(row.sv),
    unread: Number(row.unread ?? 0),
    myOpen: Number(row.my_open ?? 0),
    generalOpen: Number(row.general_open ?? 0),
    personalOpen: Number(row.personal_open ?? 0),
    version: createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 20),
  };
}
