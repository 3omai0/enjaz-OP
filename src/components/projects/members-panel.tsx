"use client";

import { Crown, UserMinus, UserPlus, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState } from "@/components/ui/card";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form";
import { PeoplePicker } from "@/components/ui/people-picker";
import { useToast } from "@/components/ui/toast";
import type { UserRole } from "@/db/schema";
import { addMembersAction, removeMemberAction } from "@/lib/actions/projects";
import { usePlural, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

type Member = {
  userId: string;
  role: string;
  /** Null when the viewer may not see other people's workload in this project. */
  openTasks: number | null;
  user: { id: string; name: string; email: string; role: UserRole; jobTitle: string | null; department: string | null; isActive: boolean };
};

type Addable = { id: string; name: string; email: string; jobTitle: string | null; role: UserRole };

export function MembersPanel({ projectId, ownerId, canManage, members, addable }: { projectId: string; ownerId: string; canManage: boolean; members: Member[]; addable: Addable[] }) {
  const t = useT();
  const tp = usePlural();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      if (picked.length === 0) return;
      const r = await addMembersAction(projectId, picked);
      if (r?.error) toast(r.error, "error");
      else {
        toast(r?.message ?? t(dict.project.memberAdded));
        setAddOpen(false);
        setPicked([]);
      }
    });

  const remove = () =>
    start(async () => {
      if (!removing) return;
      const r = await removeMemberAction(projectId, removing.userId);
      if (r?.error) toast(r.error, "error");
      else toast(r?.message ?? t(dict.project.memberRemoved));
      setRemoving(null);
    });

  return (
    <Card padded={false}>
      <CardHeader
        className="mb-0 px-5 pb-0 pt-5"
        title={t(dict.project.membersTitle)}
        description={t(dict.project.membersDesc)}
        action={
          canManage ? (
            <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" />
              {t(dict.project.addMember)}
            </Button>
          ) : undefined
        }
      />
      <div className="mt-4 border-t border-line">
        {members.length === 0 ? (
          <EmptyState icon={Users} title={t(dict.project.noAvailableMembers)} compact />
        ) : (
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar id={m.user.id} name={m.user.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-ink">{m.user.name}</p>
                    {m.userId === ownerId && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-bold text-brand">
                        <Crown className="h-3 w-3" />
                        {t(dict.projects.owner)}
                      </span>
                    )}
                    {!m.user.isActive && <span className="rounded-md bg-ink/5 px-1.5 py-0.5 text-[11px] font-bold text-ink-soft">{t(dict.team.inactive)}</span>}
                  </div>
                  <p className="truncate text-xs font-medium text-ink-soft">
                    {[m.user.jobTitle, m.user.department].filter(Boolean).join(" · ") || (
                      <span dir="ltr" className="font-grotesk">
                        {m.user.email}
                      </span>
                    )}
                  </p>
                </div>
                {m.openTasks !== null && <span className="hidden text-xs font-medium text-ink-soft sm:inline">{tp(dict.plurals.openTasks, m.openTasks)}</span>}
                <RoleBadge role={m.user.role} className="hidden md:inline-flex" />
                {canManage && m.userId !== ownerId && (
                  <Button variant="ghost" size="iconSm" onClick={() => setRemoving(m)} aria-label={`${t(dict.project.removeMember)}: ${m.user.name}`} title={t(dict.project.removeMember)}>
                    <UserMinus className="h-4 w-4 text-danger" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t(dict.project.addMember)}
        description={t(dict.project.addMemberDesc)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              {t(dict.common.cancel)}
            </Button>
            <Button onClick={add} loading={pending} disabled={picked.length === 0}>
              {picked.length > 1 ? `${t(dict.common.add)} (${picked.length})` : t(dict.common.add)}
            </Button>
          </>
        }
      >
        {addable.length === 0 ? (
          <p className="text-sm font-medium text-ink-soft">{t(dict.project.noAvailableMembers)}</p>
        ) : (
          <Field label={t(dict.team.title)}>
            <PeoplePicker people={addable.map((u) => ({ id: u.id, name: u.name, hint: u.jobTitle }))} value={picked} onChange={setPicked} emptyLabel={t(dict.picker.none)} allOption={{ kind: "every", label: t(dict.picker.everyone) }} defaultOpen />
          </Field>
        )}
      </Dialog>

      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} loading={pending} title={t(dict.project.removeMember)} confirmLabel={t(dict.common.remove)}>
        <p className="text-sm font-medium text-ink-soft">{t(dict.project.removeMemberConfirm)}</p>
      </ConfirmDialog>
    </Card>
  );
}
