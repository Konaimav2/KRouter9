"use client";

import Icon from "./Icon";
import { cn } from "@/shared/utils/cn";

export default function Input({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  hint,
  icon,
  disabled = false,
  required = false,
  className,
  inputClassName,
  button,
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
        {icon && (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--color-text-muted)]">
            <Icon name={icon} className="text-[20px]" />
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "w-full rounded-[var(--input-radius)] bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--color-text)]",
            "border border-[var(--input-border)] placeholder:text-[var(--input-placeholder)]",
            "focus:outline-none focus:border-[var(--input-border-focus)] focus:shadow-[var(--focus-ring)]",
            "transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50",
            // iOS zoom fix
            "text-[16px] sm:text-sm",
            icon && "pl-10",
            error && "border-[var(--color-danger)] bg-[var(--color-danger-wash)]",
            inputClassName
          )}
          {...props}
        />
        {button}
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
