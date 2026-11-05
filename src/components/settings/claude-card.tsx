"use client";

import { Check, Copy, Link2, Unplug } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { disconnectMcpAction } from "@/lib/actions/settings";
import { fill } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";

type Connection = { id: string; name: string; connectedOn: string; lastUsed: string | null };

/**
 * Connecting Claude: the connector address to paste into Claude, the steps,
 * and the apps already connected to this account with a way to cut them off.
 */
export function ClaudeCard({ url, connections }: { url: string; connections: Connection[] }) {
  const t = useT();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<Connection | null>(null);
  const [pending, start] = useTransition();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast(t(dict.mcp.copied));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin or denied): the field stays selectable.
    }
  };

  const disconnect = () =>
    start(async () => {
      if (!removing) return;
      const r = await disconnectMcpAction(removing.id);
      if (r?.error) toast(r.error, "error");
      else toast(r?.message ?? t(dict.mcp.disconnected));
      setRemoving(null);
    });

  return (
    <Card>
      <CardHeader title={t(dict.mcp.cardTitle)} description={t(dict.mcp.cardDesc)} />

      <label htmlFor="mcp-url" className="mb-1.5 block text-xs font-bold text-ink-soft">
        {t(dict.mcp.urlLabel)}
      </label>
      <div className="flex gap-2" dir="ltr">
        <input id="mcp-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 font-grotesk text-xs" />
        <Button variant="secondary" onClick={copy} aria-label={t(dict.mcp.copy)} title={t(dict.mcp.copy)}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      <ol className="mt-4 space-y-2">
        {t(dict.mcp.steps).map((step, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 font-grotesk text-[11px] font-bold text-brand">{i + 1}</span>
            <span className="text-xs font-medium leading-relaxed text-ink">{step}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-xs font-bold text-ink-soft">{t(dict.mcp.connections)}</p>
        {connections.length === 0 ? (
          <p className="text-xs font-medium text-ink-soft">{t(dict.mcp.noConnections)}</p>
        ) : (
          <ul className="space-y-2">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <Link2 className="h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                    <span className="block text-[11px] font-medium text-ink-soft">
                      {fill(t(dict.mcp.connectedOn), { date: c.connectedOn })}
                      {c.lastUsed && ` · ${fill(t(dict.mcp.lastUsed), { date: c.lastUsed })}`}
                    </span>
                  </span>
                </span>
                <Button variant="dangerSoft" size="sm" onClick={() => setRemoving(c)}>
                  <Unplug className="h-3.5 w-3.5" />
                  {t(dict.mcp.disconnect)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={disconnect}
        loading={pending}
        title={t(dict.mcp.disconnect)}
        confirmLabel={t(dict.mcp.disconnect)}
      >
        <p className="text-sm font-medium text-ink-soft">{fill(t(dict.mcp.disconnectConfirm), { app: removing?.name ?? "" })}</p>
      </ConfirmDialog>
    </Card>
  );
}
