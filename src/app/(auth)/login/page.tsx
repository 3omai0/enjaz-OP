import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";
import { countUsers } from "@/lib/queries/users";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t(dict.auth.signIn) };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await countUsers()) === 0) redirect("/setup");
  const { next } = await searchParams;
  const { t } = await getT();

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight text-ink">{t(dict.auth.loginTitle)}</h1>
      <p className="mt-1.5 text-sm font-medium text-ink-soft">{t(dict.auth.loginSubtitle)}</p>
      <div className="mt-8">
        <LoginForm next={next ?? ""} />
      </div>
    </div>
  );
}
