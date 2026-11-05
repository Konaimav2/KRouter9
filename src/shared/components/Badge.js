"use client";

import Icon from "@/shared/components/Icon";
import { cn } from "@/shared/utils/cn";

const variants = {
  default: "bg-surface-2 text-text-muted",
  primary: "bg-brand-500/10 text-brand-600 dark:text-brand-300",
  success: "bg-[var(--color-success-wash)] text-[var(--color-success)]",
  warning: "bg-[var(--color-warning-wash)] text-[var(--color-warning)]",
  error: "bg-[var(--color-danger-wash)] text-[var(--color-danger)]",
  info: "bg-[var(--color-info-wash)] text-[var(--color-info)]",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-[var(--color-success)]",
            variant === "warning" && "bg-[var(--color-warning)]",
            variant === "error" && "bg-[var(--color-danger)]",
            variant === "info" && "bg-[var(--color-info)]",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-gray-500"
          )}
        />
      )}
      {icon && <Icon name={icon} className="text-[14px]" />}
      {children}
    </span>
  );
}
