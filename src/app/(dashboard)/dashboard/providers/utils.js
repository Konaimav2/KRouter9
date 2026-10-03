export const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "none", label: "No connection" },
];

// noAuth providers (e.g. free proxies) are always usable even though they
// never have a stored connection record, so they never fall into "none".
export function getConnectionStatus(stats, isNoAuth = false) {
  if (isNoAuth) return "active";
  if (!stats || stats.total === 0) return "none";
  return stats.allDisabled ? "inactive" : "active";
}

export function matchesStatusFilter(statusFilter, stats, isNoAuth = false) {
  if (statusFilter === "all") return true;
  return getConnectionStatus(stats, isNoAuth) === statusFilter;
}

export function buildCustomProviderDisplaySlugs(nodes = []) {
  const seen = new Map();
  return new Map(nodes.map((node) => {
    const dashedName = String(node?.name || node?.id || "custom")
      .trim()
      .replace(/\s+/g, "-");
    const base = `provider/${dashedName || "custom"}`;
    const dedupeKey = base.toLocaleLowerCase();
    const occurrence = (seen.get(dedupeKey) || 0) + 1;
    seen.set(dedupeKey, occurrence);
    return [node.id, occurrence === 1 ? base : `${base}-${occurrence}`];
  }));
}
