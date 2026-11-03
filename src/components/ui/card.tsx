import { cn } from "@/lib/utils";

export function Card({ className, children, padded = true }: { className?: string; children: React.ReactNode; padded?: boolean }) {
  return <section className={cn("rounded-lg border border-line bg-white", padded && "p-5", className)}>{children}</section>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {description && <p className="mt-0.5 text-xs font-medium text-ink-soft">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-medium text-ink-soft">{eyebrow}</div>}
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm font-medium text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      <span className={cn("mb-3 inline-flex items-center justify-center rounded-full border border-line bg-paper text-ink-soft", compact ? "h-9 w-9" : "h-11 w-11")}>
        <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.8} />
      </span>
      <h3 className={cn("font-bold text-ink", compact ? "text-sm" : "text-base")}>{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs font-medium leading-relaxed text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Flat metric: label, big number, optional hint. Tone only colors the number. */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "brand" | "warning" | "danger" | "success";
  href?: string;
}) {
  const tones = {
    default: "text-ink",
    brand: "text-brand",
    warning: "text-warning",
    danger: "text-danger",
    success: "text-success",
  };
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-soft">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-ink-soft/60" />}
      </div>
      <p className={cn("mt-2 font-grotesk text-2xl font-semibold tracking-tight", tones[tone])}>
        <span dir="ltr">{value}</span>
      </p>
      {hint && <p className="mt-0.5 text-xs font-medium text-ink-soft">{hint}</p>}
    </>
  );
  const classes = "block rounded-lg border border-line bg-white px-4 py-3.5 transition-colors";
  if (href) {
    return (
      <a href={href} className={cn(classes, "hover:border-brand/40")}>
        {body}
      </a>
    );
  }
  return <div className={classes}>{body}</div>;
}
