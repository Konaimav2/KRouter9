"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

export default function OverviewCards({ stats, viewMode = "tokens", density = "comfortable" }) {
  const costs = viewMode === "costs";
  // Match the breakdown's cache-inclusive proportional cost estimates.
  const totalTokens = (stats.totalPromptTokens || 0) + (stats.totalCompletionTokens || 0);
  const unitCost = totalTokens ? (stats.totalCost || 0) / totalTokens : 0;
  const metrics = [
    ["Total Requests", fmt(stats.totalRequests), ""],
    [costs ? "Input Cost" : "Input Tokens", costs ? fmtCost(Math.max(0, (stats.totalPromptTokens || 0) - (stats.totalCachedTokens || 0)) * unitCost) : fmt(stats.totalPromptTokens), "text-success"],
    [costs ? "Cached Cost" : "Cached Tokens", costs ? fmtCost((stats.totalCachedTokens || 0) * unitCost) : fmt(stats.totalCachedTokens), "text-info"],
    [costs ? "Output Cost" : "Output Tokens", costs ? fmtCost((stats.totalCompletionTokens || 0) * unitCost) : fmt(stats.totalCompletionTokens), "text-danger"],
    [costs ? "Total Cost" : "Total Tokens", costs ? fmtCost(stats.totalCost) : fmt(totalTokens), costs ? "text-warning" : ""],
  ];
  const compact = density === "compact";
  return <div data-density={density} className={`grid min-w-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 ${compact ? "gap-2" : "gap-3 sm:gap-4"}`}>
    {metrics.map(([label, value, tone], index) => <Card key={label} padding="none" className={`flex min-w-0 flex-col gap-1 ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
      <span className="text-text-muted text-sm uppercase font-semibold">{label}</span>
      <span className={`break-all font-mono tabular-nums font-bold ${compact ? "text-xl" : "text-2xl"} ${tone}`}>{value}</span>
      {costs && index === 4 && <span className="text-xs text-text-muted">Estimated, not actual billing</span>}
    </Card>)}
  </div>;
}

OverviewCards.propTypes = {
  stats: PropTypes.object.isRequired,
  viewMode: PropTypes.oneOf(["tokens", "costs"]),
  density: PropTypes.oneOf(["comfortable", "compact"]),
};
