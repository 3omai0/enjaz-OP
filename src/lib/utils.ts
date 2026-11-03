import { twMerge } from "tailwind-merge";

/**
 * Join class names, skipping falsy values. Conflicting Tailwind utilities are
 * resolved so the last one wins, which lets callers override a component's
 * defaults (for example a width) without both classes fighting in CSS order.
 */
export function cn(...parts: Array<string | false | null | undefined>) {
  return twMerge(parts.filter(Boolean).join(" "));
}

/** Up to two initials from a name, works for Arabic and Latin names. */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const chars = (w: string) => Array.from(w);
  if (words.length === 1) return chars(words[0]).slice(0, 2).join("");
  return `${chars(words[0])[0]}${chars(words[words.length - 1])[0]}`;
}

/** First name for greetings; keeps Arabic compound names such as "عبد الله" or "أبو بكر" together. */
export function firstName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^(عبد|أبو|ابو|أبي|ابي)$/.test(words[0])) return `${words[0]} ${words[1]}`;
  return words[0] ?? name;
}

/** Human readable task reference, e.g. SND-12. */
export const taskKey = (projectKey: string, number: number) => `${projectKey}-${number}`;

/** Latin letter used for each Arabic letter when building a project key. */
const ARABIC_TO_LATIN: Record<string, string> = {
  ا: "A", أ: "A", إ: "A", آ: "A", ء: "A", ع: "A", ى: "A",
  ب: "B", ت: "T", ث: "S", ج: "J", ح: "H", خ: "K", د: "D", ذ: "Z",
  ر: "R", ز: "Z", س: "S", ش: "S", ص: "S", ض: "D", ط: "T", ظ: "Z",
  غ: "G", ف: "F", ق: "Q", ك: "K", ل: "L", م: "M", ن: "N", ه: "H",
  ة: "H", و: "W", ؤ: "W", ي: "Y", ئ: "Y",
};

/** Small words that should not contribute a letter to a key. */
const ARABIC_STOPWORDS = new Set(["و", "في", "من", "على", "إلى", "الى", "عن", "مع"]);

/** Drop the definite article and attached prepositions so "العجوة" gives "ع". */
function arabicStem(word: string) {
  return word.replace(/^(وال|بال|كال|فال|لل|ال)/, "") || word;
}

function transliterate(text: string) {
  return [...text].map((ch) => ARABIC_TO_LATIN[ch] ?? "").join("");
}

/**
 * Derive a short uppercase project key from a name.
 * "Orders Platform" gives "OP", "قلعة العجوة" gives "QA", "متجر" gives "MTJ".
 * Returns "PRJ" only when nothing usable is found.
 */
export function suggestProjectKey(name: string) {
  const latinWords = name
    .split(/[^A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  let key = "";
  if (latinWords.length >= 2) key = latinWords.map((w) => w[0]).join("");
  else if (latinWords.length === 1) key = latinWords[0].slice(0, 4);

  if (key.length < 2) {
    const arabicWords = name
      .split(/\s+/)
      .map((w) => w.replace(/[^ء-ي]/g, ""))
      .filter((w) => w && !ARABIC_STOPWORDS.has(w))
      .map(arabicStem);
    if (arabicWords.length >= 2) key = arabicWords.slice(0, 4).map((w) => transliterate(w[0])).join("");
    else if (arabicWords.length === 1) key = transliterate(arabicWords[0]).slice(0, 3);
  }

  key = key.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return key.length >= 2 ? key : "PRJ";
}

/** Half of a surrogate pair (emoji and other astral characters): not valid Unicode on its own. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Replace stray halves of emoji with U+FFFD. Postgres rejects them in jsonb and
 * Neon's HTTP driver rejects them in any parameter, so nothing reaches the
 * database with one.
 */
export const wellFormed = (text: string) => text.replace(LONE_SURROGATE, "�");

/**
 * Text cut to at most `max` characters for storage. It counts code points, so
 * an emoji is never split in half (String.slice counts UTF-16 units and can
 * leave half of one), and it repairs any stray half already in the input.
 */
export function clip(text: string, max: number) {
  const clean = wellFormed(text);
  // Fewer UTF-16 units than the limit means fewer code points too.
  if (clean.length <= max) return clean;
  return Array.from(clean).slice(0, max).join("");
}

export function clampText(text: string, max: number) {
  return Array.from(text).length > max ? `${clip(text, max - 1).trimEnd()}…` : text;
}

export function percent(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed UUID, so bad ids become a 404 instead of a database error. */
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);
