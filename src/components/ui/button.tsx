import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";
const variants: Record<Variant, string> = {
  primary: "bg-action text-ink hover:bg-action-hover",
  secondary: "border-2 border-outline bg-surface text-ink hover:bg-tint",
  ghost: "bg-transparent text-ink underline-offset-4 hover:underline",
  danger: "border-2 border-error bg-surface text-error hover:bg-tint",
};
const sizes: Record<Size, string> = { md: "py-2.5 text-base", lg: "py-3.5 text-lg" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; ref?: React.Ref<HTMLButtonElement> }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({ href, variant = "primary", size = "md", className = "", children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
