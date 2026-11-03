"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/card";
import { TimeAgo } from "@/components/ui/time-ago";
import type { TaskStatus } from "@/db/schema";
import { markReadAction } from "@/lib/actions/notifications";
import { TASK_STATUS_META } from "@/lib/constants";
import type { Pair } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { fillNodes } from "@/lib/i18n/render";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; name: string } | null;
};

const TEMPLATES = dict.notifications.types as Record<string, Pair>;

/** Only same-site paths are followed. */
const isInternal = (href: string | null): href is string => !!href && href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");

export function NotificationList({ items }: { items: Item[] }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-white">
        <EmptyState icon={Bell} title={t(dict.notifications.empty)} description={t(dict.notifications.emptyDesc)} />
      </div>
    );
  }

  const open = (item: Item) =>
    start(async () => {
      if (!item.readAt) await markReadAction(item.id);
      if (isInternal(item.href)) router.push(item.href);
    });

  return (
    <ul className={cn("divide-y divide-line overflow-hidden rounded-lg border border-line bg-white", pending && "opacity-80")}>
      {items.map((item) => {
        const p = item.payload as Record<string, string | undefined>;
        const status = p.to as TaskStatus | undefined;
        const task = p.taskKey ? `${p.taskKey} ${p.taskTitle ?? ""}`.trim() : "";
        const sentence = fillNodes(t(TEMPLATES[item.type] ?? dict.notifications.fallback), {
          task: <bdi className="font-bold text-ink">{task}</bdi>,
          project: <bdi className="font-bold text-ink">{p.projectName ?? ""}</bdi>,
          status: status && TASK_STATUS_META[status] ? <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", TASK_STATUS_META[status].chip)}>{t(TASK_STATUS_META[status].label)}</span> : null,
        });
        return (
          <li key={item.id}>
            <button type="button" onClick={() => open(item)} className={cn("flex w-full items-start gap-3 px-5 py-4 text-start transition-colors hover:bg-paper", !item.readAt && "bg-brand/[0.035]")}>
              <Avatar name={item.actor?.name ?? "?"} id={item.actor?.id} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-relaxed text-ink-soft">{sentence}</p>
                {p.excerpt && (
                  <p dir="auto" className="mt-1 truncate text-start text-xs font-medium text-ink-soft/80">
                    “{p.excerpt}”
                  </p>
                )}
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-medium text-ink-soft/80">
                  <bdi className="font-semibold text-ink-soft">{item.actor?.name ?? t(dict.team.formerMember)}</bdi>
                  <span aria-hidden>·</span>
                  <TimeAgo date={item.createdAt} />
                </p>
              </div>
              {!item.readAt && (
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" role="img" aria-label={t(dict.notifications.unread)} />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
