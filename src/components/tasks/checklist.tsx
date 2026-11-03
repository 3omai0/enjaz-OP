"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import type { ChecklistItem } from "@/db/schema";
import { addChecklistItemAction, deleteChecklistItemAction, toggleChecklistItemAction } from "@/lib/actions/tasks";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn, percent } from "@/lib/utils";

export function Checklist({ taskId, items, canEdit, canToggle }: { taskId: string; items: ChecklistItem[]; canEdit: boolean; canToggle: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();

  // Ticks show at once; fresh items from the server replace the guesses.
  const snapshot = items.map((i) => `${i.id}:${i.done ? 1 : 0}`).join(",");
  const [seen, setSeen] = useState(snapshot);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  if (seen !== snapshot) {
    setSeen(snapshot);
    setTicked({});
  }
  const isDone = (item: ChecklistItem) => ticked[item.id] ?? item.done;
  const done = items.filter(isDone).length;

  const run = (fn: () => Promise<{ error?: string } | null>, onError?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r?.error) {
        toast(r.error, "error");
        onError?.();
      }
    });

  const toggle = (item: ChecklistItem) => {
    const next = !isDone(item);
    setTicked((m) => ({ ...m, [item.id]: next }));
    run(
      () => toggleChecklistItemAction(item.id, next),
      () =>
        setTicked((m) => {
          const rest = { ...m };
          delete rest[item.id];
          return rest;
        })
    );
  };

  return (
    <Card>
      <CardHeader
        title={t(dict.task.checklist)}
        description={items.length === 0 ? t(dict.task.subtasksHint) : undefined}
        action={
          items.length > 0 ? (
            <span className="font-grotesk text-xs font-bold text-ink-soft" dir="ltr">
              {done}/{items.length}
            </span>
          ) : undefined
        }
      />
      {items.length > 0 && <ProgressBar value={percent(done, items.length)} tone="bg-success" className="mb-4" />}
      <ul className="space-y-1">
        {items.map((item) => {
          const checked = isDone(item);
          return (
            <li key={item.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-paper">
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={item.title}
                disabled={!canToggle}
                onClick={() => toggle(item)}
                className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-default", checked ? "border-success bg-success text-white" : "border-line bg-white hover:border-brand")}
              >
                {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </button>
              <span dir="auto" className={cn("flex-1 text-sm font-medium", checked ? "text-ink-soft line-through" : "text-ink")}>
                {item.title}
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => run(() => deleteChecklistItemAction(item.id))}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-ink-soft opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`${t(dict.common.delete)}: ${item.title}`}
                  disabled={pending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            const value = title;
            setTitle("");
            run(
              () => addChecklistItemAction(taskId, value),
              () => setTitle(value)
            );
          }}
          className={cn("flex items-center gap-2", items.length > 0 && "mt-3")}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={t(dict.task.checklistPlaceholder)} className="field h-9 min-h-0 flex-1 bg-white py-0 text-sm" aria-label={t(dict.task.checklist)} />
          <button type="submit" disabled={!title.trim() || pending} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-soft transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50" aria-label={t(dict.common.add)}>
            <Plus className="h-4 w-4" />
          </button>
        </form>
      )}
    </Card>
  );
}
