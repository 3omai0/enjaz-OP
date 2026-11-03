"use client";

import { Check } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { useLang, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export function LanguageCard() {
  const t = useT();
  const { lang, setLang, pending } = useLang();
  const options = [
    { value: "ar" as const, label: t(dict.common.arabic), native: "العربية" },
    { value: "en" as const, label: t(dict.common.english), native: "English" },
  ];

  return (
    <Card>
      <CardHeader title={t(dict.settings.language)} description={t(dict.settings.languageDesc)} />
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => {
          const active = lang === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setLang(o.value)}
              disabled={pending}
              aria-pressed={active}
              className={cn("flex items-center justify-between rounded-lg border px-4 py-3 text-start transition-colors", active ? "border-brand bg-brand/6" : "border-line bg-white hover:border-brand/40")}
            >
              <span>
                <span className={cn("block text-sm font-bold", active ? "text-brand" : "text-ink", o.value === "en" && "font-grotesk")}>{o.native}</span>
                <span className="block text-[11px] font-bold text-ink-soft">{o.label}</span>
              </span>
              {active && <Check className="h-4 w-4 text-brand" strokeWidth={3} />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
