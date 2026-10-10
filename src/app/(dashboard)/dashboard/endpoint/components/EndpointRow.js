"use client";

import { Check, Copy } from "lucide-react";

export default function EndpointRow({ label, url, copyId, copied, onCopy, status = "Reachable", access = "Host", disabled = false, actions }) {
  const healthy = /reachable|connected/i.test(status);
  return (
    <div className="grid min-w-0 gap-2 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-[7rem_8rem_minmax(0,1fr)_7rem_minmax(9rem,auto)] md:items-center">
      <span className="text-sm font-medium">{label}</span>
      <span className={`text-xs ${healthy ? "text-success" : status === "Off" ? "text-text-muted" : "text-warning"}`}>{status}</span>
      <code className="min-w-0 truncate font-[var(--font-data)] text-xs text-text-muted" title={url}>{url}</code>
      <span className="text-xs text-text-muted">{access}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <button type="button" disabled={disabled} onClick={() => onCopy(url, copyId)} className="flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-2 text-xs text-primary hover:bg-surface-hover disabled:text-text-disabled disabled:hover:bg-transparent" aria-label={`Copy ${label} endpoint`}>{copied === copyId ? <Check size={15}/> : <Copy size={15}/>}Copy</button>
        {actions}
      </div>
    </div>
  );
}
