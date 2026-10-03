"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { aggregatePerKey, sortPerKeyRows } from "./usageMeta.js";

const COLUMNS = [
  { key: "keyName", label: "API key", align: "left" },
  { key: "apiKeyMasked", label: "Masked key", align: "left" },
  { key: "requests", label: "Requests", align: "right" },
  { key: "promptTokens", label: "Input", align: "right" },
  { key: "cachedTokens", label: "Cached", align: "right" },
  { key: "completionTokens", label: "Output", align: "right" },
  { key: "totalTokens", label: "Total tokens", align: "right" },
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
      setSortOrder(field === "keyName" || field === "apiKeyMasked" ? "asc" : "desc");
    }
  };

  return (
    <section className="ledger-band min-w-0">
      <header className="ledger-caption">
        <span className="ledger-number">01</span>
        <h2 className="font-semibold">Usage by API key</h2>
        <span className="ml-auto text-xs text-[var(--color-text-muted)]">{period}</span>
      </header>
      {error && (
        <div className="border-b border-[var(--ledger-rule)] p-3 text-sm text-[var(--color-danger)]">
          {error} <button type="button" onClick={() => fetchRows(new AbortController().signal)} className="font-semibold underline">Retry</button>
        </div>
      )}
      <div className="max-w-full overflow-x-auto overscroll-x-contain" role="region" aria-label="Per-key usage table; scroll horizontally for additional columns" tabIndex={0}>
        <table className="w-full min-w-[1040px]">
          <thead>
            <tr className="border-b border-[var(--ledger-rule)]">
              {COLUMNS.map((column) => (
                <th key={column.key} className={`px-4 py-3 text-${column.align} text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]`}>
                  <button type="button" onClick={() => toggleSort(column.key)} className="inline-flex items-center gap-1 hover:text-[var(--color-text)]" aria-label={`Sort by ${column.label}`}>
                    {column.label}
                    {sortBy === column.key && <span aria-hidden="true">{sortOrder === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }, (_, index) => <tr key={index} aria-hidden="true"><td colSpan={COLUMNS.length} className="h-12 animate-pulse border-b border-[var(--ledger-rule)] bg-[var(--color-surface-strong)]" /></tr>)
            ) : sortedRows.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="p-8 text-center text-sm text-[var(--color-text-muted)]">No API key usage recorded for this period.</td></tr>
            ) : sortedRows.map((row) => (
              <tr key={`${row.keyName}:${row.apiKeyMasked || "local"}`} className="border-b border-[var(--ledger-rule)] last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium">{row.keyName || "Unknown key"}</td>
                <td className="px-4 py-3 font-mono text-sm text-[var(--color-text-muted)]">{row.apiKeyMasked || "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{fmt(row.requests)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{fmt(row.promptTokens)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{fmt(row.cachedTokens)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{fmt(row.completionTokens)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">{fmt(row.totalTokens)}</td>
                <td className="px-4 py-3 text-right font-mono text-sm">${(Number(row.cost) || 0).toFixed(4)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-[var(--color-text-muted)]">{fmtTime(row.lastUsed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
