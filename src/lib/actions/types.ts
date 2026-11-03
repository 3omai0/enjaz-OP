import { clip } from "@/lib/utils";

/** Shape returned by every form action used with useActionState. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Optional id of a created entity, for follow-up navigation. */
  id?: string;
} | null;

export const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
/** Optional text field: trimmed, capped at `max` characters (never splitting an emoji), empty becomes null. */
export const optStr = (fd: FormData, key: string, max = 2000) => {
  const v = clip(str(fd, key), max).trim();
  return v.length ? v : null;
};

const ORIGIN = "http://injaz.invalid";

/**
 * A same-site path, or the fallback. Browsers treat "\" like "/", so
 * "/\evil.example" would leave the site; resolving the value against a fixed
 * origin catches every such trick. API routes are never a destination.
 */
export function safePath(value: string | null | undefined, fallback: string) {
  if (!value || value.length > 1024) return fallback;
  if (!value.startsWith("/") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, ORIGIN);
    // Dot segments can turn "/.//evil.example" into "//evil.example", which browsers treat as another site.
    if (url.origin !== ORIGIN || url.pathname.startsWith("//") || url.pathname.startsWith("/api/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Where to go after signing in: a same-site page other than the login page itself. */
export function safeNext(value: string | null | undefined, fallback = "/dashboard") {
  const path = safePath(value, fallback);
  return path.split("?")[0] === "/login" ? fallback : path;
}
