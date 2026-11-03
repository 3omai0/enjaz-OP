"use client";

import { BellRing, Download, Loader2, Share, SquarePlus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { usePush } from "@/components/push/push-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { usePlural, useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

function Notice({ tone = "muted", title, children }: { tone?: "muted" | "warning"; title?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-xs font-medium leading-relaxed", tone === "warning" ? "border-warning/25 bg-warning/5 text-ink" : "border-line bg-paper text-ink-soft")}>
      {title && (
        <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-ink">
          {tone === "warning" && <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />}
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

/** Steps to add the site to the iPhone or iPad Home Screen, the only place iOS allows web notifications. */
export function IosInstallSteps() {
  const t = useT();
  const steps = t(dict.push.iosSteps);
  const icons = [null, Share, SquarePlus, null];
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => {
        const Icon = icons[i];
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 font-grotesk text-[11px] font-bold text-brand">{i + 1}</span>
            <span className="text-xs font-medium leading-relaxed text-ink">
              {step}
              {Icon && <Icon className="ms-1.5 inline h-3.5 w-3.5 align-[-2px] text-brand" aria-hidden />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Device notifications for the person's current phone or computer: turn them
 * on or off here, send a test, and see how many of their devices receive them.
 */
export function NotificationsCard({ devices, isAdmin }: { devices: number; isAdmin: boolean }) {
  const t = useT();
  const tp = usePlural();
  const router = useRouter();
  const { toast } = useToast();
  const { status, busy, isIos, canInstall, enable, disable, test, install } = usePush();

  const onEnable = async () => {
    const result = await enable();
    if (result === "on") {
      toast(t(dict.push.enabled));
      router.refresh();
    } else if (result === "failed") {
      toast(t(dict.push.failed), "error");
    }
  };

  const onDisable = async () => {
    if (await disable()) {
      toast(t(dict.push.disabled), "info");
      router.refresh();
    }
  };

  const onTest = async () => {
    const result = await test();
    if (result === "sent") toast(t(dict.push.testSent), "info");
    else toast(t(dict.push.testFailed), "error");
  };

  let body: React.ReactNode;
  if (status === "checking") {
    body = (
      <p className="flex items-center gap-2 text-xs font-medium text-ink-soft">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t(dict.push.checking)}
      </p>
    );
  } else if (status === "on" || status === "off") {
    const on = status === "on";
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={cn("flex items-center gap-2 text-sm font-bold", on ? "text-success" : "text-ink-soft")}>
          <span className={cn("h-2 w-2 rounded-full", on ? "bg-success" : "bg-ink-soft/40")} />
          {on ? t(dict.push.on) : t(dict.push.off)}
        </p>
        {on ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onTest} disabled={busy}>
              {t(dict.push.test)}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDisable} disabled={busy}>
              {t(dict.push.disable)}
            </Button>
          </div>
        ) : (
          <Button size="sm" onClick={onEnable} loading={busy}>
            <BellRing className="h-4 w-4" />
            {t(dict.push.enable)}
          </Button>
        )}
      </div>
    );
  } else if (status === "denied") {
    body = (
      <Notice tone="warning" title={t(dict.push.deniedTitle)}>
        {isIos ? t(dict.push.deniedIos) : t(dict.push.deniedHint)}
      </Notice>
    );
  } else if (status === "ios-install") {
    body = (
      <Notice title={t(dict.push.iosTitle)}>
        <div className="mt-2">
          <IosInstallSteps />
        </div>
      </Notice>
    );
  } else if (status === "ios-update") {
    body = <Notice tone="warning">{t(dict.push.iosUpdate)}</Notice>;
  } else if (status === "insecure") {
    body = <Notice tone="warning">{t(dict.push.insecure)}</Notice>;
  } else if (status === "unavailable") {
    body = (
      <Notice>
        {t(dict.push.unavailable)}
        {isAdmin && <span className="mt-1 block">{t(dict.push.unavailableAdmin)}</span>}
      </Notice>
    );
  } else {
    body = <Notice tone="warning">{t(dict.push.unsupported)}</Notice>;
  }

  return (
    <div id="notifications" className="scroll-mt-20">
      <Card>
        <CardHeader title={t(dict.push.title)} description={t(dict.push.desc)} />
        {body}
        {canInstall && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="min-w-0 flex-1 text-xs font-medium text-ink-soft">{t(dict.push.installHint)}</p>
            <Button variant="secondary" size="sm" onClick={install}>
              <Download className="h-4 w-4" />
              {t(dict.push.install)}
            </Button>
          </div>
        )}
        {devices > 0 && (
          <p className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-xs font-bold text-ink-soft">
            <span>{t(dict.push.devices)}</span>
            <span className="text-ink">{tp(dict.plurals.devices, devices)}</span>
          </p>
        )}
      </Card>
    </div>
  );
}
