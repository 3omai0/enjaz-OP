"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const POLL_MS = 20_000;
/** After this long without mouse, keyboard or touch input the page stops checking, so the database can sleep. */
const IDLE_MS = 5 * 60_000;

/** True while the user is typing or has a dialog open: a refresh then waits for the next check. */
function isBusy() {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return true;
  return !!document.querySelector('[role="dialog"]');
}

/**
 * Keeps open pages current without a manual reload. While the tab is visible
 * and the user is active, it asks /api/updates for a short fingerprint of
 * everything they can see and refreshes the page when it changes. `version`
 * is the fingerprint the server rendered with, so the user's own changes do
 * not trigger a second refresh.
 */
export function LiveRefresh({ version }: { version: string }) {
  const router = useRouter();
  const known = useRef(version);

  useEffect(() => {
    known.current = version;
  }, [version]);

  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    let lastInput = Date.now();

    const check = async () => {
      window.clearTimeout(timer);
      if (stopped) return;
      if (document.visibilityState === "visible" && Date.now() - lastInput < IDLE_MS) {
        try {
          const res = await fetch("/api/updates", { cache: "no-store" });
          if (res.status === 401) {
            // Signed out or deactivated elsewhere: the next navigation shows the login page.
            stopped = true;
            return;
          }
          if (res.ok) {
            const { v } = (await res.json()) as { v?: string };
            if (v && v !== known.current && !isBusy()) {
              known.current = v;
              router.refresh();
            }
          }
        } catch {
          // Offline or the server is restarting: try again on the next tick.
        }
      }
      if (!stopped) timer = window.setTimeout(check, POLL_MS);
    };

    const onInput = () => {
      const wasIdle = Date.now() - lastInput >= IDLE_MS;
      lastInput = Date.now();
      if (wasIdle) void check();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastInput = Date.now();
        void check();
      }
    };

    timer = window.setTimeout(check, POLL_MS);
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, onInput);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
