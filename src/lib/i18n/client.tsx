"use client";

import { ArrowLeft, ArrowRight, Languages } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { dict } from "./dictionary";
import { plural, type Lang, type Pair, type PluralForms } from "./index";

type Ctx = { lang: Lang; isAr: boolean; setLang: (l: Lang) => void; pending: boolean };

const LangCtx = createContext<Ctx>({ lang: "ar", isAr: true, setLang: () => {}, pending: false });

export const useLang = () => useContext(LangCtx);

/** Pick a localized value: t({ ar: "...", en: "..." }) */
export function useT() {
  const { lang } = useLang();
  return useCallback(<T,>(pair: Pair<T>) => pair[lang], [lang]);
}

/** Count with the noun in the right grammatical form: tp(dict.plurals.tasks, 3). */
export function usePlural() {
  const { lang } = useLang();
  return useCallback((forms: Pair<PluralForms>, n: number) => plural(lang, n, forms), [lang]);
}

/**
 * The language is decided on the server from a cookie so server components
 * and client components render the same strings. Switching posts a small form
 * to /api/lang, which saves the choice and reloads the same page in the new
 * language: the reading direction, fonts and every cached page change together.
 */
export function LanguageProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [pending, setPending] = useState(false);

  // Coming back to this page from the browser's history cache must not leave the switch disabled.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const setLang = useCallback(
    (next: Lang) => {
      if (next === lang) return;
      setPending(true);
      const form = document.createElement("form");
      form.method = "post";
      form.action = "/api/lang";
      for (const [name, value] of [
        ["lang", next],
        ["back", `${window.location.pathname}${window.location.search}`],
      ]) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
    },
    [lang]
  );

  return <LangCtx.Provider value={{ lang, isAr: lang === "ar", setLang, pending }}>{children}</LangCtx.Provider>;
}

/** Direction-aware forward arrow: points the way reading flows. */
export function ArrowFwd({ className = "w-4 h-4" }: { className?: string }) {
  const { isAr } = useLang();
  const Icon = isAr ? ArrowLeft : ArrowRight;
  return <Icon className={className} />;
}

/** Direction-aware back arrow. */
export function ArrowBack({ className = "w-4 h-4" }: { className?: string }) {
  const { isAr } = useLang();
  const Icon = isAr ? ArrowRight : ArrowLeft;
  return <Icon className={className} />;
}

/** Segmented ع / EN switch. `dark` renders on the indigo sidebar. */
export function LangToggle({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  const { lang, setLang, pending } = useLang();
  const t = useT();

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setLang(lang === "ar" ? "en" : "ar")}
        disabled={pending}
        aria-label={t(dict.common.switchLanguage)}
        title={t(dict.common.switchLanguage)}
        className={cn(
          "flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors",
          dark ? "border-white/15 text-white/80 hover:bg-white/10" : "border-line bg-white text-ink hover:bg-paper",
          pending && "opacity-60"
        )}
      >
        <Languages className="h-4 w-4" />
        <span className="font-grotesk">{lang === "ar" ? "EN" : "ع"}</span>
      </button>
    );
  }

  return (
    <div
      className={cn("inline-flex items-center rounded-md border p-0.5", dark ? "border-white/15 bg-white/5" : "border-line bg-paper", pending && "opacity-60")}
      role="group"
      aria-label={t(dict.common.language)}
    >
      {(["ar", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          aria-label={l === "ar" ? t(dict.common.arabic) : t(dict.common.english)}
          disabled={pending}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
            lang === l ? (dark ? "bg-white/15 text-white" : "border border-line bg-white text-ink") : dark ? "text-white/60 hover:text-white" : "text-ink-soft hover:text-ink",
            l === "en" && "font-grotesk"
          )}
        >
          {l === "ar" ? "ع" : "EN"}
        </button>
      ))}
    </div>
  );
}
