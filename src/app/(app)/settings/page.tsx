import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClaudeCard } from "@/components/settings/claude-card";
import { LanguageCard } from "@/components/settings/language-card";
import { NotificationsCard } from "@/components/settings/notifications-card";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { RoleBadge } from "@/components/ui/badge";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { fmtDate, fmtRelative } from "@/lib/format";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { mcpUrl, originFromHeaders } from "@/lib/mcp/oauth";
import { listMcpConnections } from "@/lib/queries/connections";
import { countPushDevices } from "@/lib/queries/users";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.nav.settings) };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const { t, lang } = await getT();
  const [devices, connections, requestHeaders] = await Promise.all([countPushDevices(user.id), listMcpConnections(user.id), headers()]);

  return (
    <div>
      <PageHeader title={t(dict.settings.title)} description={t(dict.settings.subtitle)} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <NotificationsCard devices={devices} isAdmin={user.role === "admin"} />
          <ProfileForm user={{ name: user.name, jobTitle: user.jobTitle, department: user.department, phone: user.phone, email: user.email }} />
          <PasswordForm />
        </div>
        <div className="space-y-6">
          <LanguageCard />
          <ClaudeCard
            url={mcpUrl(originFromHeaders(requestHeaders))}
            connections={connections.map((c) => ({ id: c.id, name: c.name, connectedOn: fmtDate(c.createdAt, lang), lastUsed: c.lastUsedAt ? fmtRelative(c.lastUsedAt, lang) : null }))}
          />
          <Card>
            <CardHeader title={t(dict.settings.account)} />
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-ink-soft">{t(dict.settings.roleLabel)}</dt>
                <dd>
                  <RoleBadge role={user.role} />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-ink-soft">{t(dict.common.email)}</dt>
                <dd className="font-grotesk font-bold text-ink" dir="ltr">
                  {user.email}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="font-bold text-ink-soft">{t(dict.settings.memberSince)}</dt>
                <dd className="font-bold text-ink">{fmtDate(user.createdAt, lang)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
