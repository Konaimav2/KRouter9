// Wave C (ui-fix plan, F3 + profile): a failed page load is never an empty or
// not-found state. When a loader request fails (non-2xx or network error) the
// page renders an announced alert (role="alert") with a Retry that re-runs the
// loader. Only a real 404 / an absent record on a 2xx may read "not found",
// and a 200 with an empty list still shows the normal empty state.
import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as providersConst from "@/shared/constants/providers.js";
import * as modelsConst from "@/shared/constants/models.js";
import * as thinkingLevels from "open-sse/providers/thinkingLevels.js";
import * as appConfig from "@/shared/constants/config.js";
import * as proxyMask from "@/lib/proxyMask.js";
import * as tokenRefreshSpam from "@/app/(dashboard)/dashboard/console-log/tokenRefreshSpam.js";

const SRC = new URL("../../src/", import.meta.url);
const DASH = "app/(dashboard)/dashboard/";

function compile(file, requireFn) {
  const source = readFileSync(new URL(file, SRC), "utf8");
  const code = transformSync(source, {
    filename: file,
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "React", code)(requireFn, mod, mod.exports, requireFn("react"));
  return mod.exports;
}

const passthrough = (props) => props?.children ?? null;
const stubModule = new Proxy({ __esModule: true, default: passthrough }, { get: (o, k) => o[k] || passthrough });

// The real shared component, marked so the tree walker expands it in place.
const LoadFailedState = compile("shared/components/LoadFailedState.js", (name) => (name === "react" ? React : stubModule)).default;
LoadFailedState.__expand = true;

function harness(file, exportName = "default", mocks = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  let cursor = 0;
  let refCursor = 0;
  const testReact = {
    ...React,
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useEffect: (effect) => { effects.push(effect); },
    useLayoutEffect: () => {},
    useRef: (value) => (refs[refCursor++] ||= { current: value }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
  };
  const navigation = {
    useParams: () => mocks.params || {},
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(mocks.search || ""),
    usePathname: () => "/dashboard",
    notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  };
  const known = {
    "next/navigation": navigation,
    "@/store/notificationStore": { useNotificationStore: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) },
    "@/shared/hooks/useTheme": { useTheme: () => ({ theme: "light", setTheme: vi.fn(), isDark: false }) },
    "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }) },
    "@/shared/hooks/useModelCaps": { useModelCaps: () => ({}) },
    "@/shared/constants/providers": providersConst,
    "@/shared/constants/models": modelsConst,
    "open-sse/providers/thinkingLevels.js": thinkingLevels,
    "@/shared/components/LoadFailedState": { __esModule: true, default: LoadFailedState },
    "@/shared/constants/config": appConfig,
    "@/lib/proxyMask.js": proxyMask,
    "./tokenRefreshSpam": tokenRefreshSpam,
  };
  const requireFn = (name) => {
    if (name === "react") return testReact;
    if (name in (mocks.modules || {})) return mocks.modules[name];
    if (name in known) return known[name];
    return stubModule;
  };
  const exported = compile(file, requireFn);
  const Component = exported[exportName];
  let lastProps = {};
  return {
    states,
    render(props = lastProps) {
      lastProps = props;
      cursor = 0; refCursor = 0; effects.length = 0;
      return Component(props);
    },
    async mount(props, wait) {
      this.render(props);
      const cleanups = effects.map((effect) => effect());
      await flush(wait);
      void cleanups;
      return this.render();
    },
    async settle(wait) {
      await flush(wait);
      return this.render();
    },
  };
}

async function flush(wait = 0) {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
  if (typeof node.type === "function" && node.type.__expand) return all(node.type(node.props), predicate);
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props?.children).flatMap((child) => all(child, predicate)),
  ];
}
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join(" ")
    : node && typeof node === "object"
      ? (typeof node.type === "function" && node.type.__expand ? text(node.type(node.props))
        : React.Children.toArray(node.props?.children).map(text).join(" "))
      : "");
const alerts = (tree) => all(tree, (n) => n.props?.role === "alert");
const retryButton = (tree) => all(tree, (n) => typeof n.props?.onClick === "function" && /^\s*Retry\s*$/.test(text(n)))[0];
const callsTo = (fetchMock, path) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith(path)).length;

function res(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === "content-type" ? "application/json" : null) },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

// routes: [[prefix, body | (url) => body]], failing: { prefix: 500 | 404 | "reject" }
function installFetch(routes, failing = {}) {
  const fetchMock = vi.fn(async (url) => {
    const u = String(url);
    for (const [prefix, mode] of Object.entries(failing)) {
      if (u.startsWith(prefix)) {
        if (mode === "reject") throw new TypeError("Failed to fetch");
        return res({ error: "boom" }, mode);
      }
    }
    for (const [prefix, body] of routes) if (u.startsWith(prefix)) return res(typeof body === "function" ? body(u) : body);
    return res({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function expectLoadFailed(tree, forbidden = []) {
  const found = alerts(tree);
  expect(found.length, "expected a role=alert load-failed state").toBeGreaterThan(0);
  const retry = retryButton(tree);
  expect(retry, "expected a Retry button").toBeTruthy();
  const flat = text(tree);
  for (const copy of forbidden) expect(flat).not.toContain(copy);
  return retry;
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------
describe("Wave C: proxy-pools", () => {
  const FILE = `${DASH}proxy-pools/page.js`;
  const ROUTES = [["/api/proxy-pools", { proxyPools: [] }], ["/api/settings", {}]];

  for (const mode of [500, "reject"]) {
    it(`shows LoadFailedState (not the empty list) when /api/proxy-pools fails (${mode})`, async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const fetchMock = installFetch(ROUTES, { "/api/proxy-pools": mode });
      const h = harness(FILE);
      const tree = await h.mount();
      const retry = expectLoadFailed(tree, ["No proxy pool entries yet"]);
      const before = callsTo(fetchMock, "/api/proxy-pools");
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, "/api/proxy-pools")).toBeGreaterThan(before);
    });
  }

  it("keeps the empty state and no alert on 200 + empty list", async () => {
    installFetch(ROUTES);
    const tree = await harness(FILE).mount();
    expect(alerts(tree)).toHaveLength(0);
    expect(text(tree)).toContain("No proxy pool entries yet");
  });

  it("clears the alert after a successful Retry", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    installFetch(ROUTES, { "/api/proxy-pools": 500 });
    const h = harness(FILE);
    const retry = expectLoadFailed(await h.mount());
    installFetch([["/api/proxy-pools", { proxyPools: [{ id: "p1", name: "pool-a", isActive: true }] }], ["/api/settings", {}]]);
    retry.props.onClick();
    const tree = await h.settle();
    expect(alerts(tree)).toHaveLength(0);
    expect(text(tree)).not.toContain("No proxy pool entries yet");
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: providers/[id] distinguishes 404 from failure", () => {
  const FILE = `${DASH}providers/[id]/page.js`;
  const MISSING = "openai-compatible-qa-missing";
  const ROUTES = [
    ["/api/providers", { connections: [] }],
    ["/api/provider-nodes", { nodes: [] }],
    ["/api/proxy-pools", { proxyPools: [] }],
    ["/api/settings", {}],
    ["/api/models", { aliases: {}, models: [], ids: [] }],
  ];
  const mountFor = (id, wait) => harness(FILE, "default", { params: { id } }).mount(undefined, wait);

  for (const [label, failing] of [
    ["/api/providers 500", { "/api/providers?": 500 }],
    ["/api/provider-nodes 500", { "/api/provider-nodes": 500 }],
    ["network rejection", { "/api/providers?": "reject", "/api/provider-nodes": "reject" }],
  ]) {
    it(`${label} renders the alert, never "Provider not found"`, async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      const fetchMock = installFetch(ROUTES, failing);
      const h = harness(FILE, "default", { params: { id: MISSING } });
      const tree = await h.mount();
      const retry = expectLoadFailed(tree, ["Provider not found"]);
      const before = callsTo(fetchMock, "/api/providers?");
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, "/api/providers?")).toBeGreaterThan(before);
    });
  }

  it("a 404 from the provider lookup renders \"Provider not found\" and no alert", async () => {
    installFetch(ROUTES, { "/api/provider-nodes": 404 });
    const tree = await mountFor(MISSING);
    expect(alerts(tree)).toHaveLength(0);
    expect(text(tree)).toContain("Provider not found");
  });

  it("a 2xx without the provider renders \"Provider not found\" and no alert", async () => {
    installFetch(ROUTES);
    const tree = await mountFor(MISSING, 700);
    expect(alerts(tree)).toHaveLength(0);
    expect(text(tree)).toContain("Provider not found");
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: profile settings load", () => {
  const FILE = `${DASH}profile/page.js`;

  for (const mode of [500, "reject"]) {
    it(`a settings ${mode} renders an alert with Retry that re-fetches`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = installFetch([["/api/settings", {}]], { "/api/settings": mode });
      const h = harness(FILE);
      const tree = await h.mount();
      const retry = expectLoadFailed(tree);
      const before = callsTo(fetchMock, "/api/settings");
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, "/api/settings")).toBeGreaterThan(before);
    });
  }

  it("a settings 200 renders no load-failed alert", async () => {
    installFetch([["/api/settings", { fallbackStrategy: "fill-first", authMode: "password" }]]);
    const tree = await harness(FILE).mount();
    expect(retryButton(tree)).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: MITM page", () => {
  const FILE = `${DASH}mitm/MitmPageClient.js`;
  const ROUTES = [["/api/providers", { connections: [] }], ["/api/keys", { keys: [] }], ["/api/models/alias", { aliases: {} }], ["/api/settings", {}]];

  for (const failing of [{ "/api/providers": 500 }, { "/api/keys": "reject" }]) {
    it(`shows LoadFailedState when ${Object.keys(failing)[0]} fails`, async () => {
      const fetchMock = installFetch(ROUTES, failing);
      const h = harness(FILE);
      const retry = expectLoadFailed(await h.mount());
      const path = Object.keys(failing)[0];
      const before = callsTo(fetchMock, path);
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, path)).toBeGreaterThan(before);
    });
  }

  it("no alert when every load succeeds with empty data", async () => {
    installFetch(ROUTES);
    expect(alerts(await harness(FILE).mount())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: media-providers/[kind] (embedding, image, tts)", () => {
  const FILE = `${DASH}media-providers/[kind]/page.js`;
  const ROUTES = [["/api/providers", { connections: [] }], ["/api/provider-nodes", { nodes: [] }], ["/api/combos", { combos: [] }]];

  for (const kind of ["embedding", "image", "tts"]) {
    it(`${kind}: /api/providers 500 renders LoadFailedState with Retry`, async () => {
      const fetchMock = installFetch(ROUTES, { "/api/providers": 500 });
      const h = harness(FILE, "default", { params: { kind } });
      const retry = expectLoadFailed(await h.mount());
      const before = callsTo(fetchMock, "/api/providers");
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, "/api/providers")).toBeGreaterThan(before);
    });
  }

  it("embedding: /api/combos network failure renders LoadFailedState", async () => {
    installFetch(ROUTES, { "/api/combos": "reject" });
    expectLoadFailed(await harness(FILE, "default", { params: { kind: "embedding" } }).mount());
  });

  it("embedding: 200 + empty data renders no alert", async () => {
    installFetch(ROUTES);
    expect(alerts(await harness(FILE, "default", { params: { kind: "embedding" } }).mount())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: media-providers/web hub", () => {
  const FILE = `${DASH}media-providers/web/page.js`;
  const ROUTES = [["/api/providers", { connections: [] }], ["/api/combos", { combos: [] }]];

  for (const failing of [{ "/api/providers": 500 }, { "/api/combos": "reject" }]) {
    it(`shows LoadFailedState when ${Object.keys(failing)[0]} fails`, async () => {
      const fetchMock = installFetch(ROUTES, failing);
      const h = harness(FILE);
      const retry = expectLoadFailed(await h.mount());
      const before = callsTo(fetchMock, "/api/providers");
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, "/api/providers")).toBeGreaterThan(before);
    });
  }

  it("no alert on 200 + empty data", async () => {
    installFetch(ROUTES);
    expect(alerts(await harness(FILE).mount())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: console-log stream", () => {
  const FILE = `${DASH}console-log/ConsoleLogClient.js`;
  let sources;
  class FakeEventSource {
    static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
    constructor(url) { this.url = url; this.readyState = 0; sources.push(this); }
    close() { this.readyState = 2; }
  }
  const setup = () => { sources = []; vi.stubGlobal("EventSource", FakeEventSource); };

  it("a stream that fails before any data renders LoadFailedState, not \"No logs yet\"", async () => {
    setup();
    const h = harness(FILE);
    await h.mount();
    expect(sources.length).toBeGreaterThan(0);
    const es = sources.at(-1);
    es.readyState = 2;
    es.onerror?.(new Event("error"));
    const tree = h.render();
    const retry = expectLoadFailed(tree, ["No logs yet"]);
    const before = sources.length;
    retry.props.onClick();
    await flush();
    expect(sources.length).toBeGreaterThan(before);
  });

  it("a stream that delivers init shows no load-failed alert", async () => {
    setup();
    const h = harness(FILE);
    await h.mount();
    const es = sources.at(-1);
    es.readyState = 1;
    es.onopen?.();
    es.onmessage?.({ data: JSON.stringify({ type: "init", logs: [] }) });
    const tree = h.render();
    expect(retryButton(tree)).toBeFalsy();
    expect(text(tree)).toContain("No logs yet");
  });
});

// ---------------------------------------------------------------------------
describe("Wave C: usage tabs", () => {
  const C = `${DASH}usage/components/`;

  it("overview: a stats 500 renders role=alert with Retry", async () => {
    vi.stubGlobal("EventSource", class { close() {} });
    const fetchMock = installFetch([["/api/providers", { connections: [] }], ["/api/provider-nodes", { nodes: [] }]], { "/api/usage/stats": 500 });
    const h = harness(`${C}UsageDashboard.js`);
    const retry = expectLoadFailed(await h.mount({ period: "today", mode: "costs", scopeQuery: "period=today" }));
    const before = callsTo(fetchMock, "/api/usage/stats");
    retry.props.onClick();
    await flush();
    expect(callsTo(fetchMock, "/api/usage/stats")).toBeGreaterThan(before);
  });

  it("logs: a first-load 500 renders role=alert with Retry, not the empty-table copy", async () => {
    const fetchMock = installFetch([], { "/api/usage/request-logs": 500 });
    const h = harness(`${C}UsageLogs.js`);
    const retry = expectLoadFailed(await h.mount(), ["No requests"]);
    const before = callsTo(fetchMock, "/api/usage/request-logs");
    retry.props.onClick();
    await flush();
    expect(callsTo(fetchMock, "/api/usage/request-logs")).toBeGreaterThan(before);
  });

  for (const mode of [500, "reject"]) {
    it(`details: request-details ${mode} renders role=alert with Retry, not "No request details found"`, async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = installFetch([["/api/usage/providers", { providers: [] }], ["/api/provider-nodes", { nodes: [] }]], { "/api/usage/request-details": mode });
      const h = harness(`${C}RequestDetailsTab.js`);
      const retry = expectLoadFailed(await h.mount(), ["No request details found"]);
      const before = callsTo(fetchMock, "/api/usage/request-details");
      retry.props.onClick();
      await flush();
      expect(callsTo(fetchMock, "/api/usage/request-details")).toBeGreaterThan(before);
    });
  }

  it("details: 200 + empty list keeps \"No request details found\" and no alert", async () => {
    installFetch([["/api/usage/providers", { providers: [] }], ["/api/provider-nodes", { nodes: [] }], ["/api/usage/request-details", { details: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } }]]);
    const tree = await harness(`${C}RequestDetailsTab.js`).mount();
    expect(alerts(tree)).toHaveLength(0);
    expect(text(tree)).toContain("No request details found");
  });
});
