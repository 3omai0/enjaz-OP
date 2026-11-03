"use client";

import { ChevronDown, Search, Users, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { fill } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

export type PickerPerson = {
  id: string;
  name: string;
  /** Job title or similar, shown to tell people apart. */
  hint?: string | null;
  /** Listed in a second group, e.g. people not in the project yet. */
  outside?: boolean;
};

/**
 * A choice listed above the people:
 * "none"  nobody in particular, e.g. a general task for the whole project;
 * "every" everyone listed at once, e.g. the whole team.
 */
export type PickerAllOption = { kind: "none" | "every"; label: string };

/** Case and accent insensitive match that also ignores Arabic diacritics (U+064B to U+065F, U+0670) and alef forms. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");

const chipClass = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-paper py-0.5 pe-1 ps-0.5 text-xs font-semibold text-ink";
const removeClass = "flex h-5 w-5 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/10 hover:text-ink";

/**
 * Pick any number of people. The chosen ones show as chips; "Choose" opens a
 * searchable list with a checkbox per person, under an optional first row for
 * "nobody in particular" or "everyone". With `name` set, every chosen id is
 * posted with the surrounding form. `canToggle` locks people the viewer may
 * not add or remove (they stay listed so nothing changes silently).
 */
export function PeoplePicker({
  people,
  value,
  onChange,
  name,
  currentUserId,
  emptyLabel,
  outsideLabel,
  canToggle = () => true,
  allOption,
  disabled = false,
  defaultOpen = false,
  inputId,
}: {
  people: PickerPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  name?: string;
  currentUserId?: string;
  emptyLabel: string;
  outsideLabel?: string;
  canToggle?: (id: string) => boolean;
  allOption?: PickerAllOption;
  disabled?: boolean;
  /** Start with the list open (when picking is the only thing on screen). */
  defaultOpen?: boolean;
  inputId?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const chosen = value.map((id) => byId.get(id) ?? { id, name: "…" });
  const label = (p: PickerPerson) => (p.id === currentUserId ? `${p.name} (${t(dict.common.me)})` : p.name);
  const toggle = (id: string) => {
    if (disabled || !canToggle(id)) return;
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  const needle = fold(query.trim());
  const matches = needle ? people.filter((p) => fold(`${p.name} ${p.hint ?? ""}`).includes(needle)) : people;
  const inside = matches.filter((p) => !p.outside);
  const outside = matches.filter((p) => p.outside);

  // The first row. Locked people always stay as they are.
  const toggleable = people.filter((p) => canToggle(p.id));
  const locked = value.filter((id) => !canToggle(id));
  const allOn = allOption?.kind === "none" ? value.length === 0 : toggleable.length > 0 && toggleable.every((p) => value.includes(p.id));
  const allLocked = disabled || (allOption?.kind === "none" ? locked.length > 0 : toggleable.length === 0);
  const pickAll = () => {
    if (!allOption || allLocked) return;
    if (allOption.kind === "none") onChange(locked);
    else onChange(allOn ? locked : [...new Set([...value, ...toggleable.map((p) => p.id)])]);
  };
  // Everyone picked: one summary chip instead of a long row of names.
  const everyone = allOption?.kind === "every" && toggleable.length > 1 && allOn;

  const chip = (p: PickerPerson) => (
    <span key={p.id} className={chipClass}>
      <Avatar name={p.name} size="xs" />
      <span className="truncate">{label(p)}</span>
      {canToggle(p.id) && !disabled ? (
        <button type="button" onClick={() => toggle(p.id)} className={removeClass} aria-label={fill(t(dict.picker.remove), { name: p.name })}>
          <X className="h-3 w-3" />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );

  const option = (p: PickerPerson) => {
    const on = value.includes(p.id);
    const fixed = !canToggle(p.id);
    return (
      <li key={p.id}>
        <label className={cn("flex items-center gap-2.5 rounded px-2 py-1.5 text-sm", fixed ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-paper")}>
          <input type="checkbox" checked={on} disabled={fixed || disabled} onChange={() => toggle(p.id)} className="h-4 w-4 shrink-0 accent-brand" />
          <Avatar name={p.name} size="xs" />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">{label(p)}</span>
          {/* Job titles only where there is room, so names are never cut short. */}
          {p.hint && <span className="hidden max-w-[45%] truncate text-[11px] font-medium text-ink-soft @sm:inline">{p.hint}</span>}
        </label>
      </li>
    );
  };

  let summary: React.ReactNode;
  if (everyone && allOption) {
    summary = (
      <>
        <span className={cn(chipClass, "border-brand/25 bg-brand/8 ps-2 text-brand")}>
          <Users className="h-3.5 w-3.5" />
          <span className="truncate">
            {allOption.label} ({toggleable.length})
          </span>
          {!disabled && (
            <button type="button" onClick={pickAll} className={removeClass} aria-label={fill(t(dict.picker.remove), { name: allOption.label })}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
        {chosen.filter((p) => !canToggle(p.id)).map(chip)}
      </>
    );
  } else if (chosen.length > 0) {
    summary = chosen.map(chip);
  } else if (allOption?.kind === "none") {
    summary = (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 px-2.5 py-1 text-xs font-semibold text-brand">
        <Users className="h-3.5 w-3.5" />
        {allOption.label}
      </span>
    );
  } else {
    summary = <span className="px-1.5 text-sm font-medium text-ink-soft">{emptyLabel}</span>;
  }

  return (
    <div className={cn("@container rounded-md border border-line bg-white", disabled && "opacity-60")}>
      {name && value.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5">
        {summary}
        {!disabled && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={listId}
            className="ms-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-brand transition-colors hover:bg-brand/8"
          >
            {open ? t(dict.picker.done) : t(dict.picker.add)}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div id={listId} className="border-t border-line">
          <div className="relative p-1.5">
            <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto h-3.5 w-3.5 text-ink-soft" />
            <input
              ref={searchRef}
              id={inputId}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Closes the list only, not the dialog around it.
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "Enter") {
                  // Enter picks the only match instead of submitting the form.
                  e.preventDefault();
                  const only = matches.filter((p) => canToggle(p.id));
                  if (only.length === 1) {
                    toggle(only[0].id);
                    setQuery("");
                  }
                }
              }}
              placeholder={t(dict.picker.search)}
              aria-label={t(dict.picker.search)}
              className="field h-8 min-h-0 bg-paper ps-8 text-sm focus:bg-white"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto px-1 pb-1">
            {allOption && !needle && (
              <li className="mb-1 border-b border-line pb-1">
                <label className={cn("flex items-center gap-2.5 rounded px-2 py-1.5 text-sm", allLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-paper")}>
                  {/* "Nobody in particular" is one choice among others (a radio); "everyone" can be ticked and unticked. */}
                  <input type={allOption.kind === "none" ? "radio" : "checkbox"} checked={allOn} disabled={allLocked} onChange={pickAll} className="h-4 w-4 shrink-0 accent-brand" />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <Users className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{allOption.label}</span>
                </label>
              </li>
            )}
            {inside.map(option)}
            {outside.length > 0 && outsideLabel && <li className="px-2 pb-1 pt-2 text-[11px] font-semibold text-ink-soft">{outsideLabel}</li>}
            {outside.map(option)}
            {matches.length === 0 && <li className="px-2 py-3 text-center text-xs font-medium text-ink-soft">{t(dict.picker.noMatch)}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
