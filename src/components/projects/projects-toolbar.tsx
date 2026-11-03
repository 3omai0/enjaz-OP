"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PROJECT_STATUS_META, PROJECT_STATUS_ORDER } from "@/lib/constants";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

export type ProjectsToolbarValues = { q: string; status: string; archived: boolean };

/** Search, status filter and archived toggle. Current values come from the page's searchParams. */
export function ProjectsToolbar({ values }: { values: ProjectsToolbarValues }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(values.q);
  const timer = useRef<number | null>(null);

  const push = (next: Partial<ProjectsToolbarValues>) => {
    const merged = { ...values, q, ...next };
    const sp = new URLSearchParams();
    if (merged.q.trim()) sp.set("q", merged.q.trim());
    if (merged.status && merged.status !== "all") sp.set("status", merged.status);
    if (merged.archived) sp.set("archived", "1");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // Debounced search so typing does not thrash the router.
  useEffect(() => {
    if (q === values.q) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => push({ q }), 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <div className="relative flex-1 md:max-w-sm">
        <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-ink-soft" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t(dict.projects.searchPlaceholder)} className="field h-9 min-h-0 bg-white ps-9" aria-label={t(dict.common.search)} />
      </div>
      <select value={values.status} onChange={(e) => push({ status: e.target.value })} className="field h-9 min-h-0 w-full bg-white md:w-52" aria-label={t(dict.projects.filterStatus)}>
        <option value="all">{t(dict.projects.allStatuses)}</option>
        {PROJECT_STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {t(PROJECT_STATUS_META[s].label)}
          </option>
        ))}
      </select>
      <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border border-line bg-white px-3 text-xs font-medium text-ink-soft">
        <input type="checkbox" checked={values.archived} onChange={(e) => push({ archived: e.target.checked })} className="h-4 w-4 accent-brand" />
        {t(dict.projects.showArchived)}
      </label>
    </div>
  );
}
