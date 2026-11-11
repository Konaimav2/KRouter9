"use client";

import { AlertTriangle } from "lucide-react";

/** Security warning banner with optional action link */
export default function SecurityWarning({ message, action }) {
  return (
    <div className="flex items-start gap-2 border border-[var(--color-warning)] bg-[var(--color-warning-wash)] px-3 py-2 text-[var(--color-warning)]">
      <AlertTriangle size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-xs flex-1">{message}</p>
      {action && (
        <a
          href={action.href}
          className="inline-flex min-h-11 shrink-0 items-center self-center text-xs font-medium underline hover:opacity-80"
          onClick={action.href.startsWith("#") ? (e) => {
            e.preventDefault();
            document.getElementById(action.href.slice(1))?.scrollIntoView({ behavior: "smooth" });
          } : undefined}
        >
          {action.label}
        </a>
      )}
    </div>
  );
}
