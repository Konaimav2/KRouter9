import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it, vi } from "vitest";
import * as utils from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

const path = new URL("../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/index.js", import.meta.url);
const states = []; let cursor = 0;
const testReact = { ...React, useEffect: () => {}, useCallback: (fn) => fn, useMemo: (fn) => fn(), useRef: (v) => ({ current: v }), useState: (v) => {
  const i = cursor++; if (!(i in states)) states[i] = v;
  return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }];
} };
const Stub = ({ children }) => React.createElement("div", null, children);
const mocks = {
  react: testReact, "./utils": utils, "./QuotaTable": { default: ({ quotas }) => React.createElement("div", null, "Quota detail table", quotas.map((row) => React.createElement("span", { key: row.name }, `Table row: ${row.name}`))) },
  "@/shared/components/Icon": { default: () => null }, "@/shared/components/ProviderIcon": { default: () => null },
  "@/shared/components/Toggle": { default: () => null }, "@/shared/components/Tooltip": { default: Stub }, "@/shared/components/Card": { default: Stub },
  "@/shared/components": { ConfirmModal: () => null, EditConnectionModal: () => null },
  "@/shared/constants/providers": { USAGE_SUPPORTED_PROVIDERS: ["codex"] },
  "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copy: vi.fn() }) },
  "@/shared/utils/errorClass": { normalizeErrorClass: () => "unknown", errorClassLabel: () => "Unknown" },
};
for (const value of Object.values(mocks)) { if (value?.default) value.__esModule = true; }
const mod = { exports: {} };
const compiled = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
new Function("require", "module", "exports", "React", compiled)((name) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, mod, mod.exports, testReact);
function tree() { cursor = 0; return mod.exports.default(); }
function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const result = find(child, predicate); if (result) return result; } return null; }
function seed() {
  states.length = 0; tree();
  // Locate the actual initial values rather than pinning new hooks to indexes.
  states[0] = [{ id: "c1", provider: "codex", name: "Long account name ".repeat(12) }];
  states[1] = { c1: { quotas: [{ name: "Weekly", used: 1, total: 20 }] } };
  const totalIndex = states.findIndex((v) => v?.eligibleConnections === 0);
  states[totalIndex] = { eligibleConnections: 1, providerFilteredConnections: 1 };
}
describe("Wave C quota UI", () => {
  it("requests name order by default and expiry only on opt-in", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ connections: [] }) }));
    const params = { targetPage: 1, pageSize: 24, accountFilter: "all", providerFilter: "all" };
    await mod.exports.fetchConnectionsPage(params, fetcher);
    expect(new URL(fetcher.mock.calls[0][0], "http://localhost").searchParams.get("sort")).toBe("name");
    await mod.exports.fetchConnectionsPage({ ...params, expiringFirst: true }, fetcher);
    expect(new URL(fetcher.mock.calls[1][0], "http://localhost").searchParams.get("sort")).toBe("expiring");
  });
  it("offers a visible A-Z mode and collapses quota bodies without losing accounts", () => {
    seed(); let current = tree();
    expect(renderToStaticMarkup(current)).toContain("A-Z");
    const button = find(current, (n) => n.type === "button" && n.props["aria-label"] === "Collapse quota details");
    expect(button).toBeTruthy();
    button.props.onClick(); current = tree();
    expect(renderToStaticMarkup(current)).not.toContain("Quota detail table");
    expect(renderToStaticMarkup(current)).toContain("Long account name");
    const expand = find(current, (n) => n.type === "button" && n.props["aria-label"] === "Expand quota details");
    expand.props.onClick(); expect(renderToStaticMarkup(tree())).toContain("Quota detail table");
  });
  it("keeps unlimited and positive quotas but labels zero-capacity rows on mixed accounts", () => {
    seed(); states[1] = { c1: { quotas: [{ name: "Zero", used: 0, total: 0 }, { name: "Paid", used: 1, total: 20 }, { name: "Unlimited", used: 2, total: 0, unlimited: true }] } };
    const markup = renderToStaticMarkup(tree());
    expect(markup).toContain("Zero: No quota reported by this provider");
    expect(markup).not.toContain("Table row: Zero");
    expect(markup).toContain("Table row: Paid");
    expect(markup).toContain("Table row: Unlimited");
  });
  it("renders explicit no-quota copy for zero-capacity rows", () => {
    seed(); states[1] = { c1: { quotas: [{ name: "Weekly", used: 0, total: 0 }] } };
    expect(renderToStaticMarkup(tree())).toContain("No quota reported by this provider");
    expect(renderToStaticMarkup(tree())).not.toContain("Quota detail table");
  });
});
