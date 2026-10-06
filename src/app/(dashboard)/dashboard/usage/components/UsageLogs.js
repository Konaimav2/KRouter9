"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import Toggle from "@/shared/components/Toggle";

function maskAccount(value) {
  const text = String(value || "").trim();
  const at = text.indexOf("@");
  if (at <= 0 || at === text.length - 1) return text;
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const suffix = dot > 0 ? domain.slice(dot) : "";
  return `${text[0]}***@${domainName[0]}***${suffix}`;
}

export default function UsageLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const fetchLogs = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/usage/request-logs");
      if (!response.ok) throw new Error(`Logs failed (${response.status})`);
      setLogs(await response.json());
    } catch (fetchError) { setError(fetchError.message || "Failed to fetch logs."); }
    finally { if (initial) setLoading(false); }
  }, []);
  useEffect(() => {
    // Initial log loading is intentionally initiated when the tab mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs(true);
  }, [fetchLogs]);
  useEffect(() => { if (!autoRefresh) return undefined; const timer = setInterval(() => fetchLogs(false), 3000); return () => clearInterval(timer); }, [autoRefresh, fetchLogs]);
  return <section className="border border-border bg-surface"><header className="flex min-h-11 items-center gap-3 border-b border-border bg-surface-2 px-4 py-3 flex-wrap"><span className="font-mono text-xs tabular-nums text-text-muted">LOG</span><h2 className="font-semibold">Request logs</h2><Toggle className="ml-auto" size="sm" checked={autoRefresh} onChange={setAutoRefresh} label="Auto-refresh" description="Every 3s" /></header>
    {error && <div className="border-b border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-3 text-sm text-[var(--color-danger)]">{error} <button type="button" onClick={() => fetchLogs(true)} className="font-semibold underline">Retry</button></div>}
    <div className="max-h-[640px] overflow-auto custom-scrollbar"><table className="w-full min-w-[760px] border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-[var(--table-header-bg)] text-[var(--color-text-muted)]"><tr>{["Date / time", "Model", "Provider", "Account", "Key", "In", "Out", "Status", "Error"].map((label) => <th key={label} className="border-b border-[var(--ledger-rule)] px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{loading && !logs.length ? Array.from({ length: 6 }, (_, index) => <tr key={index}><td colSpan={9} className="h-10 animate-pulse border-b border-[var(--ledger-rule)] bg-[var(--color-surface-strong)]" /></tr>) : logs.length === 0 ? <tr><td colSpan={9} className="p-8 text-center text-[var(--color-text-muted)]">No data yet — send a request through <code>/v1</code>.</td></tr> : logs.map((log, index) => { const parts = String(log).split(" | "); if (parts.length < 7) return null; const status = parts.slice(6).join(" | "); const pending = status.includes("PENDING"); const failed = status.includes("FAILED") || /\b[45]\d\d\b/.test(status); return <tr key={`${parts[0]}-${index}`} className="border-b border-[var(--ledger-rule)] hover:bg-[var(--table-row-hover)]"><td className="font-mono tabular-nums px-3 py-2 text-[var(--color-text-muted)]">{parts[0]}</td><td className="font-mono tabular-nums px-3 py-2">{parts[1]}</td><td className="px-3 py-2">{parts[2]}</td><td className="max-w-[180px] truncate px-3 py-2">{maskAccount(parts[3])}</td><td className="px-3 py-2 font-mono text-text-muted">—</td><td className="font-mono tabular-nums px-3 py-2 text-right">{parts[4]}</td><td className="font-mono tabular-nums px-3 py-2 text-right">{parts[5]}</td><td className={`px-3 py-2 font-semibold ${pending ? "text-[var(--color-info)]" : failed ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}><span className="inline-flex items-center gap-1.5">{pending ? <CircleDashed aria-hidden="true" size={14} /> : failed ? <CircleX aria-hidden="true" size={14} /> : <CircleCheck aria-hidden="true" size={14} />} {status}</span></td><td className="max-w-[220px] truncate px-3 py-2 text-danger">{failed ? status : "—"}</td></tr>; })}</tbody></table></div>
  </section>;
}
