"use client";

import { BellOff, BellRing, FolderInput, KeyRound, MessageSquareText, MoreHorizontal, Pencil, Search, Trash2, UserCheck, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { TimeAgo } from "@/components/ui/time-ago";
import { useToast } from "@/components/ui/toast";
import type { UserRole } from "@/db/schema";
import { deleteEmployeeAction, resetEmployeePasswordAction, setEmployeeActiveAction } from "@/lib/actions/team";
import type { ActionState } from "@/lib/actions/types";
import { fill } from "@/lib/i18n";
import { usePlural, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";
import { EmployeeDialog, type EmployeeValues } from "./employee-dialog";
import { RoleWithPermissions } from "./role-permissions";

export type Person = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  /** Null for viewers who may not see other people's workload. */
  openTasks: number | null;
  projectCount: number | null;
  /** Devices that receive the person's notifications; null like the workload numbers. */
  pushDevices: number | null;
};

export function TeamTable({ people, canManage, showWorkload, currentUserId }: { people: Person[]; canManage: boolean; showWorkload: boolean; currentUserId: string }) {
  const t = useT();
  const tp = usePlural();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<EmployeeValues | null>(null);
  const [resetting, setResetting] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [pending, start] = useTransition();

  const filtered = people.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.email.toLowerCase().includes(q.toLowerCase()));

  const setActive = (id: string, active: boolean) =>
    start(async () => {
      const r = await setEmployeeActiveAction(id, active);
      if (r?.error) toast(r.error, "error");
      else toast(r?.message ?? t(dict.common.changesSaved));
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-ink-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(dict.team.searchPlaceholder)} className="field h-9 min-h-0 bg-white ps-9" aria-label={t(dict.common.search)} />
        </div>
        <p className="text-sm font-medium text-ink-soft">{tp(dict.plurals.members, people.length)}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-white">
          <EmptyState icon={Users} title={people.length === 0 ? t(dict.team.empty) : t(dict.common.noResults)} description={people.length === 0 ? t(dict.team.emptyDesc) : undefined} />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          {/* relative: hidden labels (sr-only) are clipped here instead of widening the page on phones. */}
          <div className="relative overflow-x-auto">
            <table className={cn("w-full text-sm", showWorkload ? "min-w-[900px]" : "min-w-[640px]")}>
              <thead>
                <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-3 text-start font-bold">{t(dict.common.name)}</th>
                  <th className="px-3 py-3 text-start font-bold">{t(dict.team.role)}</th>
                  <th className="px-3 py-3 text-start font-bold">{t(dict.team.jobTitle)}</th>
                  {showWorkload && <th className="px-3 py-3 text-start font-bold">{t(dict.team.openTasks)}</th>}
                  {showWorkload && <th className="px-3 py-3 text-start font-bold">{t(dict.team.projects)}</th>}
                  <th className="px-3 py-3 text-start font-bold">{t(dict.team.lastLogin)}</th>
                  {showWorkload && <th className="px-3 py-3 text-start font-bold">{t(dict.team.push)}</th>}
                  <th className="px-3 py-3 text-start font-bold">{t(dict.common.status)}</th>
                  {canManage && (
                    <th className="px-3 py-3">
                      <span className="sr-only">{t(dict.common.actions)}</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((p) => (
                  <tr key={p.id} className={cn("transition-colors hover:bg-paper", !p.isActive && "opacity-60")}>
                    <td className="px-5 py-3">
                      <Link href={`/team/${p.id}`} className="flex items-center gap-3">
                        <Avatar id={p.id} name={p.name} />
                        <div className="min-w-0">
                          <p className="truncate font-bold text-ink hover:text-brand">
                            {p.name}
                            {p.id === currentUserId && <span className="ms-1.5 text-xs font-bold text-ink-soft">({t(dict.common.you)})</span>}
                          </p>
                          <p className="truncate font-grotesk text-xs text-ink-soft">
                            <span dir="ltr">{p.email}</span>
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{canManage ? <RoleWithPermissions role={p.role} /> : <RoleBadge role={p.role} />}</td>
                    <td className="px-3 py-3 text-xs font-bold text-ink-soft">{[p.jobTitle, p.department].filter(Boolean).join(" · ") || "…"}</td>
                    {showWorkload && (
                      <td className="px-3 py-3 text-start font-grotesk font-bold text-ink">
                        <span dir="ltr">{p.openTasks ?? 0}</span>
                      </td>
                    )}
                    {showWorkload && (
                      <td className="px-3 py-3 text-start font-grotesk font-bold text-ink">
                        <span dir="ltr">{p.projectCount ?? 0}</span>
                      </td>
                    )}
                    <td className="px-3 py-3 text-xs font-bold text-ink-soft">{p.lastLoginAt ? <TimeAgo date={p.lastLoginAt} /> : t(dict.team.never)}</td>
                    {showWorkload && (
                      <td className="px-3 py-3">
                        {p.pushDevices ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success" title={tp(dict.plurals.devices, p.pushDevices)}>
                            <BellRing className="h-3.5 w-3.5" />
                            {t(dict.team.pushOn)}
                            <span className="font-grotesk text-ink-soft" dir="ltr">
                              ({p.pushDevices})
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft">
                            <BellOff className="h-3.5 w-3.5" />
                            {t(dict.team.pushOff)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-bold", p.isActive ? "bg-success/10 text-success" : "bg-ink/5 text-ink-soft")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", p.isActive ? "bg-success" : "bg-ink-soft/50")} />
                        {p.isActive ? t(dict.team.active) : t(dict.team.inactive)}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3 py-3 text-end">
                        <Menu
                          trigger={({ toggle }) => (
                            <Button variant="ghost" size="iconSm" onClick={toggle} aria-label={`${t(dict.common.actions)}: ${p.name}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem
                                icon={Pencil}
                                onClick={() => {
                                  close();
                                  setEditing({ id: p.id, name: p.name, email: p.email, role: p.role, jobTitle: p.jobTitle, department: p.department, phone: p.phone });
                                }}
                              >
                                {t(dict.common.edit)}
                              </MenuItem>
                              <MenuItem
                                icon={KeyRound}
                                onClick={() => {
                                  close();
                                  setResetting(p);
                                }}
                              >
                                {t(dict.team.resetPassword)}
                              </MenuItem>
                              <MenuSeparator />
                              {p.isActive ? (
                                <MenuItem
                                  icon={UserX}
                                  danger
                                  disabled={p.id === currentUserId || pending}
                                  onClick={() => {
                                    close();
                                    setActive(p.id, false);
                                  }}
                                >
                                  {t(dict.team.deactivate)}
                                </MenuItem>
                              ) : (
                                <MenuItem
                                  icon={UserCheck}
                                  disabled={pending}
                                  onClick={() => {
                                    close();
                                    setActive(p.id, true);
                                  }}
                                >
                                  {t(dict.team.activate)}
                                </MenuItem>
                              )}
                              <MenuItem
                                icon={Trash2}
                                danger
                                disabled={p.id === currentUserId || pending}
                                onClick={() => {
                                  close();
                                  setDeleting(p);
                                }}
                              >
                                {t(dict.team.deletePermanently)}
                              </MenuItem>
                            </>
                          )}
                        </Menu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <EmployeeDialog initial={editing} open onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordDialog person={resetting} onClose={() => setResetting(null)} />}
      {deleting && <DeleteEmployeeDialog person={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function ResetPasswordDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await resetEmployeePasswordAction(prev, fd);
    if (r?.ok) {
      toast(r.message ?? t(dict.team.passwordReset));
      onClose();
    }
    return r;
  }, null);

  return (
    <Dialog open onClose={onClose} title={t(dict.team.resetPassword)} description={`${person.name} · ${t(dict.team.resetHint)}`} size="sm">
      <form action={action} className="space-y-4">
        <input type="hidden" name="userId" value={person.id} />
        <FormError message={state?.error} />
        <Field label={t(dict.team.newPassword)} htmlFor="reset-password" error={state?.fieldErrors?.password} hint={t(dict.common.passwordMin)}>
          <input id="reset-password" name="password" type="text" required minLength={8} dir="ltr" autoComplete="off" className="field font-grotesk" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t(dict.common.cancel)}
          </Button>
          <SubmitButton pendingText={t(dict.common.saving)}>{t(dict.common.save)}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Permanent deletion, confirmed by typing a word. Says plainly what happens to
 * the account, the person's work and the projects they own.
 */
function DeleteEmployeeDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const word = t(dict.team.deleteWord);
  const confirmed = typed.trim().toLowerCase() === word.toLowerCase();

  const remove = () =>
    start(async () => {
      const r = await deleteEmployeeAction(person.id);
      if (r?.error) {
        setError(r.error);
        return;
      }
      toast(r?.message ?? fill(t(dict.team.deleted), { name: person.name }));
      onClose();
    });

  const points = [
    { icon: UserX, text: t(dict.team.deleteAccount) },
    { icon: MessageSquareText, text: t(dict.team.deleteWork) },
    { icon: FolderInput, text: t(dict.team.deleteProjects) },
  ];

  return (
    <Dialog open onClose={onClose} title={fill(t(dict.team.deleteTitle), { name: person.name })} description={t(dict.team.deleteIntro)} size="sm">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed && !pending) remove();
        }}
      >
        <FormError message={error} />
        <ul className="space-y-2.5 rounded-lg border border-danger/20 bg-danger/5 p-3">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-2.5 text-sm font-medium leading-relaxed text-ink">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        {person.isActive && <p className="text-xs font-medium text-ink-soft">{t(dict.team.deleteTip)}</p>}
        <Field label={fill(t(dict.team.deleteConfirm), { word })} htmlFor="delete-confirm">
          <input id="delete-confirm" name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="field" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t(dict.common.cancel)}
          </Button>
          <Button type="submit" variant="danger" disabled={!confirmed} loading={pending}>
            {t(dict.team.deletePermanently)}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
