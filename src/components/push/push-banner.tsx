"use client";

import { BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { usePush } from "@/components/push/push-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

const DISMISS_KEY = "injaz:push-banner-dismissed";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

/* "Later" hides the banner on this device for a week; the choice is kept in the browser. */
const listeners = new Set<() => void>();
let dismissedThisVisit = false;

function subscribe(fn: () => void) {
  listeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
}

function isDismissed() {
  if (dismissedThisVisit) return true;
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && Date.now() - at < DISMISS_MS;
  } catch {
    return false;
  }
}

function dismiss() {
  dismissedThisVisit = true;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private browsing: hidden until the next visit only.
  }
  listeners.forEach((fn) => fn());
}

/** Dashboard prompt to turn on device notifications, shown until they are on or the person picks "Later". */
export function PushBanner() {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { status, busy, enable } = usePush();
  // Hidden while the server renders, so the banner never flashes for people who already turned it on.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);

  if (dismissed || (status !== "off" && status !== "ios-install")) return null;
  const ios = status === "ios-install";

  const onEnable = async () => {
    const result = await enable();
    if (result === "on") {
      toast(t(dict.push.enabled));
      router.refresh();
    } else if (result === "failed") {
      toast(t(dict.push.failed), "error");
    }
  };

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-brand/20 bg-brand/[0.04] p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand text-white">
          <BellRing className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{t(dict.push.bannerTitle)}</p>
          <p className="mt-0.5 text-xs font-medium leading-relaxed text-ink-soft">{ios ? t(dict.push.bannerIos) : t(dict.push.bannerText)}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:ms-auto">
        {ios ? (
          <ButtonLink href="/settings#notifications" size="sm">
            {t(dict.push.bannerHow)}
          </ButtonLink>
        ) : (
          <Button size="sm" onClick={onEnable} loading={busy}>
            {t(dict.push.enable)}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={dismiss}>
          {t(dict.push.later)}
        </Button>
      </div>
    </div>
  );
}
