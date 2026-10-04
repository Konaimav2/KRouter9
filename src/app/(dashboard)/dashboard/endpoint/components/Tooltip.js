"use client";

import { CircleHelp } from "lucide-react";

/** Inline tooltip, Claude Code CLI style */
export default function Tooltip({ text }) {
  return (
    <span className="relative group inline-flex items-center">
      <CircleHelp size={14} className="cursor-help text-[var(--color-text-muted)]" aria-hidden="true" />
      <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 w-64 rounded bg-gray-900 dark:bg-gray-800 text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
        {text}
      </span>
    </span>
  );
}
