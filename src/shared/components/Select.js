"use client";

import Icon from "./Icon";
import { cn } from "@/shared/utils/cn";

export default function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  error,
  hint,
  disabled = false,
  required = false,
  className,
  selectClassName,
  ...props
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-sm font-medium text-[var(--color-text)]">
          {label}
          {required && <span className="ml-1 text-[var(--color-danger)]">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full px-3 py-2.5 pr-10 text-sm text-[var(--color-text)]",
            "bg-[var(--input-bg)] border border-[var(--input-border)] rounded-[var(--input-radius)] appearance-none",
            "focus:outline-none focus:border-[var(--input-border-focus)] focus:shadow-[var(--focus-ring)]",
            "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
            "text-[16px] sm:text-sm",
            error && "border-[var(--color-danger)] bg-[var(--color-danger-wash)]",
            selectClassName
          )}
          {...props}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)]">
          <Icon name="expand_more" className="text-[20px]" />
        </div>
      </div>
      {error && (
        <p className="flex items-center gap-1 text-xs text-[var(--color-danger)]">
          <Icon name="error" className="text-[14px]" />
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>
      )}
    </div>
  );
}
