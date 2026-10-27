"use client";

import { cn } from "@/shared/utils/cn";

const variants = {
  primary: "bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-[var(--shadow-warm)] ring-1 ring-brand-600/15 disabled:bg-surface-3 disabled:text-text-muted",
  secondary: "bg-surface hover:bg-surface-2 text-text-main border border-border shadow-sm disabled:opacity-50",
  outline: "border border-border text-text-main bg-surface/60 hover:bg-brand-500/5 hover:border-brand-500/40",
  ghost: "text-text-muted hover:bg-surface-2 hover:text-text-main",
  danger: "bg-red-500 hover:bg-red-600 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
  success: "bg-green-600 hover:bg-green-700 text-white shadow-sm disabled:bg-surface-3 disabled:text-text-muted",
};

const sizes = {
  xs: "h-6 px-2.5 text-[11px] rounded-lg gap-1.5",
  sm: "h-8 px-3 text-xs rounded-[10px]",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-sm rounded-xl",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  disabled = false,
  loading = false,
  fullWidth = false,
  className,
  ...props
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 ease-out cursor-pointer",
        "active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className={cn("material-symbols-outlined animate-spin", size === "xs" ? "text-[14px]" : "text-[18px]")}>progress_activity</span>
      ) : icon ? (
        <span className={cn("material-symbols-outlined", size === "xs" ? "text-[14px]" : "text-[18px]")}>{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && (
        <span className={cn("material-symbols-outlined", size === "xs" ? "text-[14px]" : "text-[18px]")}>{iconRight}</span>
      )}
    </button>
  );
}
