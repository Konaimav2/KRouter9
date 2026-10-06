"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { aggregatePerKey, sortPerKeyRows } from "./usageMeta.js";

const COLUMNS = [
  { key: "keyName", label: "API key", align: "left" },
  { key: "requests", label: "Requests", align: "right" },
  { key: "totalTokens", label: "Tokens", align: "right" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "lastUsed", label: "Last used", align: "right" },
];

const fmt = (value) => new Intl.NumberFormat().format(Number(value) || 0);
const fmtTime = (value) => value ? new Date(value).toLocaleString() : "—";

export default function PerKeyUsageSection({ period }) {
  const [rows, setRows] = useState([]);
  const [sortBy, setSortBy] = useState("cost");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedKey, setExpandedKey] = useState(null);

  const fetchRows = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/usage/stats?period=${encodeURIComponent(period)}`, { signal });
      if (!response.ok) throw new Error(`Per-key usage failed (${response.status})`);
      const data = await response.json();
      setRows(aggregatePerKey(data?.byApiKey));
    } catch (fetchError) {
      if (fetchError?.name !== "AbortError") setError(fetchError?.message || "Failed to load per-key usage.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    // Data loading is intentionally initiated when the selected period changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(controller.signal);
    return () => controller.abort();
  }, [fetchRows]);

  const sortedRows = useMemo(
    () => sortPerKeyRows(rows, sortBy, sortOrder),
    [rows, sortBy, sortOrder]
  );

  const toggleSort = (field) => {
    if (sortBy === field) setSortOrder((order) => order === "asc" ? "desc" : "asc");
    else {
      setSortBy(field);
      setSortOrder(field === "keyName" ? "asc" : "desc");
    }
  };

  const maxRequests = Math.max(1, ...sortedRows.map((row) => row.requests || 0));

  return (
    <section className="min-w-0 border border-border bg-surface">
      <header className="flex min-h-11 items-center gap-3 border-b border-border bg-surface-2 px-4 py-3">
        <span className="font-mono text-xs tabular-nums text-text-muted">KEYS</span>
        <h2 className="font-semibold">Usage by API key</h2>
        <span className="ml-auto text-xs text-text-muted">{period}</span>
      </header>
      {error && (
        <div className="border-b border-danger bg-danger/10 p-3 text-sm text-danger">
          {error} <button type="button" onClick={() => fetchRows(new AbortController().signal)} className="font-semibold underline">Retry</button>
        </div>
      )}
      {loading ? (
        <div className="space-y-px bg-border" aria-label="Loading per-key usage">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 animate-pulse bg-surface" />)}
        </div>
      ) : sortedRows.length === 0 ? (
        <p className="p-8 text-center text-sm text-text-muted">No API key usage recorded for this period.</p>
      ) : (
        <div className="divide-y divide-border">
          {sortedRows.map((row) => {
            const open = expandedKey === row.keyName;
            return (
              <article key={`${row.keyName}:${row.apiKeyMasked || "local"}`} className="grid gap-4 p-4 lg:grid-cols-[minmax(180px,1fr)_minmax(280px,2fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold">{row.keyName || "Unknown key"}</h3>
                  <p className="mt-1 font-mono text-xs text-text-muted">{row.apiKeyMasked || "Local request"}</p>
                  <p className="mt-2 text-xs text-text-muted">{row.providers.length ? row.providers.join(" · ") : "Provider unavailable"}</p>
                </div>
                <div className="min-w-0">
                  <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <span><b className="font-mono tabular-nums">{fmt(row.requests)}</b> requests</span>
                    <span><b className="font-mono tabular-nums">{fmt(row.totalTokens)}</b> tokens</span>
                    <span><b className="font-mono tabular-nums">${(Number(row.cost) || 0).toFixed(4)}</b></span>
                    <span className="text-text-muted">{fmtTime(row.lastUsed)}</span>
                  </div>
                  <div className="h-10 border border-border bg-surface-2 p-1" role="img" aria-label={`${fmt(row.requests)} requests for ${row.keyName}`}>
                    <div className="h-full bg-primary/20 border-r-2 border-primary" style={{ width: `${Math.max(3, (row.requests / maxRequests) * 100)}%` }} />
                  </div>
                </div>
                <button type="button" className="min-h-11 border border-border px-3 text-sm font-semibold text-primary hover:bg-primary/10" aria-expanded={open} onClick={() => setExpandedKey(open ? null : row.keyName)}>
                  {open ? "Close details" : "Open details"}
                </button>
                {open && (
                  <div className="border-t border-border pt-4 lg:col-span-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {row.series.map((point, index) => (
                        <div key={`${point.provider}:${point.model}:${index}`} className="border-l-2 border-primary px-3 py-2">
                          <p className="break-words font-mono text-xs">{point.model}</p>
                          <p className="mt-1 text-xs text-text-muted">{point.provider} · {fmt(point.requests)} requests · {fmt(point.totalTokens)} tokens</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="sr-only" aria-live="polite">Sorted by {COLUMNS.find((column) => column.key === sortBy)?.label}, {sortOrder === "asc" ? "ascending" : "descending"}.</div>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface-2 p-3" aria-label="Sort API keys">
        {COLUMNS.map((column) => <button key={column.key} type="button" onClick={() => toggleSort(column.key)} className={`min-h-9 border px-3 text-xs ${sortBy === column.key ? "border-primary text-primary" : "border-border text-text-muted"}`}>{column.label}{sortBy === column.key ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}</button>)}
      </div>
    </section>
  );
}
