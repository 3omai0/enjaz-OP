import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { Card, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { listProjectActivity } from "@/lib/queries/activity";
import { loadProject } from "@/lib/queries/access";

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const project = await loadProject(user, id);
  if (!project) notFound();
  const { t } = await getT();
  const items = await listProjectActivity(user, project, 120);

  return (
    <Card>
      <CardHeader title={t(dict.project.activityTitle)} description={t(dict.project.activityDesc)} />
      <ActivityFeed items={items} />
    </Card>
  );
}
