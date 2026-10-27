"use client";

import { cn } from "@/shared/utils/cn";

export default function Card({
  children,
  title,
  subtitle,
  icon,
  action,
  padding = "md",
  hover = false,
  elev = false,
  className,
  ...props
}) {
  const paddings = {
    none: "",
    xs: "p-3",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  };

  return (
    <div
      className={cn(
        "router-card relative bg-surface border border-border-subtle",
        elev ? "rounded-[18px] shadow-[var(--shadow-elev)]" : "rounded-[18px] shadow-[var(--shadow-soft)]",
        hover && "router-card-interactive hover:shadow-[var(--shadow-warm)] hover:border-brand-500/30 transition-all cursor-pointer",
        paddings[padding],
        className
      )}
      {...props}
    >
      {(title || action) && (
          <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-text-main font-semibold">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-text-muted">{subtitle}</p>
              )}
            </div>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

Card.Section = function CardSection({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-4 rounded-xl",
        "router-card-section bg-bg-alt/70 border border-border-subtle",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.Row = function CardRow({ children, className, ...props }) {
  return (
    <div
      className={cn(
        "p-3 -mx-3 px-3 transition-colors rounded-lg",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-brand-500/[0.035]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

Card.ListItem = function CardListItem({
  children,
  actions,
  className,
  ...props
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between p-3 -mx-3 px-3 rounded-lg",
        "border-b border-border-subtle last:border-b-0",
        "hover:bg-brand-500/[0.035] transition-colors",
        className
      )}
      {...props}
    >
      <div className="flex-1 min-w-0">{children}</div>
      {actions && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
};
