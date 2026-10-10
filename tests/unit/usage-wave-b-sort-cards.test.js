import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { compile, hooks, nodes, marker, named, passthrough, propTypes } from "./usage-wave-b-harness.js";
const fixture = { byModel: { a: { rawModel: "A", promptTokens: 100, completionTokens: 0, cost: 4 }, b: { rawModel: "B", promptTokens: 1, completionTokens: 0, cost: 3 }, c: { rawModel: "B", promptTokens: 1, completionTokens: 0, cost: 3 } } };
function dashboard(h, query = "sortBy=cost&sortOrder=desc") {
  return compile("components/UsageDashboard.js", { react: h.react, "next/link": passthrough, "next/navigation": { useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(query) }, "@/shared/components/Badge": passthrough, "lucide-react": { CircleCheck: () => null, CircleX: () => null }, "@/shared/constants/providers": { AI_PROVIDERS: {}, FREE_PROVIDERS: {} }, "./OverviewCards": { __esModule: true, default: marker("cards") }, "./UsageChart": { __esModule: true, default: marker("chart") }, "./UsageTable": { __esModule: true, default: marker("table"), fmt: String, fmtTime: String }, "next/dynamic": { __esModule: true, default: () => () => null } }).default;
}
describe("F16 sort and replacement", () => {
  it("mode switch clears cross-mode URL sorting", () => { let next; const h = hooks(); const { UsageContent } = compile("page.js", { react: h.react, "next/navigation": { useSearchParams: () => new URLSearchParams("mode=costs&sortBy=inputCost&sortOrder=desc&table=model"), useRouter: () => ({ push: (url) => { next = new URL(url, "http://local").searchParams; } }) }, "@/shared/components": { SegmentedControl: marker("control") }, ...Object.fromEntries(["UsageDashboard", "UsageLogs", "RequestDetailsTab", "PerKeyUsageSection"].map((n) => [`./components/${n}`, () => null])) }, "\nexport { UsageContent };"); const tree = h.render(UsageContent); nodes(tree, named("control")).find((n) => n.props.options.some((o) => o.value === "tokens")).props.onChange("tokens"); expect(next.get("mode")).toBe("tokens"); expect(next.has("sortBy")).toBe(false); expect(next.has("sortOrder")).toBe(false); expect(next.get("table")).toBe("model"); });
  it("cost headers dispatch actual displayed cost fields", () => { const h = hooks(); const fn = compile("components/UsageTable.js", { react: h.react, "prop-types": propTypes, "lucide-react": { ArrowDown: () => null, ArrowUp: () => null, ArrowUpDown: () => null, ChevronRight: () => null } }).default; const calls = []; const tree = h.render(fn, { title: "", columns: [], groupedData: [], sortBy: "rawModel", sortOrder: "asc", viewMode: "costs", onToggleSort: (_, f) => calls.push(f), tableType: "model", renderSummaryCells: () => null, renderDetailCells: () => null }); nodes(tree, (n) => n.type === "button").forEach((n) => n.props.onClick()); expect(calls).toEqual(["inputCost", "cachedCost", "outputCost", "cost"]); expect(renderToStaticMarkup(tree)).toContain("Total Cost"); });
  it("groups sort by aggregate totals rather than first sorted member", () => { const h = hooks(["model", fixture, [], false, false, "", false]); const tree = h.render(dashboard(h), { period: "7d", mode: "costs" }); expect(nodes(tree, named("table"))[0].props.groupedData.map((g) => g.groupKey)).toEqual(["B", "A"]); });
  it("refresh replaces absent fields instead of retaining stale maps", async () => { const h = hooks(["model", { ...fixture, byApiKey: { stale: {} } }, [], false, false, "", false]); const fn = dashboard(h); h.render(fn, { period: "7d", mode: "costs" }); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ byModel: {} }) }))); await h.effects[0](); await Promise.resolve(); await Promise.resolve(); expect(h.states[1]).toEqual({ byModel: {} }); vi.unstubAllGlobals(); });
});
describe("F15 overview mode/density", () => {
  const stats = { totalRequests: 3, totalPromptTokens: 100, totalCompletionTokens: 50, totalCachedTokens: 20, totalCost: 15 };
  const cards = (props) => { const fn = compile("components/OverviewCards.js", { "prop-types": propTypes, "@/shared/components/Card": ({ children, className }) => React.createElement("div", { className }, children) }).default; return renderToStaticMarkup(React.createElement(fn, { stats, ...props })); };
  it("Costs uses cost KPIs with estimation disclosure", () => { const html = cards({ viewMode: "costs" }); expect(html).toContain("Input Cost"); expect(html).toContain("Output Cost"); expect(html).toContain("Total Cost"); expect(html).not.toContain("Input Tokens"); expect(html).toContain("$15.00"); expect(html).toContain("Estimated, not actual billing"); });
  it("Tokens uses token KPIs", () => { const html = cards({ viewMode: "tokens" }); expect(html).toContain("Input Tokens"); expect(html).toContain("Output Tokens"); expect(html).toContain("Total Tokens"); expect(html).not.toContain("$15.00"); });
  it("compact density reduces gaps and padding", () => { expect(cards({ density: "compact" })).not.toEqual(cards({ density: "comfortable" })); expect(cards({ density: "compact" })).toContain("px-3 py-2"); });
});

it("overview stats and trend use exactly the same custom scope", async () => {
  const h = hooks(["model", fixture, [], false, false, "", false]);
  const scopeQuery = new URLSearchParams({ period: "today", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-02T00:00:00.000Z" }).toString();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => fixture })));
  const tree = h.render(dashboard(h), { period: "today", mode: "costs", scopeQuery });
  expect(nodes(tree, named("chart"))[0].props.scopeQuery).toBe(scopeQuery);
  await h.effects[0]();
  expect(fetch.mock.calls[0][0]).toBe(`/api/usage/stats?${scopeQuery}`);
  vi.unstubAllGlobals();
});
