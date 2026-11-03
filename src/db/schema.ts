import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */
export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "member"]);
export const projectStatusEnum = pgEnum("project_status", ["planning", "active", "on_hold", "completed", "archived"]);
export const taskStatusEnum = pgEnum("task_status", ["backlog", "todo", "in_progress", "in_review", "done"]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const recurrenceEnum = pgEnum("recurrence", ["daily", "weekly", "monthly", "yearly"]);

export const USER_ROLES = userRoleEnum.enumValues;
export const PROJECT_STATUSES = projectStatusEnum.enumValues;
export const TASK_STATUSES = taskStatusEnum.enumValues;
export const TASK_PRIORITIES = taskPriorityEnum.enumValues;
export const RECURRENCES = recurrenceEnum.enumValues;

export type UserRole = (typeof USER_ROLES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type Recurrence = (typeof RECURRENCES)[number];

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ------------------------------------------------------------------ */
/* Users (employees)                                                   */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("member"),
    jobTitle: text("job_title"),
    department: text("department"),
    phone: text("phone"),
    locale: varchar("locale", { length: 2 }).notNull().default("ar"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Bumped on password change or deactivation; sessions signed with an older value stop working. */
    sessionVersion: integer("session_version").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(sql`lower(${t.email})`)]
);

/**
 * Wrong-password records from when sign-in was rate limited. Nothing writes
 * here since the owner had the limits removed; the table stays so they can
 * return without a migration, and `npm run reset-password` empties it.
 */
export const authAttempts = pgTable(
  "auth_attempts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email"),
    ip: text("ip").notNull(),
    success: boolean("success").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_attempts_email_idx").on(t.email, t.createdAt), index("auth_attempts_ip_idx").on(t.ip, t.createdAt)]
);

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    key: varchar("key", { length: 8 }).notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("active"),
    color: varchar("color", { length: 7 }).notNull().default("#8554eb"),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** "assigned": members see their own + general tasks. "all": members see every task. */
    taskVisibility: varchar("task_visibility", { length: 10 }).notNull().default("assigned"),
    /** When true only administrators and project managers can mark tasks as done. */
    requireApproval: boolean("require_approval").notNull().default(true),
    taskCounter: integer("task_counter").notNull().default(0),
    /**
     * Set on a person's private space for their own tasks (one per person):
     * only that person may see or change it, whatever their role, and it never
     * shows up in team lists, counts or searches. Deleted with the person.
     */
    personalOwnerId: uuid("personal_owner_id").references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_key_idx").on(sql`upper(${t.key})`),
    index("projects_status_idx").on(t.status),
    uniqueIndex("projects_personal_owner_idx").on(t.personalOwnerId).where(sql`${t.personalOwnerId} is not null`),
  ]
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 10 }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)]
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: varchar("color", { length: 7 }).notNull().default("#8554eb"),
  },
  (t) => [index("labels_project_idx").on(t.projectId)]
);

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Per-project sequence, rendered as KEY-12. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    /** Null once the person who created the task has been deleted; the task stays. */
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    dueDate: date("due_date"),
    position: doublePrecision("position").notNull().default(0),
    estimateHours: doublePrecision("estimate_hours"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tasks_project_number_idx").on(t.projectId, t.number),
    index("tasks_project_status_idx").on(t.projectId, t.status),
    index("tasks_due_idx").on(t.dueDate),
  ]
);

/**
 * The people a task is assigned to. A task without any row here is a
 * general task, visible to every member of its project; otherwise members
 * only see it when they are one of its assignees (unless the project shows
 * every task to its members).
 */
export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.userId] }), index("task_assignees_user_idx").on(t.userId)]
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] }), index("task_labels_label_idx").on(t.labelId)]
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checklist_task_idx").on(t.taskId)]
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Null once the author has been deleted; the comment stays, shown as from a former member. */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [index("comments_task_idx").on(t.taskId)]
);

/* ------------------------------------------------------------------ */
/* Recurring tasks                                                     */
/* ------------------------------------------------------------------ */
/**
 * A schedule that creates a fresh task in its project each time it comes
 * round (every day, on chosen weekdays, on a day of the month, or on one
 * date a year) at a clock time in the team's time zone, and notifies the
 * people it is for. `nextAt` is the instant the next task is due; the cron
 * route creates every task whose instant has passed and moves it forward.
 */
export const recurringTasks = pgTable(
  "recurring_tasks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    /** Who each created task is assigned to; empty means a general task for the project. */
    assigneeIds: jsonb("assignee_ids").$type<string[]>().notNull().default([]),
    labelIds: jsonb("label_ids").$type<string[]>().notNull().default([]),
    recurrence: recurrenceEnum("recurrence").notNull(),
    /** Minutes after midnight in the team's time zone (09:30 is 570). */
    minuteOfDay: integer("minute_of_day").notNull().default(540),
    /** Weekly: days to fire on, 0 = Sunday ... 6 = Saturday. */
    weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),
    /** Monthly and yearly: the day of the month; a month without it fires on its last day. */
    dayOfMonth: integer("day_of_month"),
    /** Yearly: 1 = January ... 12 = December. */
    month: integer("month"),
    enabled: boolean("enabled").notNull().default(true),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull(),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    /** How many tasks this schedule has created so far. */
    fireCount: integer("fire_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("recurring_tasks_project_idx").on(t.projectId), index("recurring_tasks_due_idx").on(t.enabled, t.nextAt)]
);

/* ------------------------------------------------------------------ */
/* Activity log and notifications                                      */
/* ------------------------------------------------------------------ */
export type ActivityPayload = Record<string, string | number | boolean | null | undefined | string[]>;

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<ActivityPayload>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activities_project_idx").on(t.projectId, t.createdAt), index("activities_task_idx").on(t.taskId), index("activities_created_idx").on(t.createdAt)]
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<ActivityPayload>().notNull().default({}),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt), index("notifications_user_created_idx").on(t.userId, t.createdAt)]
);

/**
 * Devices that asked for push notifications (phone, tablet or computer).
 * One row per browser subscription; a device that signs in as someone else
 * moves to that person.
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint), index("push_subscriptions_user_idx").on(t.userId)]
);

/* ------------------------------------------------------------------ */
/* Relations (for db.query.* helpers)                                  */
/* ------------------------------------------------------------------ */
export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(projectMembers),
  assignments: many(taskAssignees),
  notifications: many(notifications),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  members: many(projectMembers),
  tasks: many(tasks),
  labels: many(labels),
  activities: many(activities),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const labelsRelations = relations(labels, ({ one, many }) => ({
  project: one(projects, { fields: [labels.projectId], references: [projects.id] }),
  taskLabels: many(taskLabels),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignees: many(taskAssignees),
  creator: one(users, { fields: [tasks.creatorId], references: [users.id], relationName: "creator" }),
  taskLabels: many(taskLabels),
  checklist: many(checklistItems),
  comments: many(comments),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  task: one(tasks, { fields: [checklistItems.taskId], references: [tasks.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const recurringTasksRelations = relations(recurringTasks, ({ one }) => ({
  project: one(projects, { fields: [recurringTasks.projectId], references: [projects.id] }),
  creator: one(users, { fields: [recurringTasks.createdBy], references: [users.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  project: one(projects, { fields: [activities.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [activities.taskId], references: [tasks.id] }),
  actor: one(users, { fields: [activities.actorId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  actor: one(users, { fields: [notifications.actorId], references: [users.id] }),
}));

/* ------------------------------------------------------------------ */
/* Row types                                                           */
/* ------------------------------------------------------------------ */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type ProjectMember = typeof projectMembers.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type RecurringTask = typeof recurringTasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/** Public shape of a user, safe to send to the client. */
export type SafeUser = Omit<User, "passwordHash">;
