import { inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import webpush, { WebPushError } from "web-push";
import { getDb } from "@/db";
import { pushSubscriptions, type TaskStatus } from "@/db/schema";
import { TASK_STATUS_META } from "@/lib/constants";
import { dirOf, fill, isLang, type Lang, type Pair } from "@/lib/i18n";
import { dict } from "@/lib/i18n/dictionary";
import { clampText } from "@/lib/utils";

/*
 * Device notifications (Web Push). Every in-app notification is also sent to
 * the phones and computers where its recipient turned notifications on. The
 * text is written in the recipient's language and the message is encrypted
 * for that device, so the push service in between cannot read it.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com";

/** How long a push service keeps a message for a device that is switched off. */
const TTL_SECONDS = 2 * 24 * 60 * 60;
const SEND_TIMEOUT_MS = 10_000;

/** Device notifications are available once both VAPID keys are set (see README). */
export const pushEnabled = () => PUBLIC_KEY !== "" && PRIVATE_KEY !== "";

/** The key browsers subscribe with, or null while device notifications are not set up. */
export const pushPublicKey = () => (pushEnabled() ? PUBLIC_KEY : null);

/**
 * Push services of the supported browsers: Chrome, Edge, Samsung Internet
 * and Opera on Android and desktop (Google), Firefox (Mozilla), Safari on
 * iPhone, iPad and Mac (Apple) and Edge on Windows (Microsoft). A subscription
 * may only point at one of them, so the server never posts anywhere else.
 * PUSH_EXTRA_HOSTS adds hosts for local testing only.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const EXTRA_HOSTS = (process.env.PUSH_EXTRA_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function isPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (EXTRA_HOSTS.includes(url.host.toLowerCase())) return true;
  if (url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** What the service worker (public/sw.js) receives. */
export type PushMessage = { title: string; body: string; url: string; tag?: string; badge?: number; lang: Lang; dir: "rtl" | "ltr"; ts: number };

type Target = { id: string; endpoint: string; p256dh: string; auth: string };
type Outcome = "sent" | "gone" | "failed";

const hostOf = (endpoint: string) => {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid endpoint";
  }
};

async function send(target: Target, message: PushMessage): Promise<Outcome> {
  if (!pushEnabled() || !isPushEndpoint(target.endpoint)) return "failed";
  try {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(message), {
      vapidDetails: { subject: SUBJECT, publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY },
      TTL: TTL_SECONDS,
      urgency: "high",
      timeout: SEND_TIMEOUT_MS,
    });
    return "sent";
  } catch (err) {
    const status = err instanceof WebPushError ? err.statusCode : undefined;
    // 404 and 410 mean the device turned notifications off or the browser dropped the subscription.
    if (status === 404 || status === 410) return "gone";
    console.warn(`[push] ${hostOf(target.endpoint)} did not accept a notification: ${status ?? (err as Error).message}`);
    return "failed";
  }
}

/** Forget subscriptions that no longer exist on the device. */
async function forget(ids: string[]) {
  if (ids.length === 0) return;
  const db = await getDb();
  await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids));
}

const TITLES = dict.push.titles as Record<string, Pair>;

type NotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  /** Creation time in epoch milliseconds. */
  at: number;
  actor_name: string | null;
  locale: string;
  unread: number;
};

const RLM = String.fromCharCode(0x200f);
const LRM = String.fromCharCode(0x200e);

/**
 * Notification text is plain, and phones and computers set each line's
 * direction from its first letter, so a line that starts with a task key
 * (SND-2) or a Latin name would sit on the other side from the rest. An
 * invisible direction mark at the start of every line keeps all of them
 * aligned with the reader's language (right for Arabic, left for English).
 */
export const aligned = (text: string, lang: Lang) =>
  text
    .split("\n")
    .map((line) => (lang === "ar" ? RLM : LRM) + line)
    .join("\n");

/** Lock-screen wording for one notification: a short title, then the task or project and who did it. */
export function describe(row: Pick<NotificationRow, "type" | "payload" | "actor_name">, lang: Lang): { title: string; body: string } {
  const t = <V>(pair: Pair<V>) => pair[lang];
  const p = (row.payload ?? {}) as Record<string, string | undefined>;
  const actor = row.actor_name ?? t(dict.common.someone);
  const subject = p.taskKey ? `${p.taskKey} ${p.taskTitle ?? ""}`.trim() : (p.projectName ?? "");
  let detail: string;
  if (row.type === "comment_added") {
    detail = p.excerpt ? `${actor}: ${p.excerpt}` : fill(t(dict.push.by), { actor });
  } else if (row.type === "status_changed") {
    const status = TASK_STATUS_META[p.to as TaskStatus];
    detail = status ? fill(t(dict.push.statusBy), { status: t(status.label), actor }) : fill(t(dict.push.by), { actor });
  } else if (row.type === "review_requested") {
    detail = fill(t(dict.push.reviewBy), { actor });
  } else if (row.type === "recurring_task") {
    detail = String(p.personal) === "true" ? t(dict.push.recurringPersonal) : fill(t(dict.push.recurringIn), { project: p.projectName ?? "" });
  } else if ((row.type === "task_assigned" || row.type === "general_task") && p.projectName) {
    detail = fill(t(dict.push.byIn), { actor, project: p.projectName });
  } else {
    detail = fill(t(dict.push.by), { actor });
  }
  return {
    title: aligned(clampText(t(TITLES[row.type] ?? dict.push.fallbackTitle), 80), lang),
    body: aligned(clampText([subject, detail].filter(Boolean).join("\n"), 300), lang),
  };
}

/**
 * Send the given notifications (already committed) to every device of their
 * recipients. Tapping one opens /notifications/<id>, which marks it read and
 * goes on to the task or project. The app icon badge shows the unread count.
 */
export async function deliverNotifications(ids: string[]) {
  if (!pushEnabled() || ids.length === 0) return;
  const db = await getDb();
  const result = await db.execute(sql`
    select n.id, n.type, n.payload, (extract(epoch from n.created_at) * 1000)::float8 as at, a.name as actor_name, u.locale,
      (select count(*)::int from notifications x where x.user_id = n.user_id and x.read_at is null) as unread,
      s.id as sub_id, s.endpoint, s.p256dh, s.auth
    from notifications n
    join users u on u.id = n.user_id and u.is_active
    join push_subscriptions s on s.user_id = n.user_id
    left join users a on a.id = n.actor_id
    where n.id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `
    )})`);
  const rows = (result as unknown as { rows: Array<NotificationRow & { sub_id: string; endpoint: string; p256dh: string; auth: string }> }).rows;
  if (rows.length === 0) return;

  const outcomes = await Promise.all(
    rows.map(async (row) => {
      const lang: Lang = isLang(row.locale) ? row.locale : "ar";
      const message: PushMessage = {
        ...describe(row, lang),
        url: `/notifications/${row.id}`,
        tag: row.id,
        badge: Number(row.unread) || 0,
        lang,
        dir: dirOf(lang),
        ts: Math.round(Number(row.at)) || Date.now(),
      };
      return { id: row.sub_id, outcome: await send({ id: row.sub_id, endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }, message) };
    })
  );
  await forget([...new Set(outcomes.filter((o) => o.outcome === "gone").map((o) => o.id))]);
}

/**
 * Queue device notifications for rows that were just committed. They go out
 * after the response, so nobody waits for the push services; outside a
 * request (scripts) they are sent right away.
 */
export function pushNotifications(ids: string[]) {
  if (!pushEnabled() || ids.length === 0) return;
  const run = () => deliverNotifications(ids).catch((err) => console.error("[push]", err));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A short message to one device so its owner can see notifications work. */
export async function sendTestPush(target: Target, lang: Lang): Promise<Outcome> {
  const outcome = await send(target, {
    title: aligned(dict.push.testTitle[lang], lang),
    body: aligned(dict.push.testBody[lang], lang),
    url: "/settings",
    lang,
    dir: dirOf(lang),
    ts: Date.now(),
  });
  if (outcome === "gone") await forget([target.id]);
  return outcome;
}
