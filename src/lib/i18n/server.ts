import { cookies } from "next/headers";
import { actingUser } from "@/lib/auth/acting";
import { DEFAULT_LANG, isLang, LANG_COOKIE, plural, type Lang, type Pair, type PluralForms } from "./index";

/** Language for the current request: the preference cookie, or the account's language for calls from Claude. */
export async function getLang(): Promise<Lang> {
  const acting = actingUser();
  if (acting) return isLang(acting.locale) ? acting.locale : DEFAULT_LANG;
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : DEFAULT_LANG;
}

/** Server-side translator: `const { t, tp, lang } = await getT();` */
export async function getT() {
  const lang = await getLang();
  const t = <T>(pair: Pair<T>): T => pair[lang];
  /** Count with the noun in the right grammatical form: tp(dict.plurals.tasks, 3). */
  const tp = (forms: Pair<PluralForms>, n: number) => plural(lang, n, forms);
  return { t, tp, lang };
}
