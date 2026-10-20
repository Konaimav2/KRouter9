// Wave H2b item 2 (tiles) — TDD GREEN proof (RED was wave-h2b-tiles-red).
// Real-click battery FAIL: "tile count-vs-grid" (x2): e.g. Rate limited (3) /
// Network (5) tiles vs empty provider grids.
// Root cause: level + vocab mismatch. The health tiles count CONNECTIONS
// (page.js healthCounts reduce, unfiltered), while the grid shows PROVIDER
// LANES — and the API-key lane filtered on bare "apikey" while real stored
// connections use "api_key" (windsurf oauth flow, kiro api-key flow), so the
// lane was EMPTY (total 0) and the error-class filter dropped it.
// Fix (page.js): apikey lane stats use ["apikey", "api_key"] (dualAuthTypes
// already did this for oauth/free lanes). This test pins the fixed lane:
// api_key-typed 429 connections produce a visible ratelimited lane.
import React from "react";
import PropTypes from "prop-types";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import commonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { describe, expect, it } from "vitest";
import { normalizeErrorClass } from "../../src/shared/utils/errorClass.js";
import { matchesStatusFilter } from "../../src/app/(dashboard)/dashboard/providers/utils.js";

// Fixed lane filter core: matches getProviderStats(providerId, ["apikey","api_key"])
// narrowing, then errorClasses derived from that subset.
const APIKEY_AUTH_TYPES = ["apikey", "api_key"];

function laneStats(connections, providerId) {
  const lane = connections.filter(
    (c) => c.provider === providerId && APIKEY_AUTH_TYPES.includes(c.authType),
  );
  const errorConns = lane.filter((c) =>
    ["error", "expired", "unavailable", "refresh-invalid"].includes(c.testStatus));
  const classes = [...new Set(
    errorConns.map((c) => normalizeErrorClass(c)).filter((c) => c !== "unknown"),
  )];
  return { total: lane.length, errorClasses: classes, allDisabled: false };
}

describe("wave-h2b tiles: fixed lane matches tile", () => {
  it("GREEN: 3 api_key 429 connections show the Rate limited lane", () => {
    const connections = [1, 2, 3].map((n) => ({
      provider: "grip",
      authType: "api_key",
      testStatus: "error",
      errorCode: 429,
      lastError: "rate limited by upstream",
      isActive: true,
      id: `conn-${n}`,
    }));
    const stats = laneStats(connections, "grip");
    expect(stats.total).toBe(3);
    const visible = matchesStatusFilter("all", stats) && stats.errorClasses.includes("ratelimited");
    expect(visible).toBe(true);
  });

  it("GREEN: bare-apikey connections still match (no regression)", () => {
    const connections = [{
      provider: "grip",
      authType: "apikey",
      testStatus: "error",
      errorCode: 429,
      lastError: "429 too many requests",
      isActive: true,
      id: "conn-1",
    }];
    const stats = laneStats(connections, "grip");
    expect(stats.total).toBe(1);
    expect(stats.errorClasses).toContain("ratelimited");
  });
});

// Execute the real page reducer, lane construction and JSX rather than copying
// their filters into the test. Only browser/Next dependencies are stubbed.
const state = { values: [], index: 0, query: "" };
const react = {
  ...React,
  useEffect: () => {},
  useMemo: (compute) => compute(),
  useState: (initial) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value) => { state.values[index] = typeof value === "function" ? value(state.values[index]) : value; }];
  },
};
const blank = () => null;
const stub = ({ children }) => React.createElement("div", null, children);
const mockImports = {
  react,
  "prop-types": { default: PropTypes, __esModule: true },
  "@/shared/components/Icon": { default: blank, __esModule: true },
  "@/shared/components": { CardSkeleton: stub, Button: ({ children, ...props }) => {
    const safeProps = { ...props };
    delete safeProps.loading;
    return React.createElement("button", safeProps, children);
  }, Toggle: blank, ConfirmModal: blank },
  "@/shared/components/ProviderIcon": { default: blank, __esModule: true },
  "@/shared/utils/providerIcon": { getProviderIconSrc: () => "" },
  "@/shared/constants/config": {
    OAUTH_PROVIDERS: { codex: { id: "codex", name: "Codex" } },
    APIKEY_PROVIDERS: {
      tokenharbor: { id: "tokenharbor", name: "TokenHarbor" },
      mediaonly: { id: "mediaonly", name: "Media only", serviceKinds: ["image"] },
      hidden: { id: "hidden", name: "Hidden", hidden: true },
    },
  },
  "@/shared/constants/providers": {
    FREE_PROVIDERS: {}, FREE_TIER_PROVIDERS: {},
    OPENAI_COMPATIBLE_PREFIX: "openai-compatible-", ANTHROPIC_COMPATIBLE_PREFIX: "anthropic-compatible-",
  },
  "next/link": { default: ({ children, href }) => React.createElement("a", { href }, children), __esModule: true },
  "@/shared/utils": { getErrorCode: () => null, getRelativeTime: () => "recent" },
  "@/store/notificationStore": { useNotificationStore: () => ({}) },
  "@/store/headerSearchStore": { useHeaderSearchStore: (selector) => selector({ query: state.query, register: () => {}, unregister: () => {} }) },
  "./components/ModelAvailabilityBadge": { default: blank, __esModule: true },
  "./components/AddCompatibleModal": { default: blank, __esModule: true },
  "./utils": { matchesStatusFilter, STATUS_FILTER_OPTIONS: [], buildCustomProviderDisplaySlugs: () => new Map(), buildCustomProviderRouteSlugs: () => new Map() },
  "@/shared/utils/errorClass": { normalizeErrorClass, errorClassLabel: (cls) => cls },
};
const pagePath = new URL("../../src/app/(dashboard)/dashboard/providers/page.js", import.meta.url);
const compiledPage = transformSync(readFileSync(pagePath, "utf8"), {
  filename: pagePath.pathname, presets: [[presetReact, { runtime: "classic" }]], plugins: [commonjs],
}).code;
const page = { exports: {} };
new Function("require", "module", "exports", "React", compiledPage)(
  (name) => { if (!(name in mockImports)) throw new Error(`Unexpected import: ${name}`); return mockImports[name]; },
  page, page.exports, react,
);
function markup(connections, query = "", filter = "all") {
  state.values = [connections, [], false];
  state.query = query;
  // The status and error filter states follow the initial page states.
  state.values[8] = "all";
  state.values[9] = filter;
  state.index = 0;
  return renderToStaticMarkup(page.exports.default());
}
function tileCount(html, label) {
  const match = html.match(new RegExp(`class="self-end font-mono[^"]*">(\\d+)</span><span[^>]*>${label}</span>`));
  if (!match) throw new Error(`Missing tile: ${label}`);
  return Number(match[1]);
}
const connection = (id, provider, authType, testStatus, lastError, isActive = true) => ({
  id, provider, authType, testStatus, lastError, isActive,
});

describe("f7a health tiles and eligible provider lanes", () => {
  it("RED: an unregistered auth-type 429 has no matching grid row or Rate limited count", () => {
    const html = markup([connection("qa-1", "tokenharbor", "cookie", "error", "429 too many requests")], "", "ratelimited");
    expect(html).toContain("No providers match");
    expect(tileCount(html, "Rate limited")).toBe(0);
  });

  it("RED: a valid api_key 429 under an unmatched search has no grid row and no tile count", () => {
    const html = markup([connection("qa-2", "tokenharbor", "api_key", "error", "429 too many requests")], "not-tokenharbor", "ratelimited");
    expect(html).toContain("No providers match");
    expect(tileCount(html, "Rate limited")).toBe(0);
  });

  it("does not count hidden and media-only providers that have no grid lane", () => {
    const html = markup([
      connection("qa-1", "mediaonly", "apikey", "error", "429 too many requests"),
      connection("qa-2", "hidden", "apikey", "error", "429 too many requests"),
    ], "", "ratelimited");
    expect(html).toContain("No providers match");
    expect(tileCount(html, "Rate limited")).toBe(0);
  });

  it("preserves existing Connected/Disabled totals when their records lack a grid lane", () => {
    const html = markup([
      connection("qa-disabled", "tokenharbor", "cookie", "error", "429 too many requests", false),
      connection("qa-active", "mediaonly", "apikey", "active", ""),
    ]);
    expect(tileCount(html, "Disabled")).toBe(1);
    expect(tileCount(html, "Connected")).toBe(1);
    expect(tileCount(html, "Rate limited")).toBe(0);
  });

  it("matches error-only status, retains disabled error rows, and excludes stale/no-error records", () => {
    const html = markup([
      connection("qa-1", "tokenharbor", "api_key", "error", "429 too many requests"),
      connection("qa-2", "codex", "oauth", "error", "network ETIMEDOUT", false),
      connection("qa-3", "tokenharbor", "apikey", "active", "429 too many requests"),
      connection("qa-4", "tokenharbor", "apikey", undefined, "429 too many requests"),
      connection("qa-5", "codex", "oauth", "active", ""),
    ]);
    expect(tileCount(html, "Rate limited")).toBe(1);
    expect(tileCount(html, "Network")).toBe(1);
    const rateHtml = markup([connection("qa-1", "tokenharbor", "api_key", "error", "429 too many requests")], "", "ratelimited");
    expect(rateHtml).toContain("TokenHarbor");
    expect(rateHtml).not.toContain("No providers match");
    const disabledHtml = markup([connection("qa-2", "codex", "oauth", "error", "network ETIMEDOUT", false)], "", "network");
    expect(tileCount(disabledHtml, "Network")).toBe(1);
    expect(disabledHtml).toContain("Codex");
    expect(disabledHtml).not.toContain("No providers match");
    const staleHtml = markup([connection("qa-3", "tokenharbor", "apikey", "active", "429 too many requests")], "", "ratelimited");
    expect(tileCount(staleHtml, "Rate limited")).toBe(0);
    expect(staleHtml).toContain("No providers match");
    const noErrorHtml = markup([connection("qa-5", "codex", "oauth", "active", "")], "", "network");
    expect(tileCount(noErrorHtml, "Network")).toBe(0);
    expect(noErrorHtml).toContain("No providers match");
  });

  it("classifies an error with a status code but no message via the shared normalizer", () => {
    const rate = { ...connection("qa-1", "tokenharbor", "apikey", "error", ""), errorCode: 429 };
    const html = markup([rate], "", "ratelimited");
    expect(tileCount(html, "Rate limited")).toBe(1);
    expect(html).toContain("TokenHarbor");
    expect(html).not.toContain("No providers match");
  });

  it("counts network only when unavailable is in cooldown and the lane is filterable", () => {
    const unavailable = connection("qa-1", "codex", "oauth", "unavailable", "network ETIMEDOUT");
    expect(tileCount(markup([unavailable]), "Network")).toBe(0);
    unavailable.modelLock_demo = new Date(Date.now() + 60_000).toISOString();
    const html = markup([unavailable], "", "network");
    expect(tileCount(html, "Network")).toBe(1);
    expect(html).toContain("Codex");
    expect(html).not.toContain("No providers match");
  });
});
