import type { Metadata } from "next";
import { NewRecurringButton, type ProjectChoice } from "@/components/recurring/recurring-dialog";
import { RecurringList } from "@/components/recurring/recurring-list";
import { PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { canAssignOthers } from "@/lib/permissions";
import { getPersonalProject } from "@/lib/queries/personal";
import { getAssigneeOptions, getProjectLabels, listProjectsForUser } from "@/lib/queries/projects";
import { listRecurringForUser } from "@/lib/queries/recurring";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.recurring.title) };
}

/**
 * Every recurring task the person can see, across their projects and their
 * personal space, with a dialog to add one anywhere they may.
 */
export default async function RecurringPage() {
  const user = await requireUser();
  const { t } = await getT();
  const currentUser = { id: user.id, role: user.role };
  const [items, projects, personal] = await Promise.all([listRecurringForUser(user), listProjectsForUser(user), getPersonalProject(user.id, user.locale)]);

  // Projects the person may add schedules to: their personal space, then team projects they run or manage.
  const manageable = projects.filter((p) => canAssignOthers(user) || p.owner.id === user.id);
  const choices: ProjectChoice[] = [
    { id: personal.id, name: t(dict.recurring.personalSpace), color: "#8554eb", personal: true, members: [], labels: (await getProjectLabels(personal.id)).map((l) => ({ id: l.id, name: l.name, color: l.color })) },
    ...(await Promise.all(
      manageable.map(async (p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        members: (await getAssigneeOptions(user, p.id)).filter((m) => !m.outside),
        labels: (await getProjectLabels(p.id)).map((l) => ({ id: l.id, name: l.name, color: l.color })),
      }))
    )),
  ];
  const manageableIds = new Set(choices.map((c) => c.id));

  return (
    <div>
      <PageHeader title={t(dict.recurring.title)} description={t(dict.recurring.subtitle)} actions={<NewRecurringButton projects={choices} currentUser={currentUser} />} />
      <RecurringList
        items={items.map((r) => ({ ...r, nextAt: r.nextAt.toISOString(), lastFiredAt: r.lastFiredAt?.toISOString() ?? null, canManage: manageableIds.has(r.project.id) }))}
        projects={choices}
        currentUser={currentUser}
      />
      <p className="mt-6 text-xs font-medium text-ink-soft/80">{t(dict.recurring.howItWorks)}</p>
    </div>
  );
}
