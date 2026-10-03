"use client";

import Icon from "./Icon";
import { cn } from "@/shared/utils/cn";

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center overflow-x-auto rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-[var(--color-surface-strong)]",
        className
      )}
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center border-l border-[var(--color-border)] px-4 font-medium transition-colors first:border-l-0",
            sizes[size],
            value === option.value
              ? "bg-[var(--color-primary)] text-[var(--color-on-primary)]"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          )}
        >
          {option.icon && (
            <Icon name={option.icon} className="text-[16px] mr-1.5" />
          )}
          {option.label}
        </button>
      ))}
    </div>
  );
}
