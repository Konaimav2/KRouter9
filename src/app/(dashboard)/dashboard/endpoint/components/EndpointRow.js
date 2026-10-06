"use client";

import { Input } from "@/shared/components";
import { Check, Copy } from "lucide-react";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)_2.75rem] items-center gap-2">
      <span className={`border-r border-[var(--color-border)] px-2 py-1 text-center font-mono text-xs ${
          (badge === "CF" || badge === "TS") ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
        }`}>{label}</span>
      <Input value={url} readOnly className="flex-1 font-mono text-sm" />
      <button
        onClick={() => onCopy(url, copyId)}
        className="flex size-11 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]" aria-label={`Copy ${label} endpoint`}
      >
        {copied === copyId ? <Check size={18} /> : <Copy size={18} />}
      </button>
      {actions}
    </div>
  );
}
