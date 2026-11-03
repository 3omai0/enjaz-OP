import type { ProjectStatus, TaskPriority, TaskStatus, UserRole } from "@/db/schema";
import type { Pair } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/* Task status                                                         */
/* ------------------------------------------------------------------ */
export type StatusMeta = {
  label: Pair;
  /** Tailwind classes for the colored dot, tinted chip background and chip text. */
  dot: string;
  chip: string;
};

export const TASK_STATUS_META: Record<TaskStatus, StatusMeta> = {
  backlog: {
    label: { ar: "قائمة الانتظار", en: "Backlog" },
    dot: "bg-ink-soft/50",
    chip: "bg-ink/5 text-ink-soft",
  },
  todo: {
    label: { ar: "للتنفيذ", en: "To do" },
    dot: "bg-brand-dark",
    chip: "bg-brand-dark/10 text-brand-dark",
  },
  in_progress: {
    label: { ar: "قيد التنفيذ", en: "In progress" },
    dot: "bg-brand",
    chip: "bg-brand/10 text-brand",
  },
  in_review: {
    label: { ar: "قيد المراجعة", en: "In review" },
    dot: "bg-warning",
    chip: "bg-warning/10 text-warning",
  },
  done: {
    label: { ar: "مكتملة", en: "Done" },
    dot: "bg-success",
    chip: "bg-success/10 text-success",
  },
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review", "done"];
/** Personal tasks skip review: there is nobody else to approve them. */
export const PERSONAL_STATUS_ORDER: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];
export const OPEN_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "in_review"];

/* ------------------------------------------------------------------ */
/* Priority                                                            */
/* ------------------------------------------------------------------ */
export const PRIORITY_META: Record<TaskPriority, { label: Pair; text: string; chip: string; rank: number }> = {
  low: { label: { ar: "منخفضة", en: "Low" }, text: "text-ink-soft", chip: "bg-ink/5 text-ink-soft", rank: 0 },
  medium: { label: { ar: "متوسطة", en: "Medium" }, text: "text-brand", chip: "bg-brand/10 text-brand", rank: 1 },
  high: { label: { ar: "عالية", en: "High" }, text: "text-warning", chip: "bg-warning/10 text-warning", rank: 2 },
  urgent: { label: { ar: "عاجلة", en: "Urgent" }, text: "text-danger", chip: "bg-danger/10 text-danger", rank: 3 },
};

export const PRIORITY_ORDER: TaskPriority[] = ["urgent", "high", "medium", "low"];

/* ------------------------------------------------------------------ */
/* Project status                                                      */
/* ------------------------------------------------------------------ */
export const PROJECT_STATUS_META: Record<ProjectStatus, { label: Pair; chip: string; dot: string }> = {
  planning: { label: { ar: "تخطيط", en: "Planning" }, chip: "bg-brand-dark/10 text-brand-dark", dot: "bg-brand-dark" },
  active: { label: { ar: "نشط", en: "Active" }, chip: "bg-brand/10 text-brand", dot: "bg-brand" },
  on_hold: { label: { ar: "متوقف مؤقتاً", en: "On hold" }, chip: "bg-warning/10 text-warning", dot: "bg-warning" },
  completed: { label: { ar: "مكتمل", en: "Completed" }, chip: "bg-success/10 text-success", dot: "bg-success" },
  archived: { label: { ar: "مؤرشف", en: "Archived" }, chip: "bg-ink/5 text-ink-soft", dot: "bg-ink-soft/50" },
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = ["planning", "active", "on_hold", "completed", "archived"];

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */
export const ROLE_META: Record<UserRole, { label: Pair; desc: Pair; chip: string }> = {
  admin: {
    label: { ar: "مدير النظام", en: "Administrator" },
    desc: { ar: "صلاحيات كاملة على المشاريع والفريق والإعدادات.", en: "Full access to projects, team and settings." },
    chip: "bg-brand-dark text-white",
  },
  manager: {
    label: { ar: "مدير مشاريع", en: "Project manager" },
    desc: { ar: "ينشئ المشاريع ويوزع المهام ويدير الأعضاء.", en: "Creates projects, assigns tasks and manages members." },
    chip: "bg-brand/10 text-brand",
  },
  member: {
    label: { ar: "موظف", en: "Employee" },
    desc: { ar: "يرى مشاريعه ومهامه والمهام العامة ويحدّث حالتها.", en: "Sees their projects, their tasks and general tasks, and updates them." },
    chip: "bg-ink/5 text-ink-soft",
  },
};

/* ------------------------------------------------------------------ */
/* Palette choices for projects and labels                             */
/* ------------------------------------------------------------------ */
export const PROJECT_COLORS = ["#8554eb", "#33177e", "#2a04c9", "#0e7490", "#15803d", "#b45309", "#dc2626", "#be185d"];

export const LABEL_COLORS = ["#8554eb", "#33177e", "#0e7490", "#15803d", "#b45309", "#dc2626", "#be185d", "#625a7a"];

/** Tints used for member avatars (index picked from the user id). */
export const AVATAR_TINTS = [
  "bg-brand/12 text-brand",
  "bg-brand-dark/12 text-brand-dark",
  "bg-success/12 text-success",
  "bg-warning/12 text-warning",
  "bg-danger/10 text-danger",
  "bg-ink/6 text-ink",
];
