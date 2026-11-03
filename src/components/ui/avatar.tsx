import { cn, initials } from "@/lib/utils";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<Size, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-lg",
};

/** One neutral style for everyone; `solid` marks the signed-in user. */
export function Avatar({
  name,
  size = "md",
  solid = false,
  className,
  title,
}: {
  name: string;
  id?: string;
  size?: Size;
  solid?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold uppercase leading-none ring-2 ring-white",
        SIZES[size],
        solid ? "bg-brand text-white" : "bg-ink/8 text-ink",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Overlapping avatars with a "+N" tail. Tailwind's space-x uses logical
 * margins, so the overlap already follows the reading direction.
 */
export function AvatarStack({ people, max = 4, size = "sm" }: { people: Array<{ id: string; name: string }>; max?: number; size?: Size }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} size={size} />
      ))}
      {rest > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full bg-paper font-grotesk font-semibold text-ink-soft ring-2 ring-white", SIZES[size])}>+{rest}</span>
      )}
    </span>
  );
}
