"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const fmtTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n || 0);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

export default function UsageChart({ period = "7d", viewMode = "tokens", scopeQuery }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const requestId = useRef(0);
  const query = scopeQuery || new URLSearchParams({ period }).toString();
  const chartMode = viewMode === "costs" ? "cost" : "tokens";

  const fetchData = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/usage/chart?${query}`);
      if (!res.ok) throw new Error("Usage trend could not be refreshed.");
      const json = await res.json();
      if (request !== requestId.current) return;
      setData(json);
      setLoaded(true);
    } catch {
      if (request === requestId.current) setError("Usage trend could not be refreshed. Existing data is still shown.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    // Loading follows the URL-derived scope; older responses cannot replace it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    return () => { requestId.current += 1; };
  }, [fetchData]);

  // Gate on the metric actually being displayed. Testing tokens OR cost would let a
  // zero-cost period render an all-zero cost chart just because tokens moved.
  const hasData = chartMode === "cost"
    ? data.some((d) => Number(d.cost) > 0)
    : data.some((d) => Number(d.tokens) > 0);

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      {loading && (loaded || data.length > 0) && <span role="status" className="text-xs text-[var(--color-text-muted)]">Refreshing…</span>}
      {error && <div role="alert" className="text-sm text-[var(--color-danger)]">{error} <button type="button" className="inline-flex min-h-[var(--touch-min)] items-center px-2 underline" onClick={fetchData}>Retry</button></div>}
      {loading && !loaded && !data.length ? (
        <div className="space-y-3 py-3" role="status" aria-busy="true">
          <span className="sr-only">Loading usage trend</span>
          {Array.from({ length: 5 }, (_, index) => <div key={index} aria-hidden="true" className="h-7 animate-pulse motion-reduce:animate-none bg-[var(--color-surface-strong)]" />)}
        </div>
      ) : !hasData ? (
        error ? null : (
          <div className="flex h-48 flex-col items-center justify-center gap-1 px-4 text-center text-sm text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text)]">
              {chartMode === "cost" ? "No measured cost in this period" : "No token usage in this period"}
            </span>
            <span>
              {chartMode === "cost"
                ? "Switch to Tokens to see traffic, or widen the period."
                : "Widen the period or clear the scope filter."}
            </span>
          </div>
        )
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", fillOpacity: 0.5 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={chartMode === "tokens" ? fmtTokens : fmtCost}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value, name) =>
                name === "tokens" ? [fmtTokens(value), "Tokens"] : [fmtCost(value), "Cost"]
              }
            />
            {chartMode === "tokens" ? (
              <Area
                type="monotone"
                dataKey="tokens"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#gradTokens)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#f59e0b"
                strokeWidth={2}
                fill="url(#gradCost)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    {hasData && (
        <div className="overflow-x-auto border-t border-border pt-3" tabIndex={0} role="region" aria-label="Usage trend data table">
          <table className="w-full min-w-[420px] text-xs"><thead><tr><th className="p-2 text-left">Period</th><th className="p-2 text-right">{chartMode === "tokens" ? "Tokens" : "Cost (USD)"}</th></tr></thead><tbody>{data.map((point, index) => <tr key={`${point.label}-${index}`} className="border-t border-border"><td className="p-2">{point.label}</td><td className="p-2 text-right font-mono tabular-nums">{chartMode === "tokens" ? fmtTokens(point.tokens) : fmtCost(point.cost)}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

UsageChart.propTypes = {
  period: PropTypes.string,
  scopeQuery: PropTypes.string,
  viewMode: PropTypes.oneOf(["tokens", "costs"]),
};
