// Wave B (ui-fix plan, F2): the raw gateway key is never revealed on mount.
// Example cards, the media combo page and MitmServerCard must:
//   - make zero /reveal requests on mount or selection,
//   - render only a masked value (or YOUR_KEY) until an explicit Reveal click,
//   - resolve the raw key lazily at Run/Copy click time,
//   - keep Run enabled when the reveal limiter answers 429 and show role=alert,
//   - drop the cached key when the selection changes.
// Fixtures use fake keys only (sk-test-FAKE-*). Nothing here prints them.
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as maskedKeyClient from "@/lib/maskedKeyClient.js";

const SRC = new URL("../../src/", import.meta.url);
// Real module once it exists (RED: absent, so the stub below is used).
const gatewayOrigin = existsSync(new URL("shared/utils/gatewayOrigin.js", SRC))
  ? await import("@/shared/utils/gatewayOrigin.js")
  : { __esModule: true, getGatewayOrigin: () => "http://localhost" };
const DASH = "app/(dashboard)/dashboard/";
const CARDS = `${DASH}media-providers/[kind]/[id]/components/`;
const HOOK_FILE = "shared/hooks/useOnDemandKey.js";

const RAW = { k1: "sk-test-FAKE-k1-0000", k2: "sk-test-FAKE-k2-0000" };
const MASKED_KEYS = [
  { id: "k1", name: "Main", maskedKey: "sk-...MSK1", isActive: true },
  { id: "k2", name: "Backup", maskedKey: "sk-...MSK2", isActive: true },
];

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

function harness(file, exportName, mocks = {}) {
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
    useRef: (value) => (refs[refCursor++] ||= { current: value }),
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
  };
  const passthrough = ({ children }) => children ?? null;
  const stubModule = new Proxy({ __esModule: true, default: passthrough }, { get: (o, k) => o[k] || passthrough });
  const cache = {};
  const requireFn = (name) => {
    if (name === "react") return testReact;
    if (name in mocks) return mocks[name];
    if (name === "@/shared/hooks/useOnDemandKey" || name === "@/shared/hooks/useOnDemandKey.js") {
      // Compiled with the same hook dispatcher so its state lives in the same slots.
      if (existsSync(new URL(HOOK_FILE, SRC))) return (cache.hook ||= compile(HOOK_FILE, requireFn));
    }
    return stubModule;
  };
  const exported = compile(file, requireFn);
  const Component = exported[exportName];
  let lastProps = {};
  return {
    states, effects,
    render(props = lastProps) {
      lastProps = props;
      cursor = 0; refCursor = 0; effects.length = 0;
      return Component(props);
    },
    async mount(props) {
      this.render(props);
      for (const effect of effects) effect();
      await flush();
      return this.render();
    },
  };
}

async function flush() {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props?.children).flatMap((child) => all(child, predicate)),
  ];
}
const find = (node, predicate) => all(node, predicate)[0];
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join(" ")
    : node && typeof node === "object" ? React.Children.toArray(node.props?.children).map(text).join(" ") : "");
const serialize = (tree) => JSON.stringify(tree, (key, value) => (key === "_owner" ? undefined : value));
const buttonByText = (tree, label) => find(tree, (n) => typeof n.props?.onClick === "function" && text(n).replace(/\s+/g, " ").trim() === label);
const alerts = (tree) => all(tree, (n) => n.props?.role === "alert");
const revealCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => String(url).includes("/reveal"));

// ---- fetch / browser fixtures ------------------------------------------------
let revealMode = "ok";
let copied = [];
function json(body, { ok = true, status = 200, headers = {} } = {}) {
  return {
    ok, status,
    headers: { get: (h) => headers[h.toLowerCase()] ?? (h.toLowerCase() === "content-type" ? "application/json" : null) },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
    async blob() { return new Blob([]); },
  };
}
function installFetch({ comboStatus = 200 } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const u = String(url);
    const reveal = u.match(/\/api\/keys\/([^/]+)\/reveal/);
    if (reveal) {
      if (revealMode === "429") return json({ error: "Too many reveal requests" }, { ok: false, status: 429, headers: { "retry-after": "30" } });
      return json({ id: reveal[1], key: RAW[reveal[1]] });
    }
    if (u.startsWith("/api/keys")) return json({ keys: MASKED_KEYS });
    if (u.startsWith("/api/combos/")) {
      if (comboStatus !== 200) return json({ error: "boom" }, { ok: false, status: comboStatus });
      return json({ id: "c1", name: "web-combo", kind: "webSearch", models: ["tavily"] });
    }
    if (u.startsWith("/api/usage/logs")) return json([]);
    if (u.startsWith("/api/models/alias")) return json({ aliases: {} });
    if (u.startsWith("/api/cli-tools/antigravity-mitm")) return json({ running: false, certExists: true, certTrusted: true, isAdmin: true, needsSudoPassword: false });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  revealMode = "ok";
  copied = [];
  vi.stubGlobal("window", { location: { origin: "http://10.0.0.5:20140" }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(async (t) => { copied.push(t); }) } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const copyHook = {
  __esModule: true,
  useCopyToClipboard: () => ({ copied: null, copy: (t) => navigator.clipboard.writeText(t) }),
};
const RowMock = { __esModule: true, Row: ({ children }) => children, KIND_EXAMPLE_CONFIG: { webSearch: { bodyKey: "query", defaultInput: "hello", inputLabel: "Query", defaultResponse: "{}" } } };
const providersMock = {
  __esModule: true,
  getProviderAlias: (id) => id,
  resolveProviderId: (id) => id,
  isCustomEmbeddingProvider: () => false,
  MEDIA_PROVIDER_KINDS: [{ id: "webSearch", label: "Web Search", endpoint: { path: "/v1/search", method: "POST" } }],
  AI_PROVIDERS: {},
};
const modelsMock = (kind) => ({
  __esModule: true,
  getModelsByProviderId: () => [{ id: `${kind}-1`, name: `${kind} one`, kind }],
  getModelKind: (m) => m.kind,
});
const common = (kind) => ({
  "@/shared/hooks/useCopyToClipboard": copyHook,
  "@/lib/maskedKeyClient": maskedKeyClient,
  "./exampleShared": RowMock,
  "@/shared/constants/providers": providersMock,
  "@/shared/constants/models": modelsMock(kind),
});

// Each target: how to mount it and which control is its "Run".
const TARGETS = {
  embedding: {
    file: `${CARDS}EmbeddingExampleCard.js`, exportName: "EmbeddingExampleCard", props: { providerId: "openai" },
    mocks: common("embedding"), run: "Run", copy: "Copy", curl: true, hasSelect: true,
  },
  generic: {
    file: `${CARDS}GenericExampleCard.js`, exportName: "GenericExampleCard", props: { providerId: "tavily", kind: "webSearch" },
    mocks: common("webSearch"), run: "Run", copy: "Copy", curl: true, hasSelect: true,
  },
  stt: {
    file: `${CARDS}SttExampleCard.js`, exportName: "SttExampleCard", props: { providerId: "openai" },
    mocks: common("stt"), run: "Run", copy: "Copy", curl: true, hasSelect: true,
    prepare(h, tree) {
      const fileInput = find(tree, (n) => n.type === "input" && n.props?.type === "file");
      fileInput.props.onChange({ target: { files: [{ name: "a.mp3", size: 1024 }] } });
      return h.render();
    },
  },
  tts: {
    file: `${CARDS}TtsExampleCard.js`, exportName: "TtsExampleCard", props: { providerId: "edge-tts" },
    mocks: {
      ...common("tts"),
      "@/shared/constants/ttsProviders": { __esModule: true, TTS_PROVIDER_CONFIG: { "edge-tts": { defaultVoiceId: "voice-1", voiceSource: "api-language" } } },
      "@/i18n/runtime": { __esModule: true, translate: (s) => s },
      "open-sse/config/ttsModels.js": { __esModule: true, getTtsVoicesForModel: () => [] },
      "open-sse/config/googleTtsLanguages.js": { __esModule: true, GOOGLE_TTS_LANGUAGES: [] },
    },
    run: "Run", copy: "Copy", curl: true, hasSelect: true,
  },
  combo: {
    file: `${DASH}media-providers/combo/[id]/page.js`, exportName: "default", props: {},
    mocks: {
      "@/lib/maskedKeyClient": maskedKeyClient,
      "@/shared/constants/providers": providersMock,
      "next/navigation": { __esModule: true, useParams: () => ({ id: "c1" }), useRouter: () => ({ push() {} }), notFound: vi.fn(() => "NOT_FOUND") },
      "@/shared/hooks/useCopyToClipboard": copyHook,
      "@/shared/utils/gatewayOrigin": gatewayOrigin,
    },
    run: "Run", copy: "Copy", curl: true, hasSelect: true,
  },
  mitm: {
    file: `${DASH}cli-tools/components/MitmServerCard.js`, exportName: "default", props: { apiKeys: MASKED_KEYS, cloudEnabled: false },
    mocks: { "@/lib/maskedKeyClient": maskedKeyClient, "@/shared/utils/gatewayOrigin": gatewayOrigin },
    run: "Start Server", copy: null, curl: false, hasSelect: true,
  },
};

async function mountTarget(name, fetchOptions) {
  const t = TARGETS[name];
  const fetchMock = installFetch(fetchOptions);
  const h = harness(t.file, t.exportName, t.mocks);
  let tree = await h.mount(t.props);
  if (t.prepare) tree = t.prepare(h, tree);
  return { t, h, tree, fetchMock };
}

describe("Wave B F2: no reveal on mount, masked until explicit reveal", () => {
  for (const name of Object.keys(TARGETS)) {
    it(`${name}: mount + effects make zero /reveal requests`, async () => {
      const { fetchMock } = await mountTarget(name);
      expect(revealCalls(fetchMock)).toHaveLength(0);
    });

    it(`${name}: rendered tree never holds the raw key before Reveal; curl is masked`, async () => {
      const { t, tree } = await mountTarget(name);
      const dom = serialize(tree);
      expect(dom).not.toContain("sk-test-FAKE");
      if (t.curl) {
        const pre = all(tree, (n) => n.type === "pre").map(text).join("\n");
        expect(pre).toMatch(/Bearer (sk-\.\.\.MSK1|YOUR_KEY)/);
      }
    });

    it(`${name}: a 429 from reveal keeps ${TARGETS[name].run} enabled and shows role=alert`, async () => {
      const { t, h, tree } = await mountTarget(name);
      revealMode = "429";
      const run = buttonByText(tree, t.run);
      expect(run).toBeTruthy();
      expect(run.props.disabled).toBeFalsy();
      await run.props.onClick();
      await flush();
      const after = h.render();
      const alert = alerts(after).map(text).join(" ");
      expect(alert).toMatch(/429|too many|limit/i);
      expect(buttonByText(after, t.run).props.disabled).toBeFalsy();
      expect(serialize(after)).not.toContain("sk-test-FAKE");
    });

    it(`${name}: ${TARGETS[name].run} reveals lazily at click time, once per selection`, async () => {
      const { t, h, tree, fetchMock } = await mountTarget(name);
      await buttonByText(tree, t.run).props.onClick();
      await flush();
      expect(revealCalls(fetchMock).map(([u]) => u)).toEqual(["/api/keys/k1/reveal?confirm=true"]);
      // A second Run on the same selection reuses the cached credential.
      await buttonByText(h.render(), t.run).props.onClick();
      await flush();
      expect(revealCalls(fetchMock)).toHaveLength(1);
      // Selection change clears the cache: the next Run reveals the new id.
      const select = find(h.render(), (n) => n.type === "select" && n.props?.value === "k1");
      expect(select).toBeTruthy();
      select.props.onChange({ target: { value: "k2" } });
      await buttonByText(h.render(), t.run).props.onClick();
      await flush();
      expect(revealCalls(fetchMock).map(([u]) => u).at(-1)).toBe("/api/keys/k2/reveal?confirm=true");
      expect(serialize(h.render())).not.toContain("sk-test-FAKE");
    });

    if (TARGETS[name].copy) {
      it(`${name}: Copy writes the real key to the clipboard only`, async () => {
        const { t, h, tree } = await mountTarget(name);
        await buttonByText(tree, t.copy).props.onClick();
        await flush();
        expect(copied.join("\n")).toContain(`Bearer ${RAW.k1}`);
        expect(serialize(h.render())).not.toContain("sk-test-FAKE");
      });
    }

    it(`${name}: explicit Reveal shows the key, then it auto-hides and re-masks on selection change`, async () => {
      const { h, tree } = await mountTarget(name);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const reveal = buttonByText(tree, "Reveal");
      expect(reveal).toBeTruthy();
      await reveal.props.onClick();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(serialize(h.render())).toContain(RAW.k1);
      vi.advanceTimersByTime(30_000);
      expect(serialize(h.render())).not.toContain("sk-test-FAKE");
      // Reveal again, then change selection: re-masked immediately.
      await buttonByText(h.render(), "Reveal").props.onClick();
      for (let i = 0; i < 8; i++) await Promise.resolve();
      expect(serialize(h.render())).toContain(RAW.k1);
      find(h.render(), (n) => n.type === "select" && n.props?.value === "k1").props.onChange({ target: { value: "k2" } });
      expect(serialize(h.render())).not.toContain("sk-test-FAKE");
    });

    it(`${name}: every select has a non-empty aria-label`, async () => {
      const { tree } = await mountTarget(name);
      const selects = all(tree, (n) => n.type === "select");
      expect(selects.length).toBeGreaterThan(0);
      for (const s of selects) expect(String(s.props["aria-label"] || "").trim()).not.toBe("");
    });
  }
});

describe("Wave B F13: Run buttons on bg-primary use the on-primary token", () => {
  for (const name of ["embedding", "generic", "stt", "tts"]) {
    it(`${name}: no text-white on bg-primary`, async () => {
      const { tree } = await mountTarget(name);
      const run = buttonByText(tree, "Run");
      expect(run.props.className).toContain("bg-primary");
      expect(run.props.className).not.toMatch(/\btext-white\b/);
      expect(run.props.className).toContain("text-[var(--color-on-primary)]");
    });
  }
});

describe("Wave B: combo page load-failed state", () => {
  it("a 500 from the combo loader renders LoadFailedState with Retry, not notFound", async () => {
    const LoadFailedState = vi.fn(() => null);
    TARGETS.combo.mocks["@/shared/components/LoadFailedState"] = { __esModule: true, default: LoadFailedState };
    const { tree, fetchMock } = await mountTarget("combo", { comboStatus: 500 });
    const failed = find(tree, (n) => n.type === LoadFailedState);
    expect(failed).toBeTruthy();
    expect(typeof failed.props.onRetry).toBe("function");
    expect(TARGETS.combo.mocks["next/navigation"].notFound).not.toHaveBeenCalled();
    const before = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/combos/")).length;
    failed.props.onRetry();
    await flush();
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/combos/")).length).toBe(before + 1);
    delete TARGETS.combo.mocks["@/shared/components/LoadFailedState"];
  });

  it("a 404 still routes to notFound", async () => {
    const notFound = TARGETS.combo.mocks["next/navigation"].notFound;
    notFound.mockClear();
    await mountTarget("combo", { comboStatus: 404 });
    expect(notFound).toHaveBeenCalled();
  });
});

describe("Wave B: maskedKeyClient helpers", () => {
  it("isRunBlocked ignores reveal state entirely", () => {
    const { isRunBlocked } = maskedKeyClient;
    expect(typeof isRunBlocked).toBe("function");
    expect(isRunBlocked({ keys: MASKED_KEYS, selectedId: "k1", loading: true })).toBe(true);
    expect(isRunBlocked({ keys: MASKED_KEYS, selectedId: "k1", keysError: "Failed to load API keys" })).toBe(true);
    expect(isRunBlocked({ keys: MASKED_KEYS, selectedId: "" })).toBe(true);
    expect(isRunBlocked({ keys: MASKED_KEYS, selectedId: "k1", error: "HTTP 429", resolving: true, rawKey: "" })).toBe(false);
    expect(isRunBlocked({ keys: [], selectedId: "" })).toBe(false);
  });

  it("createOnDemandKey reveals once per id, retries after failure, clears on demand", async () => {
    const { createOnDemandKey } = maskedKeyClient;
    let fail = true;
    const fetchImpl = vi.fn(async (url) => (fail
      ? json({ error: "Too many reveal requests" }, { ok: false, status: 429 })
      : json({ key: RAW[String(url).match(/keys\/([^/]+)\//)[1]] })));
    const store = createOnDemandKey(fetchImpl);
    const err = await store.get("k1").catch((e) => e);
    expect(err.status).toBe(429);
    fail = false;
    expect(await store.get("k1")).toBe(RAW.k1);
    expect(await store.get("k1")).toBe(RAW.k1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await store.get("k2")).toBe(RAW.k2);
    store.clear();
    await store.get("k2");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("describeRevealError explains a 429 without blocking", () => {
    const { describeRevealError } = maskedKeyClient;
    const e = Object.assign(new Error("Too many reveal requests"), { status: 429, retryAfter: 30 });
    expect(describeRevealError(e)).toMatch(/429/);
    expect(describeRevealError(e)).toMatch(/retry/i);
  });
});
