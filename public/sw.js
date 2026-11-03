/*
 * Injaz service worker. It only handles device notifications: it shows each
 * push the server sends, keeps the app icon badge at the unread count, and
 * opens the right page when a notification is tapped. Pages are not cached,
 * so everything on screen always comes fresh from the server.
 */

const FALLBACK_PATH = "/notifications";

self.addEventListener("install", () => {
  // A new version takes over right away instead of waiting for every tab to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  if (!event.data) return {};
  try {
    return event.data.json();
  } catch {
    return { body: event.data.text() };
  }
}

/** Absolute address of a page on this site; anything else falls back to the notifications page. */
function pageUrl(value) {
  try {
    const url = new URL(typeof value === "string" && value ? value : FALLBACK_PATH, self.location.origin);
    if (url.origin === self.location.origin) return url.href;
  } catch {
    // fall through
  }
  return new URL(FALLBACK_PATH, self.location.origin).href;
}

function setBadge(count) {
  const nav = self.navigator;
  if (typeof count !== "number" || !nav || typeof nav.setAppBadge !== "function") return Promise.resolve();
  return (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {});
}

self.addEventListener("push", (event) => {
  const data = readPayload(event);
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    dir: data.dir === "rtl" || data.dir === "ltr" ? data.dir : "auto",
    lang: typeof data.lang === "string" ? data.lang : "",
    timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
    data: { url: pageUrl(data.url) },
  };
  if (typeof data.tag === "string" && data.tag) options.tag = data.tag;
  const title = typeof data.title === "string" && data.title ? data.title : "إنجاز";
  // Every push must show a notification: iPhone and Chrome stop delivering to sites that push silently.
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), setBadge(data.badge)]));
});

async function openPage(target) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const open = windows.find((client) => {
    try {
      return new URL(client.url).origin === self.location.origin;
    } catch {
      return false;
    }
  });
  if (open) {
    try {
      await open.focus();
    } catch {
      // Focus is best effort; the page still changes below.
    }
    try {
      await open.navigate(target);
    } catch {
      // A tab this worker does not control yet cannot be navigated from here; the page moves itself.
      open.postMessage({ type: "injaz:navigate", url: target });
    }
    return;
  }
  await self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(openPage(pageUrl(url)));
});

// Some browsers (Firefox) renew a subscription on their own; tell the server about the new one.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const previous = event.oldSubscription;
      let next = event.newSubscription;
      if (!next && previous && previous.options && previous.options.applicationServerKey) {
        next = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: previous.options.applicationServerKey });
      }
      if (!next) return;
      await fetch("/api/push/subscription", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next.toJSON(), previousEndpoint: previous ? previous.endpoint : undefined }),
      });
    })().catch(() => {})
  );
});
