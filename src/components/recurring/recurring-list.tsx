"use client";

import { CalendarClock, MoreHorizontal, Pause, Pencil, Play, Repeat, Trash2, Zap } from "lucide-react";
import { useState, useTransition } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { GeneralBadge, LabelChip, PriorityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { SafeUser } from "@/db/schema";
import { deleteRecurringTaskAction, runRecurringNowAction, setRecurringEnabledAction } from "@/lib/actions/recurring";
import { fmtDateTime } from "@/lib/format";
import { fill } from "@/lib/i18n";
import { useLang, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import type { RecurringCard } from "@/lib/queries/recurring";
import { ruleSummary } from "@/lib/recurrence-text";
import { cn } from "@/lib/utils";
import { RecurringDialog, type ProjectChoice } from "./recurring-dialog";

type Item = Omit<RecurringCard, "nextAt" | "lastFiredAt" | "createdAt" | "updatedAt"> & { nextAt: string; lastFiredAt: string | null; canManage: boolean };

/** Every schedule the viewer can see, each with its rule in words, who it is for, and its next time. */
export function RecurringList({ items, projects, currentUser }: { items: Item[]; projects: ProjectChoice[]; currentUser: Pick<SafeUser, "id" | "role"> }) {
  const t = useT();
  const { lang } = useLang();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [pending, start] = useTransition();

  const act = (run: () => Promise<{ error?: string; message?: string } | null>) =>
    start(async () => {
      const r = await run();
      if (r?.error) toast(r.error, "error");
      else if (r?.message) toast(r.message);
    });

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white">
        <EmptyState icon={Repeat} title={t(dict.recurring.empty)} description={t(dict.recurring.emptyDesc)} />
      </div>
    );
  }

  return (
    <>
      <ul className="overflow-hidden rounded-lg border border-line bg-white">
        {items.map((item, i) => {
          const rule = { recurrence: item.recurrence, minuteOfDay: item.minuteOfDay, weekdays: item.weekdays, dayOfMonth: item.dayOfMonth, month: item.month };
          const personal = !!item.project.personalOwnerId;
          return (
            <li key={item.id} className={cn("flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-paper", i > 0 && "border-t border-line", !item.enabled && "opacity-70")}>
              <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md", item.enabled ? "bg-brand/8 text-brand" : "bg-ink/5 text-ink-soft")}>
                <Repeat className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="truncate text-sm font-bold text-ink">{item.title}</p>
                  <PriorityBadge priority={item.priority} iconOnly />
                  {!item.enabled && <span className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft">{t(dict.recurring.paused)}</span>}
                </div>
                <p className="mt-0.5 text-xs font-medium text-ink">{ruleSummary(rule, lang)}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-ink-soft">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.project.color }} />
                    {personal ? t(dict.recurring.personalSpace) : item.project.name}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    {t(dict.recurring.next)}: {item.enabled ? fmtDateTime(item.nextAt, lang) : t(dict.recurring.paused)}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{item.fireCount > 0 ? fill(t(dict.recurring.fired), { n: String(item.fireCount) }) : t(dict.recurring.never)}</span>
                </p>
                {item.labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {item.labels.map((l) => (
                      <LabelChip key={l.id} name={l.name} color={l.color} small />
                    ))}
                  </div>
                )}
              </div>
              {!personal && (item.assignees.length > 0 ? <AvatarStack people={item.assignees} size="sm" max={3} /> : <GeneralBadge compact />)}
              {item.canManage && (
                <Menu
                  trigger={({ toggle }) => (
                    <Button variant="ghost" size="iconSm" onClick={toggle} aria-label={`${t(dict.common.actions)}: ${item.title}`} loading={pending}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem icon={Pencil} onClick={() => { close(); setEditing(item); }}>
                        {t(dict.common.edit)}
                      </MenuItem>
                      <MenuItem icon={Zap} onClick={() => { close(); act(() => runRecurringNowAction(item.id)); }}>
                        {t(dict.recurring.runNow)}
                      </MenuItem>
                      <MenuItem icon={item.enabled ? Pause : Play} onClick={() => { close(); act(() => setRecurringEnabledAction(item.id, !item.enabled)); }}>
                        {item.enabled ? t(dict.recurring.pause) : t(dict.recurring.resume)}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={Trash2} danger onClick={() => { close(); setDeleting(item); }}>
                        {t(dict.common.delete)}
                      </MenuItem>
                    </>
                  )}
                </Menu>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <RecurringDialog
          open
          onClose={() => setEditing(null)}
          projects={projects.filter((p) => p.id === editing.project.id)}
          currentUser={currentUser}
          initial={{
            id: editing.id,
            projectId: editing.project.id,
            title: editing.title,
            description: editing.description,
            priority: editing.priority,
            assigneeIds: editing.assigneeIds,
            labelIds: editing.labelIds,
            recurrence: editing.recurrence,
            minuteOfDay: editing.minuteOfDay,
            weekdays: editing.weekdays,
            dayOfMonth: editing.dayOfMonth,
            month: editing.month,
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target) act(() => deleteRecurringTaskAction(target.id));
        }}
        title={t(dict.common.delete)}
        description={t(dict.recurring.deleteConfirm)}
        confirmLabel={t(dict.common.delete)}
        loading={pending}
      />
    </>
  );
}
