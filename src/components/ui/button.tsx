import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerSoft" | "dark" | "light";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "iconSm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-deep",
  secondary: "bg-white text-ink border border-line hover:bg-paper",
  ghost: "text-ink-soft hover:bg-ink/5 hover:text-ink",
  danger: "bg-danger text-white hover:bg-danger/90",
  dangerSoft: "text-danger border border-danger/25 bg-white hover:bg-danger/5",
  dark: "bg-brand-dark text-white hover:bg-brand",
  light: "bg-white/10 text-white border border-white/15 hover:bg-white/15",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-10 px-5 text-sm gap-2 rounded-md",
  icon: "h-9 w-9 rounded-md",
  iconSm: "h-8 w-8 rounded-md",
};

export const buttonClasses = (variant: ButtonVariant = "primary", size: ButtonSize = "md", className = "") =>
  cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className
  );

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading = false, className, children, disabled, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({ variant = "primary", size = "md", className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
