import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, it, expect, vi } from "vitest";
import { compile, hooks, nodes, marker, named, propTypes, passthrough } from "./usage-wave-b-harness.js";
const chartMocks = Object.fromEntries(["AreaChart", "Area", "XAxis", "YAxis", "CartesianGrid", "Tooltip", "ResponsiveContainer"].map((n) => [n, passthrough]));
function page(search = "") {
  const h = hooks(), router = { push: vi.fn() }; let params = new URLSearchParams(search);
  const fn = compile("page.js", { react: h.react, "next/navigation": { useSearchParams: () => params, useRouter: () => router }, "@/shared/components": { SegmentedControl: marker("control") }, ...Object.fromEntries(["UsageDashboard", "UsageLogs", "RequestDetailsTab", "PerKeyUsageSection"].map((n) => [`./components/${n}`, { __esModule: true, default: marker(n) }])) }, "\nexport { UsageContent };").UsageContent;
  return { h, router, render: () => h.render(fn), navigate: (s) => { params = new URLSearchParams(s); } };
}
const submit = (tree, startDate, endDate) => nodes(tree, (n) => n.type === "form")[0].props.onSubmit({ preventDefault() {}, currentTarget: { elements: { startDate: { value: startDate }, endDate: { value: endDate } } } });
afterEach(() => vi.unstubAllGlobals());
describe("F23 custom range URL state", () => {
  it("overview and keys expose labeled datetime controls, never Details/Logs", () => { for (const tab of ["overview", "keys"]) { const tree = page(`tab=${tab}`).render(); expect(nodes(tree, (n) => n.type === "input" && n.props.type === "datetime-local")).toHaveLength(2); expect(nodes(tree, (n) => n.type === "label").map((n) => n.props.children)).toEqual(expect.arrayContaining(["Start", "End"])); } for (const tab of ["details", "logs"]) expect(nodes(page(`tab=${tab}`).render(), (n) => n.type === "form")).toHaveLength(0); });
  it("valid apply stores ISO dates and preserves unrelated state", () => { const p = page("tab=keys&mode=tokens&table=apiKey"); submit(p.render(), "2026-09-01T10:00", "2026-09-02T12:00"); const params = new URL(p.router.push.mock.calls[0][0], "http://local").searchParams; expect(params.get("startDate")).toBe(new Date("2026-09-01T10:00").toISOString()); expect(params.get("endDate")).toBe(new Date("2026-09-02T12:00").toISOString()); expect(params.get("tab")).toBe("keys"); expect(params.get("mode")).toBe("tokens"); });
  it.each([["", ""], ["invalid", "2026-09-02T12:00"], ["2026-09-02T12:00", "2026-09-01T10:00"], ["2026-01-01T00:00", "2026-04-01T00:00"]])("rejects invalid inputs %s/%s without navigation", (a, b) => { const p = page(); submit(p.render(), a, b); expect(p.router.push).not.toHaveBeenCalled(); expect(renderToStaticMarkup(p.render())).toContain('role="alert"'); });
  it("accepts exactly 60 days and zero-length range", () => { for (const end of ["2026-03-02T00:00", "2026-01-01T00:00"]) { const p = page(); submit(p.render(), "2026-01-01T00:00", end); expect(p.router.push).toHaveBeenCalledOnce(); } });
  it("preset clears applied range and back navigation restores URL period", () => { const p = page("period=7d&startDate=2026-09-01T00:00:00Z&endDate=2026-09-02T00:00:00Z"); nodes(p.render(), named("control")).find((n) => n.props.options.some((o) => o.value === "30d")).props.onChange("30d"); const query = new URL(p.router.push.mock.calls[0][0], "http://local").searchParams; expect(query.has("startDate")).toBe(false); expect(query.has("endDate")).toBe(false); p.navigate("period=60d"); expect(nodes(p.render(), named("UsageDashboard"))[0].props.period).toBe("60d"); });
  it("URL custom range reaches both overview and keys scope props", () => { for (const tab of ["overview", "keys"]) { const tree = page(`tab=${tab}&startDate=2026-09-01T00:00:00Z&endDate=2026-09-02T00:00:00Z`).render(); const query = new URLSearchParams(nodes(tree, named(tab === "keys" ? "PerKeyUsageSection" : "UsageDashboard"))[0].props.scopeQuery); expect(query.get("startDate")).toBe("2026-09-01T00:00:00.000Z"); expect(query.get("endDate")).toBe("2026-09-02T00:00:00.000Z"); } });
  it("invalid deep-linked range shows recovery, does not mount fetching surface", () => { const tree = page("startDate=2026-09-01").render(); expect(nodes(tree, named("UsageDashboard"))).toHaveLength(0); expect(renderToStaticMarkup(tree)).toContain('role="alert"'); });
});
describe("F21 region loading and F23 requests", () => {
  it("chart keeps stale trend/table with inline refresh feedback", () => { const h = hooks([[{ label: "old", tokens: 45, cost: 2 }], true]); const fn = compile("components/UsageChart.js", { react: h.react, "prop-types": propTypes, recharts: chartMocks }).default; const html = renderToStaticMarkup(h.render(fn, { period: "7d" })); expect(html).toContain("old"); expect(html).toContain("Refreshing"); expect(html).not.toContain("Loading usage trend"); });
  it("keys keep stale selected metrics with inline feedback", () => { const h = hooks([[{ keyName: "Build", requests: 3, series: [] }], "Build", "", "provider", true, "", false]); const fn = compile("components/PerKeyUsageSection.js", { react: h.react, "./usageMeta.js": { aggregatePerKey: (v) => v } }).default; const html = renderToStaticMarkup(h.render(fn, { period: "7d" })); expect(html).toContain("Build"); expect(html).toContain("Refreshing"); expect(html).not.toContain("Loading API-key usage"); });
  it("initial keys skeleton retains region heading", () => { const h = hooks(); const fn = compile("components/PerKeyUsageSection.js", { react: h.react, "./usageMeta.js": { aggregatePerKey: (v) => v } }).default; expect(renderToStaticMarkup(h.render(fn, { period: "7d" }))).toMatch(/<h2[^>]*>Keys<\/h2>/); });
  it("empty keys after failed load show error/retry rather than no-keys success", () => { const h = hooks([[], "", "", "provider", false, "failed", false]); const fn = compile("components/PerKeyUsageSection.js", { react: h.react, "./usageMeta.js": { aggregatePerKey: (v) => v } }).default; const html = renderToStaticMarkup(h.render(fn, { period: "7d" })); expect(html).toContain("Retry"); expect(html).toContain('role="alert"'); expect(html).not.toContain("No API keys"); });
  it.each(["chart", "keys"])("%s fetch encodes shared custom scope", async (kind) => { const h = hooks(); const fn = kind === "chart" ? compile("components/UsageChart.js", { react: h.react, "prop-types": propTypes, recharts: chartMocks }).default : compile("components/PerKeyUsageSection.js", { react: h.react, "./usageMeta.js": { aggregatePerKey: () => [] } }).default; const query = new URLSearchParams({ period: "7d", startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-02T00:00:00.000Z" }).toString(); vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => kind === "chart" ? [] : { byApiKey: {} } }))); h.render(fn, { period: "7d", scopeQuery: query }); h.effects[0](); await Promise.resolve(); await Promise.resolve(); expect(fetch.mock.calls[0][0]).toBe(`/api/usage/${kind === "chart" ? "chart" : "stats"}?${query}`); });
});

describe("scope race protection", () => {
  it("chart ignores a late old-scope response", async () => {
    const h = hooks();
    const fn = compile("components/UsageChart.js", { react: h.react, "prop-types": propTypes, recharts: chartMocks }).default;
    const completions = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => completions.push(resolve))));
    h.render(fn, { period: "7d" }); h.effects[0]();
    h.render(fn, { period: "30d" }); h.effects[0]();
    completions[1]({ ok: true, json: async () => [{ label: "current", tokens: 7 }] });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    completions[0]({ ok: true, json: async () => [{ label: "old", tokens: 1 }] });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.states[0]).toEqual([{ label: "current", tokens: 7 }]);
  });
  it("chart and keys keep completed empty regions when refreshing", () => {
    const chartH = hooks([[], true, "", true]);
    const chart = compile("components/UsageChart.js", { react: chartH.react, "prop-types": propTypes, recharts: chartMocks }).default;
    const chartHtml = renderToStaticMarkup(chartH.render(chart, { period: "7d" }));
    expect(chartHtml).toContain("Refreshing"); expect(chartHtml).not.toContain("Loading usage trend");
    const keyH = hooks([[], "", "", "provider", true, "", false, true]);
    const keys = compile("components/PerKeyUsageSection.js", { react: keyH.react, "./usageMeta.js": { aggregatePerKey: () => [] } }).default;
    const keyHtml = renderToStaticMarkup(keyH.render(keys, { period: "7d" }));
    expect(keyHtml).toContain("Refreshing"); expect(keyHtml).not.toContain("Loading API-key usage");
  });
});
