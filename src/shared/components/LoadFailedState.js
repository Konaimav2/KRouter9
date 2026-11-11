"use client";

import Icon from "./Icon";
import { cn } from "@/shared/utils/cn";

const DEFAULT_TITLE = "Couldn't load this page";
const DEFAULT_MESSAGE = "The request failed. Check the gateway and try again.";

/**
 * Shared load-failure state. Distinct from empty and not-found states:
 * pages render this only when the loader request itself failed (non-2xx or
 * network error).
 *
 * Props: title, message, onRetry, retrying, className.
 * Callers pass human-readable copy only. Any `error` object a caller hands in
 * is ignored on purpose so a raw stack or server detail never reaches the DOM.
 */
export default function LoadFailedState({ title, message, onRetry, retrying = false, className }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-[var(--radius-control)] border border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-4 text-[var(--color-text)] sm:flex-row sm:items-center",
        className,
      )}
    >
      <Icon name="error" size={20} className="shrink-0 text-[var(--color-danger)]" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-words">{title || DEFAULT_TITLE}</p>
        <p className="text-sm break-words text-[var(--color-text-muted)]">{message || DEFAULT_MESSAGE}</p>
      </div>
      {typeof onRetry === "function" ? (
        <button
          type="button"
          onClick={() => onRetry()}
          disabled={retrying}
          aria-busy={retrying}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[var(--button-radius)] border border-[var(--button-border)] bg-[var(--button-secondary-bg)] px-4 text-sm font-semibold text-[var(--button-secondary-fg)] transition-colors hover:bg-[var(--button-secondary-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-[.62]"
        >
          <Icon name="refresh" className={cn(retrying && "animate-spin")} />
          Retry
        </button>
      ) : null}
    </div>
  );
}
