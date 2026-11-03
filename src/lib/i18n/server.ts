import { cookies } from "next/headers";
import { DEFAULT_LANG, isLang, LANG_COOKIE, plural, type Lang, type Pair, type PluralForms } from "./index";

/** Language for the current request, read from the preference cookie. */
export async function getLang(): Promise<Lang> {
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
