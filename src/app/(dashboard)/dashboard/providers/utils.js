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

// F16-routes: URL slugs for custom provider pages (`providers/custom-<slug>`).
// Lowercase, spaces→dashes, existing dashes preserved. No DB changes — derived
// at read time; collisions resolved deterministically in list order.
export function slugifyCustomProviderName(name) {
  const slug = String(name || "custom").trim().toLowerCase().replace(/\s+/g, "-");
  return slug || "custom";
}

export function buildCustomProviderRouteSlugs(nodes = []) {
  const seen = new Map();
  return new Map(nodes.map((node) => {
    const base = `custom-${slugifyCustomProviderName(node?.name || node?.id)}`;
    const dedupeKey = base.toLowerCase();
    const occurrence = (seen.get(dedupeKey) || 0) + 1;
    seen.set(dedupeKey, occurrence);
    return [node.id, occurrence === 1 ? base : `${base}-${occurrence}`];
  }));
}

// Dual-resolve a `[id]` route param: legacy node ids match directly (existing
// bookmarks keep working), `custom-<slug>` params resolve via the route map.
// Returns the node id, or null when the param matches nothing.
export function resolveCustomProviderId(nodes = [], param) {
  if (!param) return null;
  const list = Array.isArray(nodes) ? nodes : [];
  if (list.some((node) => node?.id === param)) return param;
  const slugs = buildCustomProviderRouteSlugs(list);
  for (const [id, slug] of slugs) {
    if (slug === param) return id;
  }
  return null;
}
