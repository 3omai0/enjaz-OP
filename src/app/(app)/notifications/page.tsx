import { CheckCheck } from "lucide-react";
import type { Metadata } from "next";
import { NotificationList } from "@/components/notifications/notification-list";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { markAllReadAction } from "@/lib/actions/notifications";
import { requireUser } from "@/lib/auth/session";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { listNotifications } from "@/lib/queries/notifications";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.nav.notifications) };
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const { t } = await getT();
  const items = await listNotifications(user.id);
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div>
      <PageHeader
        title={t(dict.notifications.title)}
        description={t(dict.notifications.subtitle)}
        actions={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary">
                <CheckCheck className="h-4 w-4" />
                {t(dict.notifications.markAllRead)}
              </Button>
            </form>
          ) : undefined
        }
      />
      <NotificationList items={items.map((n) => ({ id: n.id, type: n.type, payload: n.payload, href: n.href, readAt: n.readAt, createdAt: n.createdAt, actor: n.actor }))} />
    </div>
  );
}
