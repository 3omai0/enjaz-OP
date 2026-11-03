import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SetupForm } from "@/components/auth/setup-form";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { countUsers } from "@/lib/queries/users";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.auth.setupTitle) };
}

export default async function SetupPage() {
  if ((await countUsers()) > 0) redirect("/login");
  const { t } = await getT();

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight text-ink">{t(dict.auth.setupTitle)}</h1>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-soft">{t(dict.auth.setupSubtitle)}</p>
      <div className="mt-8">
        <SetupForm />
      </div>
    </div>
  );
}
