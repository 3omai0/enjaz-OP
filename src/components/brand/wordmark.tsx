"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { dict } from "@/lib/i18n/dictionary";
import { cn } from "@/lib/utils";

/** The Sanad "S" mark, same symmetric path as the public site. */
export function Monogram({ className = "", color = "currentColor" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 127 175" className={className} aria-hidden fill={color}>
      <path d="M5 50V0H97V27.5H37.5V57C37.5 73 73.4 66.5 94.5 78C119.1 91.4 122 119 122 125V175H30V147.5H89.5V118C89.5 102 53.6 108.5 32.5 97C7.9 83.6 5 56 5 50Z" />
      <rect x="97" y="27.5" width="30" height="27.5" />
      <rect x="0" y="120" width="30" height="27.5" />
    </svg>
  );
}

/** Brand tile (purple square, white mark) with the platform name beside it. */
export function Wordmark({ light = false, href = "/dashboard", className, compact = false }: { light?: boolean; href?: string; className?: string; compact?: boolean }) {
  const t = useT();
  return (
    <Link href={href} className={cn("flex items-center gap-2.5", className)}>
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand">
        <Monogram className="h-[18px] w-auto" color="#ffffff" />
      </span>
      {!compact && (
        <span className={cn("min-w-0 text-base font-bold leading-none", light ? "text-white" : "text-ink")}>{t(dict.app.name)}</span>
      )}
    </Link>
  );
}
