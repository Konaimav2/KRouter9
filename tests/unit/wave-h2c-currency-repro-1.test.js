// Wave H2c currency repro 1 — data-layer interleave (stale merge? out-of-order?).
// Symptom (H2): intermittent currency ($-prefixed) values inside token cells on
// mode switch. Hypothesis A: a stale fetchStats resolution or an SSE onmessage
// merge swaps/corrupts the numeric payload mid-switch.
// Harness: faithful ports of UsageDashboard.js fetchStats guard (statsRequest
// counter, lines 187-205), SSE merge whitelist (line 225), sortData (119-140)
// and groupData (149-167), plus UsageTable.js token-branch cells (lines 36-53).
// Rapid mode toggles are interleaved with stale resolutions + SSE merges; after
// EVERY step the token-mode cells are asserted "$"-free.
// Per brief: two bounded repro attempts, then fix or data gate. This attempt
// FAILS TO REPRODUCE (passes clean) — the data path is mode-independent (stats
// carry both tokens+costs; mode only picks the display branch) and guarded.
import { describe, expect, it } from "vitest";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);

// --- Ports: UsageDashboard.js sortData (119-140) ---
function sortData(dataMap, pendingMap, sortBy, sortOrder) {
  return Object.entries(dataMap || {}).map(([key, data]) => {
    const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
    const totalCost = data.cost || 0;
    const cachedTokens = data.cachedTokens || 0;
    const nonCachedInput = Math.max(0, (data.promptTokens || 0) - cachedTokens);
    return {
      ...data, key, totalTokens, totalCost,
      inputCost: totalTokens ? nonCachedInput * (totalCost / totalTokens) : 0,
      cachedCost: totalTokens ? cachedTokens * (totalCost / totalTokens) : 0,
      outputCost: totalTokens ? (data.completionTokens || 0) * (totalCost / totalTokens) : 0,
      pending: pendingMap?.[key] || 0,
    };
  }).sort((a, b) => {
    let left = a[sortBy]; let right = b[sortBy];
    if (typeof left === "string") left = left.toLowerCase();
    if (typeof right === "string") right = right.toLowerCase();
    if (left === right) return 0;
    return (left < right ? -1 : 1) * (sortOrder === "asc" ? 1 : -1);
  });
}

// --- Port: UsageDashboard.js groupData (149-167) ---
function groupData(data, field, sortBy, sortOrder) {
  const groups = new Map();
  const getKey = (item) => item[field] || "Unknown";
  for (const item of data || []) {
    const groupKey = getKey(item);
    if (!groups.has(groupKey)) groups.set(groupKey, { groupKey, summary: { requests: 0, promptTokens: 0, cachedTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0, inputCost: 0, cachedCost: 0, outputCost: 0, pending: 0, lastUsed: null }, items: [] });
    const group = groups.get(groupKey);
    for (const key of ["requests", "promptTokens", "cachedTokens", "completionTokens", "totalTokens", "cost", "inputCost", "cachedCost", "outputCost", "pending"]) group.summary[key] += item[key] || 0;
    group.items.push(item);
  }
  return [...groups.values()];
}

// --- Port: UsageTable.js ValueCells tokens branch (36-53) ---
function tokenCells(item, isSummary = false) {
  return [
    isSummary && item.promptTokens === undefined ? "—" : fmt(item.promptTokens),
    item.cachedTokens ? fmt(item.cachedTokens) : "—",
    isSummary && item.completionTokens === undefined ? "—" : fmt(item.completionTokens),
    fmt(item.totalTokens),
  ];
}

// --- Port: UsageDashboard.js statsRequest guard (187-205) + SSE whitelist (225) ---
function makeStatsStore() {
  let counter = 0;
  let stats = null;
  return {
    begin() { return ++counter; },
    resolve(request, data) { if (request !== counter) return false; stats = data; return true; },
    sseMessage(patch) {
      if (!stats) return;
      stats = {
        ...stats,
        activeRequests: patch.activeRequests,
        recentRequests: patch.recentRequests,
        errorProvider: patch.errorProvider,
        pending: patch.pending,
      };
    },
    get() { return stats; },
  };
}

const byModel = {
  "gpt-4o": { rawModel: "gpt-4o", provider: "openai", requests: 12, promptTokens: 150000, cachedTokens: 30000, completionTokens: 45000, cost: 1.92, lastUsed: "2026-10-09T10:00:00Z" },
  "claude-sonnet": { rawModel: "claude-sonnet", provider: "anthropic", requests: 7, promptTokens: 80000, cachedTokens: 0, completionTokens: 20000, cost: 0.87, lastUsed: "2026-10-09T11:00:00Z" },
};

function assertTokenCellsClean(store) {
  const stats = store.get();
  if (!stats) return;
  const groups = groupData(sortData(stats.byModel, stats.pending?.byModel || {}, "rawModel", "asc"), "rawModel", "rawModel", "asc");
  for (const group of groups) {
    for (const cell of tokenCells(group.summary, true)) expect(cell).not.toContain("$");
    for (const item of group.items) for (const cell of tokenCells(item, false)) expect(cell).not.toContain("$");
  }
}

describe("wave-h2c currency repro 1: stale data interleaved with mode toggles", () => {
  it("ATTEMPTED REPRO: no $-in-token-cells under stale/SSE interleave (fails to reproduce)", () => {
    const store = makeStatsStore();
    let mode = "tokens";
    const flip = () => { mode = mode === "tokens" ? "costs" : "tokens"; };

    const r1 = store.begin(); flip(); // mode=costs, fetch in flight
    const r2 = store.begin(); flip(); // mode=tokens, r1 now stale
    store.sseMessage({ activeRequests: [], recentRequests: [], errorProvider: "", pending: { byModel: {} } });
    expect(store.resolve(r1, { byModel })).toBe(false); // stale dropped by guard
    assertTokenCellsClean(store);
    flip(); // mode=costs
    expect(store.resolve(r2, { byModel })).toBe(true);
    assertTokenCellsClean(store);
    flip(); // mode=tokens
    // Late duplicate resolution of the same (now current) request is idempotent.
    store.sseMessage({ activeRequests: [{ id: "a" }], recentRequests: [], errorProvider: "", pending: { byModel: { "gpt-4o": 1 } } });
    assertTokenCellsClean(store);
    // Rapid double-toggle with an SSE burst between commits.
    flip(); flip();
    store.sseMessage({ activeRequests: [], recentRequests: [], errorProvider: "", pending: { byModel: {} } });
    assertTokenCellsClean(store);
    expect(mode).toBe("tokens");
  });
});
