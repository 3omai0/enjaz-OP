"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastOptions = { kind?: ToastKind; action?: ToastAction };
type Toast = { id: number; kind: ToastKind; message: string; action?: ToastAction };

type Ctx = { toast: (message: string, kindOrOptions?: ToastKind | ToastOptions) => void };

const ToastCtx = createContext<Ctx>({ toast: () => {} });

export const useToast = () => useContext(ToastCtx);

const ICONS: Record<ToastKind, typeof Info> = { success: CircleCheck, error: CircleAlert, info: Info };
const TONES: Record<ToastKind, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-brand",
};

/** Plain notices close after a few seconds; one with an action (Undo) stays longer so there is time to use it. */
const DURATION_MS = 3800;
const DURATION_WITH_ACTION_MS = 7000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (message: string, kindOrOptions: ToastKind | ToastOptions = "success") => {
      const options = typeof kindOrOptions === "string" ? { kind: kindOrOptions } : kindOrOptions;
      const id = ++counter.current;
      setItems((list) => [...list.slice(-2), { id, kind: options.kind ?? "success", message, action: options.action }]);
      window.setTimeout(() => dismiss(id), options.action ? DURATION_WITH_ACTION_MS : DURATION_MS);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <div key={item.id} className="toast-in pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-md border border-line bg-white px-3.5 py-2.5" role={item.kind === "error" ? "alert" : "status"}>
              <Icon className={cn("h-4 w-4 shrink-0", TONES[item.kind])} />
              <p className="flex-1 text-sm font-medium text-ink">{item.message}</p>
              {item.action && (
                <button
                  type="button"
                  onClick={() => {
                    dismiss(item.id);
                    item.action?.onClick();
                  }}
                  className="shrink-0 rounded px-2 py-1 text-sm font-semibold text-brand transition-colors hover:bg-brand/8"
                >
                  {item.action.label}
                </button>
              )}
              <button type="button" onClick={() => dismiss(item.id)} className="shrink-0 text-ink-soft hover:text-ink" aria-label={t(dict.common.close)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
