"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/**
 * Where this device stands with device notifications:
 * unavailable  the server has no VAPID keys yet
 * insecure     the page is not on HTTPS, browsers refuse push there
 * unsupported  the browser has no push support
 * ios-install  iPhone or iPad in a browser tab: push only works from the Home Screen app
 * ios-update   the Home Screen app runs on an iOS older than 16.4
 * denied       the person blocked notifications for the site
 * off / on     ready to turn on, or on for this device
 */
export type PushStatus = "checking" | "unavailable" | "insecure" | "unsupported" | "ios-install" | "ios-update" | "denied" | "off" | "on";
export type EnableResult = "on" | "denied" | "dismissed" | "failed";
export type TestResult = "sent" | "failed" | "gone";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type BadgeNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void>; standalone?: boolean };

type PushContextValue = {
  status: PushStatus;
  busy: boolean;
  isIos: boolean;
  canInstall: boolean;
  enable: () => Promise<EnableResult>;
  disable: () => Promise<boolean>;
  test: () => Promise<TestResult>;
  install: () => Promise<void>;
  /** Signing out: stop notifications on this device and return its address so the server forgets it too. */
  detach: () => Promise<string>;
};

const PushContext = createContext<PushContextValue>({
  status: "checking",
  busy: false,
  isIos: false,
  canInstall: false,
  enable: async () => "failed",
  disable: async () => false,
  test: async () => "failed",
  install: async () => {},
  detach: async () => "",
});

export const usePush = () => useContext(PushContext);

/*
 * Chrome and Edge announce that the app can be installed once, early in the
 * page's life, so the offer is kept from the moment this module loads.
 */
let installOffer: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const announceInstall = () => installListeners.forEach((fn) => fn());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    installOffer = e as BeforeInstallPromptEvent;
    announceInstall();
  });
  window.addEventListener("appinstalled", () => {
    installOffer = null;
    announceInstall();
  });
}
const watchInstall = (fn: () => void) => {
  installListeners.add(fn);
  return () => void installListeners.delete(fn);
};
const noop = () => () => {};

const SW_URL = "/sw.js";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), ms))]);
}

function keyBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** True when the subscription was made with the server's current key (the keys can be replaced). */
function sameKey(sub: PushSubscription, publicKey: string) {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** iPhone or iPad (iPadOS presents itself as a Mac with a touch screen). */
const isIosDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as BadgeNavigator).standalone === true;
const hasPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function send(method: "POST" | "DELETE", url: string, body: object) {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
}

const saveSubscription = async (sub: PushSubscription) => (await send("POST", "/api/push/subscription", sub.toJSON())).ok;

/** Drop a subscription made with an older server key, here and on the server. */
async function dropSubscription(sub: PushSubscription) {
  await send("DELETE", "/api/push/subscription", { endpoint: sub.endpoint }).catch(() => null);
  await sub.unsubscribe().catch(() => false);
}

async function detect(publicKey: string | null): Promise<PushStatus> {
  if (!publicKey) return "unavailable";
  if (!window.isSecureContext) return "insecure";
  if (!hasPush()) return isIosDevice() ? (isStandalone() ? "ios-update" : "ios-install") : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const sub = await currentSubscription();
  if (!sub || Notification.permission !== "granted") return "off";
  if (!sameKey(sub, publicKey)) {
    await dropSubscription(sub);
    return "off";
  }
  return "on";
}

/**
 * Device notifications for the signed-in app: registers the service worker,
 * keeps this device's subscription saved on the server (also after the
 * account signs in again), mirrors the unread count on the app icon, and gives
 * the settings card and the dashboard banner one shared state.
 */
export function PushProvider({ publicKey, sessionVersion, unread, children }: { publicKey: string | null; sessionVersion: number; unread: number; children: React.ReactNode }) {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [busy, setBusy] = useState(false);
  // Only asked where it changes what is shown (no push support, or notifications blocked), so browsers that support push are never user-agent sniffed.
  const isIos = useSyncExternalStore(noop, () => (!hasPush() || Notification.permission === "denied") && isIosDevice(), () => false);
  const canInstall = useSyncExternalStore(watchInstall, () => !!installOffer, () => false);
  const synced = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (window.isSecureContext && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" }).catch((err) => console.warn("[push] service worker", err));
    }
    detect(publicKey)
      .catch((): PushStatus => "unsupported")
      .then((next) => {
        if (!cancelled) setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  // Save this device again on every visit and after a new sign-in, so the server always knows where to reach the person.
  useEffect(() => {
    if (status !== "on" || synced.current === sessionVersion) return;
    synced.current = sessionVersion;
    currentSubscription()
      .then((sub) => (sub ? saveSubscription(sub) : false))
      .catch(() => false);
  }, [status, sessionVersion]);

  // The number on the app icon follows the unread notifications.
  useEffect(() => {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function") return;
    (unread > 0 ? nav.setAppBadge(unread) : (nav.clearAppBadge?.() ?? Promise.resolve())).catch(() => {});
  }, [unread]);

  // A tapped notification asks an open page to move when the worker cannot move it directly.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: string } | null;
      if (data?.type !== "injaz:navigate" || typeof data.url !== "string") return;
      const url = new URL(data.url, window.location.origin);
      if (url.origin === window.location.origin) window.location.assign(url.href);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  const enable = useCallback(async (): Promise<EnableResult> => {
    if (!publicKey || !hasPush()) return "failed";
    setBusy(true);
    try {
      // Asked first, straight from the tap: Safari and Firefox only show the prompt in response to one.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return permission === "denied" ? "denied" : "dismissed";
      }
      await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
      const reg = await withTimeout(navigator.serviceWorker.ready, 15_000);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, publicKey)) {
        await dropSubscription(sub);
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      if (!(await saveSubscription(sub))) throw new Error("The server did not save the subscription");
      synced.current = sessionVersion;
      setStatus("on");
      return "on";
    } catch (err) {
      console.warn("[push] enable", err);
      return "failed";
    } finally {
      setBusy(false);
    }
  }, [publicKey, sessionVersion]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await send("DELETE", "/api/push/subscription", { endpoint: sub.endpoint }).catch(() => null);
        await sub.unsubscribe().catch(() => false);
      }
      synced.current = null;
      setStatus("off");
      return true;
    } catch (err) {
      console.warn("[push] disable", err);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async (): Promise<TestResult> => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (!sub) {
        setStatus("off");
        return "gone";
      }
      let res = await send("POST", "/api/push/test", { endpoint: sub.endpoint });
      if (res.status === 404 && (await saveSubscription(sub))) res = await send("POST", "/api/push/test", { endpoint: sub.endpoint });
      if (res.status === 410) {
        await sub.unsubscribe().catch(() => false);
        setStatus("off");
        return "gone";
      }
      return res.ok || res.status === 429 ? "sent" : "failed";
    } catch {
      return "failed";
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    const offer = installOffer;
    if (!offer) return;
    try {
      await offer.prompt();
      await offer.userChoice;
    } catch {
      // The offer can only be used once; the browser menu still has "Install".
    }
    installOffer = null;
    announceInstall();
  }, []);

  const detach = useCallback(async () => {
    try {
      const sub = await withTimeout(currentSubscription(), 1500);
      if (!sub) return "";
      await withTimeout(sub.unsubscribe(), 1500).catch(() => false);
      return sub.endpoint;
    } catch {
      return "";
    }
  }, []);

  const value = useMemo(() => ({ status, busy, isIos, canInstall, enable, disable, test, install, detach }), [status, busy, isIos, canInstall, enable, disable, test, install, detach]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}
