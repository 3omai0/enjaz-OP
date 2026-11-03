export type Lang = "ar" | "en";

/** A localized value: every UI string lives as an {ar, en} pair. */
export type Pair<T = string> = { ar: T; en: T };

export const LANGS: Lang[] = ["ar", "en"];
export const DEFAULT_LANG: Lang = "ar";
export const LANG_COOKIE = "injaz_lang";

export const isLang = (v: unknown): v is Lang => v === "ar" || v === "en";
export const dirOf = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");
export const pick = <T>(pair: Pair<T>, lang: Lang): T => pair[lang];

/** BCP 47 tags used for date and number formatting (Gregorian, Latin digits). */
export const localeOf = (lang: Lang) => (lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB");

/** Replace {name} placeholders in a template; unknown placeholders are left as they are. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * Plural forms follow CLDR categories. Arabic uses all six (zero, one, two,
 * few for 3 to 10, many for 11 to 99, other), English only one and other.
 * "{n}" is replaced with the number.
 */
export type PluralForms = { zero?: string; one: string; two?: string; few?: string; many?: string; other: string };

const pluralRules: Partial<Record<Lang, Intl.PluralRules>> = {};

export function plural(lang: Lang, n: number, forms: Pair<PluralForms>): string {
  const rules = (pluralRules[lang] ??= new Intl.PluralRules(lang === "ar" ? "ar" : "en"));
  const category = rules.select(n) as keyof PluralForms;
  const set = forms[lang];
  return fill(set[category] ?? set.other, { n });
}
