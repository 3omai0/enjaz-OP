import { Check } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { LangToggle } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { getT } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const points = t(dict.auth.panelPoints);

  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden bg-brand-dark p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <Wordmark light href="/login" />

        <div className="max-w-md">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/50">{t(dict.app.company)}</p>
          <h1 className="text-3xl font-bold leading-snug xl:text-4xl">{t(dict.auth.panelTitle)}</h1>
          <p className="mt-4 text-base font-medium leading-relaxed text-white/65">{t(dict.auth.panelDesc)}</p>
          <ul className="mt-8 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-sm font-medium text-white/85">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-brand text-white">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs font-medium text-white/40">© 2026 {t(dict.app.company)}</p>
      </aside>

      <main className="flex flex-col bg-white p-6 md:p-10">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Wordmark href="/login" />
          </div>
          <div className="ms-auto">
            <LangToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
