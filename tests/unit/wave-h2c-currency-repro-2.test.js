// Wave H2c currency repro 2 — torn-commit shape (render race?).
// Symptom (H2): token-column headers with $-prefixed cells after a mode switch.
// Hypothesis B: header memo and row cells read different viewMode values in one
// pass (a torn commit), e.g. valueColumns memoised on the old mode while
// ValueCells render the new one.
// Harness: faithful ports of UsageTable.js valueColumns memo (141-156) and the
// ValueCells branch selector (35-70). Part 1 shows the reported symptom is
// producible ONLY with torn inputs (header from mode A, cells from mode B) —
// pinning the necessary condition. Part 2 shows every single-mode pass agrees,
// which is all a node harness can drive: viewMode is one prop, and headers +
// cells derive from it in the same component commit, so the tear cannot be
// constructed below the framework layer.
// Per brief: second bounded attempt FAILS TO REPRODUCE → data gate recorded,
// no source fix (authority requires an exact repro before touching currency
// render code; UsageTable/UsageDashboard left unedited).
import { describe, expect, it } from "vitest";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

// --- Port: UsageTable.js valueColumns memo (141-156) ---
function valueColumns(viewMode) {
  if (viewMode === "tokens") {
    return [
      { field: "promptTokens", label: "Token In" },
      { field: "cachedTokens", label: "Cached" },
      { field: "completionTokens", label: "Token Out" },
      { field: "totalTokens", label: "Total tokens" },
    ];
  }
  return [
    { field: "inputCost", label: "Input Cost" },
    { field: "cachedCost", label: "Cached Cost" },
    { field: "outputCost", label: "Output Cost" },
    { field: "cost", label: "Total Cost" },
  ];
}

// --- Port: UsageTable.js ValueCells branch selector (35-70), summary row ---
function summaryCells(viewMode, s) {
  if (viewMode === "tokens") {
    return [fmt(s.promptTokens), s.cachedTokens ? fmt(s.cachedTokens) : "—", fmt(s.completionTokens), fmt(s.totalTokens)];
  }
  return [fmtCost(s.inputCost), s.cachedCost ? fmtCost(s.cachedCost) : "—", fmtCost(s.outputCost), fmtCost(s.totalCost || s.cost)];
}

const SUMMARY = {
  promptTokens: 150000, cachedTokens: 30000, completionTokens: 45000,
  totalTokens: 195000, inputCost: 1.2, cachedCost: 0.12, outputCost: 0.6,
  totalCost: 1.92, cost: 1.92,
};

const isTokenHeaders = (cols) => cols.some((c) => /token/i.test(c.label));

describe("wave-h2c currency repro 2: torn header/cell commit", () => {
  it("pins the necessary condition: torn inputs (tokens headers + costs cells) yield the exact symptom", () => {
    const headers = valueColumns("tokens"); // stale memo
    const cells = summaryCells("costs", SUMMARY); // fresh cells
    expect(isTokenHeaders(headers)).toBe(true);
    expect(cells.some((c) => c.includes("$"))).toBe(true);
  });

  it("ATTEMPTED REPRO: single-mode passes never disagree (fails to reproduce)", () => {
    for (const mode of ["tokens", "costs"]) {
      const headers = valueColumns(mode);
      const cells = summaryCells(mode, SUMMARY);
      const headersSayTokens = isTokenHeaders(headers);
      const cellsHaveCurrency = cells.some((c) => c.includes("$"));
      // Agreement invariant: token headers <=> no currency cells.
      expect(cellsHaveCurrency).toBe(!headersSayTokens);
    }
  });
});
