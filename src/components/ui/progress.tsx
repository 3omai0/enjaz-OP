import { cn } from "@/lib/utils";

export function ProgressBar({ value, className, tone = "bg-brand", track = "bg-line" }: { value: number; className?: string; tone?: string; track?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full", track, className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${v}%` }} />
    </div>
  );
}
