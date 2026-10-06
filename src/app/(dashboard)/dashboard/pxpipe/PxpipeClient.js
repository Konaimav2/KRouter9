"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from "react";
import { Activity, ArrowUpRight, CheckCircle2, CircleDashed, Clock3, Gauge, ImageIcon, RefreshCw } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/shared/components";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};
const fmtUptime = (ms) => {
  if (!ms || ms <= 0) return "—";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h${String(m % 60).padStart(2, "0")}m` : `${m}m`;
};
const WINDOW_TABS = [
  { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
  { id: "last7d", label: "7 days" }, { id: "last30d", label: "30 days" }, { id: "all", label: "All time" },
];
const REASON_LABELS = {
  applied: "Prompt exceeded threshold", below_threshold: "Below size threshold", not_profitable: "Compression not profitable",
  below_min_chars: "Below minimum chars", below_min_tokens: "Below minimum tokens", unsupported_model: "Model not in allowlist",
  unsupported_format: "Non-Claude request format", timeout: "Compression timed out", transform_error: "Transform error",
  passthrough: "Passthrough", disabled: "Disabled", not_installed: "Not installed",
};

function LedgerBand({ number, title, summary, action, children, id }) {
  return <section id={id} className="min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]"><header className="flex flex-col gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-strong)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-primary)]">{number}</span><div className="min-w-0"><h2 className="font-semibold text-[var(--color-text)]">{title}</h2>{summary && <p className="text-xs text-[var(--color-text-muted)]">{summary}</p>}</div></div>{action}</header>{children}</section>;
}

function MetricRow({ position, label, value, sub, tone, icon: Icon }) {
  return <div className="grid min-h-[var(--row-h-default)] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 bg-[var(--color-surface)] px-3 py-3 hover:bg-[var(--color-surface-hover)]"><span className="border-r border-[var(--color-border-strong)] pr-3 text-center font-mono text-xs tabular-nums text-[var(--color-primary)]">{position}</span><span className="flex min-w-0 items-center gap-3"><Icon size={17} strokeWidth={1.75} className="shrink-0 text-[var(--color-text-muted)]"/><span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{sub && <span className="block truncate text-xs text-[var(--color-text-muted)]">{sub}</span>}</span></span><strong className={`font-mono text-sm font-semibold tabular-nums ${tone || ""}`}>{value}</strong></div>;
}

export default function PxpipeClient() {
  const [status, setStatus] = useState(null); const [health, setHealth] = useState(null); const [stats, setStats] = useState(null); const [logs, setLogs] = useState(null); const [windowId, setWindowId] = useState("last7d"); const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, statsRes, logsRes] = await Promise.all([fetch("/api/pxpipe/status", { headers: { "Cache-Control": "no-store" } }), fetch("/api/pxpipe/stats"), fetch("/api/pxpipe/logs?limit=50")]);
      setStatus(await statusRes.json()); setStats(await statsRes.json()); setLogs(await logsRes.json());
      const healthRes = await fetch("/api/pxpipe/health", { method: "POST" }); setHealth(await healthRes.json());
    } catch { /* sections render fail-open placeholders */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const w = stats?.windows?.[windowId];
  const statusLabel = !status ? "—" : !status.installed ? "Not installed" : health?.healthy ? "Healthy" : status.running ? "Running" : "Stopped";
  const refreshAction = <div className="flex flex-wrap items-center gap-2"><a href="/dashboard/token-saver" className="inline-flex min-h-10 items-center gap-2 px-2 text-sm font-medium text-[var(--color-primary)] hover:underline">Token Saver settings<ArrowUpRight size={15}/></a><Button size="sm" variant="secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""}/>{loading ? "Refreshing…" : "Refresh"}</Button></div>;
  return <div className="flex min-w-0 max-w-full flex-col gap-8 px-1 sm:px-0">
    <LedgerBand number="01" title="PXPIPE signal" summary="Compression module state and current activity" action={refreshAction}>
      <div className="grid gap-px bg-[var(--color-border-subtle)] md:grid-cols-2 xl:grid-cols-3">
        <MetricRow position="01" label="Status" value={statusLabel} icon={health?.healthy ? CheckCircle2 : CircleDashed} tone={health?.healthy ? "text-[var(--color-success)]" : status?.installed ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"} sub={status?.enabled ? "Enabled in pipeline" : "Disabled in pipeline"}/>
        <MetricRow position="02" label="Version" value={status?.version ? `v${status.version}` : "—"} icon={ImageIcon} sub="pxpipe-proxy"/>
        <MetricRow position="03" label="Uptime" value={fmtUptime(status?.uptimeMs)} icon={Clock3} sub="module loaded"/>
        <MetricRow position="04" label="Requests" value={w ? w.requests.toLocaleString() : "—"} icon={Activity}/>
        <MetricRow position="05" label="Compressed" value={w ? w.compressed.toLocaleString() : "—"} icon={Gauge} tone="text-[var(--color-success)]"/>
        <MetricRow position="06" label="Bypassed" value={w ? w.bypassed.toLocaleString() : "—"} icon={CircleDashed}/>
      </div>
    </LedgerBand>

    <LedgerBand number="02" title="Token savings" summary="Estimated body-size reduction; billed Usage remains authoritative" action={<div className="flex max-w-full flex-wrap gap-1 border border-[var(--button-border)] bg-[var(--color-surface-strong)] p-1">{WINDOW_TABS.map(tab => <button key={tab.id} onClick={() => setWindowId(tab.id)} aria-pressed={windowId === tab.id} className={`min-h-8 px-3 text-xs font-medium ${windowId === tab.id ? "bg-[var(--button-primary-bg)] text-[var(--button-primary-fg)]" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"}`}>{tab.label}</button>)}</div>}>
      <div className="grid gap-px bg-[var(--color-border-subtle)] sm:grid-cols-2 lg:grid-cols-4">
        {[["Original tokens", w ? fmtTokens(w.tokensBeforeEst) : "—"], ["After PXPIPE", w ? fmtTokens(w.tokensAfterEst) : "—"], ["Saved", w ? fmtTokens(w.tokensSavedEst) : "—", true], ["Reduction", w ? `${w.savedPct}%` : "—", true]].map(([label,value,good], i) => <div key={label} className="bg-[var(--color-surface)] p-4"><p className="text-xs text-[var(--color-text-muted)]">{label}</p><p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${good ? "text-[var(--color-success)]" : ""}`}>{value}</p></div>)}
      </div>
      <p className="border-t border-[var(--color-border-subtle)] px-4 py-3 text-xs text-[var(--color-text-muted)]">Images generated: <span className="font-mono tabular-nums">{w ? w.imagesGenerated.toLocaleString() : "—"}</span> · average compression: <span className="font-mono tabular-nums">{w ? `${w.avgCompressionMs}ms` : "—"}</span> · errors: <span className="font-mono tabular-nums">{w ? w.errors : "—"}</span></p>
    </LedgerBand>

    <LedgerBand number="03" title="Savings timeline" summary="Tokens saved over the last 30 days">
      <div className="p-4">
        {stats?.timeline?.some(d => d.tokensSavedEst > 0) ? <ResponsiveContainer width="100%" height={220}><AreaChart data={stats.timeline} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}><CartesianGrid stroke="var(--chart-grid)"/><XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--chart-axis)" }} tickFormatter={d => d.slice(5)}/><YAxis tick={{ fontSize: 11, fill: "var(--chart-axis)" }} tickFormatter={fmtTokens} width={48}/><Tooltip formatter={v => [fmtTokens(v), "Tokens saved"]}/><Area type="monotone" dataKey="tokensSavedEst" stroke="var(--chart-series-tertiary)" fill="var(--color-success-wash)" strokeWidth={2}/></AreaChart></ResponsiveContainer> : <div className="flex min-h-32 items-center justify-center gap-2 text-center text-sm text-[var(--color-text-muted)]"><CircleDashed size={18}/>No savings recorded yet. Enable PXPIPE and route a large Claude-format request.</div>}
      </div>
    </LedgerBand>

    <LedgerBand number="04" title="History" summary="Latest 50 compression decisions">
      <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-[var(--table-header-bg)] text-left text-xs text-[var(--color-text-muted)]"><tr>{["Time","Model","Original","Compressed","Saved","%","Duration","Status"].map((h,i)=><th key={h} className={`px-3 py-2 ${i>1&&i<7 ? "text-right" : ""}`}>{h}</th>)}</tr></thead><tbody className="divide-y divide-[var(--color-border-subtle)]">{(stats?.recent || []).slice(0,50).map((ev,i)=><tr key={`${ev.ts}-${i}`} className="hover:bg-[var(--table-row-hover)]"><td className="whitespace-nowrap px-3 py-2 text-[var(--color-text-muted)]">{new Date(ev.ts).toLocaleString()}</td><td className="px-3 py-2 font-mono text-xs">{ev.provider ? `${ev.provider}/${ev.model}` : ev.model || "—"}</td><td className="px-3 py-2 text-right font-mono text-xs">{ev.applied ? fmtTokens(ev.tokensBeforeEst) : "—"}</td><td className="px-3 py-2 text-right font-mono text-xs">{ev.applied ? fmtTokens(ev.tokensAfterEst) : "—"}</td><td className="px-3 py-2 text-right font-mono text-xs text-[var(--color-success)]">{ev.applied ? fmtTokens(ev.tokensSavedEst) : "—"}</td><td className="px-3 py-2 text-right font-mono text-xs">{ev.applied ? `${ev.savedPct}%` : "—"}</td><td className="px-3 py-2 text-right font-mono text-xs">{ev.durationMs != null ? `${ev.durationMs}ms` : "—"}</td><td className="px-3 py-2"><span className={`inline-flex items-center gap-2 border px-2 py-1 text-xs ${ev.applied ? "border-[var(--color-success)] bg-[var(--color-success-wash)] text-[var(--color-success)]" : ev.reason === "transform_error" || ev.reason === "timeout" ? "border-[var(--color-danger)] bg-[var(--color-danger-wash)] text-[var(--color-danger)]" : "border-[var(--color-warning)] bg-[var(--color-warning-wash)] text-[var(--color-warning)]"}`} title={ev.detail || ""}><span className={`size-2 shrink-0 ${ev.applied ? "rounded-full bg-[var(--color-success)]" : "rotate-45 bg-current"}`}/>{ev.applied ? "Compressed" : REASON_LABELS[ev.reason] || ev.reason}</span></td></tr>)}{(!stats?.recent || stats.recent.length===0)&&<tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--color-text-muted)]">No PXPIPE activity yet</td></tr>}</tbody></table></div>
    </LedgerBand>

    <LedgerBand id="logs" number="05" title="Install log" summary="PXPIPE setup output">
      <div className="p-4">{logs?.installLog ? <pre className="max-h-64 max-w-full overflow-auto border border-[var(--color-border)] bg-[var(--color-code-bg)] p-3 font-mono text-xs whitespace-pre-wrap break-words">{logs.installLog}</pre> : <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"><CircleDashed size={17}/>No install log yet.</p>}</div>
    </LedgerBand>
  </div>;
}
