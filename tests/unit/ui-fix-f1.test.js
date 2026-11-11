// Wave F1 (security follow-up): raw gateway keys and sudo passwords must not
// outlive the action that needs them.
//  L1 useOnDemandKey: a late reveal after reset()/unmount never runs the
//     action and never starts a display timer.
//  L2 createOnDemandKey: in-flight dedupe, but the raw key is dropped after
//     the 30s display window.
//  L3 MitmServerCard / AntigravityToolCard: retry closures re-read the sudo
//     password and it is cleared on selection change, modal close, unmount.
//  Info MitmServerCard defaults the router base to the loopback origin.
//  M1 Every tool card using ApiKeySelect keeps only the key id: snippets show
//     the masked token, the raw key is revealed only inside Copy/Apply.
//  M2 Key presets never persist a raw key, never use it as a label or name,
//     and legacy plaintext entries are cleaned up once.
// Fixtures use fake keys only (sk-test-FAKE-*). Nothing here prints them.
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as maskedKeyClient from "@/lib/maskedKeyClient.js";
import * as gatewayOrigin from "@/shared/utils/gatewayOrigin.js";

const SRC = new URL("../../src/", import.meta.url);
const CLI = "app/(dashboard)/dashboard/cli-tools/components/";
const HOOK_FILE = "shared/hooks/useOnDemandKey.js";
const CLI_HOOK_FILE = `${CLI}useCliApiKey.js`;
const RAW = { k1: "sk-test-FAKE-k1-0000", k2: "sk-test-FAKE-k2-0000" };
const PW = "pw-test-FAKE-sudo";
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

// Minimal hook runtime: state/ref slots by call order, effects with cleanups.
function harness(file, exportName, mocks = {}) {
  const states = [];
  const refs = [];
  const effects = [];
  const cleanups = [];
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
      return (cache.hook ||= compile(HOOK_FILE, requireFn));
    }
    if (name === "./useCliApiKey" || name === "./useCliApiKey.js") {
      if (existsSync(new URL(CLI_HOOK_FILE, SRC))) return (cache.cli ||= compile(CLI_HOOK_FILE, requireFn));
    }
    if (name === "@/lib/maskedKeyClient") return maskedKeyClient;
    if (name === "@/shared/utils/gatewayOrigin") return gatewayOrigin;
    if (name === "@/shared/hooks/useCopyToClipboard") return copyHook;
    if (name === "@/shared/hooks/useModelCaps") return { __esModule: true, useModelCaps: () => ({ getCaps: () => null }) };
    return stubModule;
  };
  const exported = compile(file, requireFn);
  const Component = typeof exportName === "function" ? exportName(exported) : exported[exportName];
  let lastProps = {};
  return {
    states, refs,
    render(props = lastProps) {
      lastProps = props;
      cursor = 0; refCursor = 0; effects.length = 0;
      return Component(props);
    },
    async mount(props) {
      this.render(props);
      for (const effect of effects) {
        const c = effect();
        if (typeof c === "function") cleanups.push(c);
      }
      await flush();
      return this.render();
    },
    unmount() {
      while (cleanups.length) cleanups.pop()();
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
const hasRaw = (value) => Object.values(RAW).some((raw) => serialize(value).includes(raw));
const buttonByText = (tree, label) => find(tree, (n) => typeof n.props?.onClick === "function" && text(n).replace(/\s+/g, " ").trim() === label);

function json(body, { ok = true, status = 200, headers = {} } = {}) {
  return {
    ok, status,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    async json() { return body; },
    async text() { return JSON.stringify(body); },
  };
}

let copied = [];
const copyHook = {
  __esModule: true,
  useCopyToClipboard: () => ({ copied: null, copy: async (t) => { copied.push(t); } }),
};
let revealMode = "ok";
let statusBody = {};
let postResponse = null;
let fetchMock;
const revealCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/reveal"));
const bodiesWith = (needle) => fetchMock.mock.calls.filter(([, init]) => String(init?.body || "").includes(needle));

beforeEach(() => {
  copied = [];
  revealMode = "ok";
  statusBody = {};
  postResponse = null;
  fetchMock = vi.fn(async (url, init) => {
    const u = String(url);
    const reveal = u.match(/\/api\/keys\/([^/]+)\/reveal/);
    if (reveal) {
      if (revealMode === "429") return json({ error: "Too many reveal requests" }, { ok: false, status: 429, headers: { "retry-after": "30" } });
      return json({ id: reveal[1], key: RAW[reveal[1]] });
    }
    if (init?.method === "POST" && postResponse) return postResponse();
    if (u.startsWith("/api/cli-tools/antigravity-mitm") && !u.includes("alias")) return json(statusBody);
    if (u.startsWith("/api/models/alias") || u.includes("alias?tool=")) return json({ aliases: {} });
    if (u.startsWith("/api/cli-tools/")) return json({ installed: true, success: true, settings: { env: {} }, config: "" });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { location: { origin: "http://localhost:20140" }, addEventListener() {}, removeEventListener() {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
describe("F1 L1: useOnDemandKey generation counter", () => {
  function mountHook() {
    const pending = [];
    const mkc = {
      ...maskedKeyClient,
      createOnDemandKey: () => ({ get: vi.fn(() => { const d = deferred(); pending.push(d); return d.promise; }), clear: vi.fn() }),
    };
    const h = harness(HOOK_FILE, "useOnDemandKey", { "@/lib/maskedKeyClient": mkc });
    return { h, pending };
  }

  it("a late withKey for A after reset() never runs the action", async () => {
    const { h, pending } = mountHook();
    const api = await h.mount();
    const action = vi.fn();
    const p = api.withKey("k1", action, "copy");
    api.reset();
    pending[0].resolve(RAW.k1);
    expect(await p).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("a late reveal after reset() neither shows the key nor starts the 30s timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { h, pending } = mountHook();
    h.render();
    const p = h.render().reveal("k1");
    h.render().reset();
    pending[0].resolve(RAW.k1);
    await p;
    expect(h.render().revealedFor("k1")).toBe("");
    expect(hasRaw(h.states)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a late withKey after unmount never runs the action", async () => {
    const { h, pending } = mountHook();
    const api = await h.mount();
    const action = vi.fn();
    const p = api.withKey("k1", action);
    h.unmount();
    pending[0].resolve(RAW.k1);
    expect(await p).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("without a reset the action still runs once with the key", async () => {
    const { h, pending } = mountHook();
    const api = await h.mount();
    const action = vi.fn();
    const p = api.withKey("k1", action);
    pending[0].resolve(RAW.k1);
    expect(await p).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
describe("F1 L2: createOnDemandKey drops the raw key after the display window", () => {
  it("dedupes in-flight reveals but re-asks after 30s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchImpl = vi.fn(async () => json({ key: RAW.k1 }));
    const store = maskedKeyClient.createOnDemandKey(fetchImpl);
    const [a, b] = await Promise.all([store.get("k1"), store.get("k1")]);
    expect(a === RAW.k1 && b === RAW.k1).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await store.get("k1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30001);
    await store.get("k1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("clear() cancels the pending expiry timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = maskedKeyClient.createOnDemandKey(vi.fn(async () => json({ key: RAW.k1 })));
    await store.get("k1");
    expect(vi.getTimerCount()).toBe(1);
    store.clear();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("F1 L3 + Info: MitmServerCard sudo password and router base", () => {
  const FILE = `${CLI}MitmServerCard.js`;
  const props = { apiKeys: MASKED_KEYS, cloudEnabled: false };
  const needsPw = { running: false, certExists: true, certTrusted: true, isAdmin: true, needsSudoPassword: true, hasCachedPassword: false };

  async function startWithPassword(h) {
    let tree = h.render();
    buttonByText(tree, "Start Server").props.onClick();
    tree = h.render();
    const input = find(tree, (n) => n.props?.placeholder === "Enter sudo password");
    input.props.onChange({ target: { value: PW } });
    tree = h.render();
    buttonByText(tree, "Confirm").props.onClick();
    await flush();
    return h.render();
  }

  it("defaults the router base to the loopback origin when the server reports none", async () => {
    statusBody = { running: false, certExists: true, certTrusted: true, isAdmin: true, needsSudoPassword: false };
    const h = harness(FILE, "default");
    const tree = await h.mount(props);
    const values = all(tree, (n) => typeof n.props?.value === "string").map((n) => n.props.value);
    expect(values).toContain("http://127.0.0.1:20140");
    expect(values).not.toContain("http://localhost:20140");
  });

  it("Retry after a 429 does not reuse a password the user cancelled", async () => {
    statusBody = needsPw;
    revealMode = "429";
    const h = harness(FILE, "default");
    await h.mount(props);
    let tree = await startWithPassword(h);
    expect(revealCalls()).toHaveLength(1);
    buttonByText(tree, "Cancel").props.onClick();
    revealMode = "ok";
    tree = h.render();
    find(tree, (n) => n.type === "button" && text(n).trim() === "Retry").props.onClick();
    await flush();
    expect(bodiesWith(PW)).toHaveLength(0);
    expect(serialize(h.states).includes(PW)).toBe(false);
  });

  it("changing the selected key clears the sudo password", async () => {
    statusBody = needsPw;
    revealMode = "429";
    const h = harness(FILE, "default");
    await h.mount(props);
    let tree = await startWithPassword(h);
    const select = find(tree, (n) => n.type === "select");
    select.props.onChange({ target: { value: "k2" } });
    tree = h.render();
    expect(serialize(h.states).includes(PW)).toBe(false);
    expect(serialize(h.refs).includes(PW)).toBe(false);
  });

  it("port-443 conflict state does not hold the password; Cancel and unmount clear it", async () => {
    statusBody = needsPw;
    postResponse = () => json({ code: "PORT_443_BUSY", portOwner: { name: "nginx", pid: 7 } }, { ok: false, status: 409 });
    const h = harness(FILE, "default");
    await h.mount(props);
    let tree = await startWithPassword(h);
    expect(find(tree, (n) => text(n).includes("Port 443 Already In Use"))).toBeTruthy();
    expect(serialize(h.states).includes(PW)).toBe(false);
    // Kill & Start still carries the password the user typed.
    postResponse = () => json({ ok: true });
    buttonByText(tree, "Kill & Start").props.onClick();
    await flush();
    const posted = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([, init]) => JSON.parse(init.body));
    expect(posted.at(-1).forceKillPort443).toBe(true);
    expect(posted.at(-1).sudoPassword === PW).toBe(true);
    h.unmount();
    expect(serialize(h.states).includes(PW)).toBe(false);
    expect(serialize(h.refs).includes(PW)).toBe(false);
  });
});

describe("F1 L3: AntigravityToolCard sudo password", () => {
  const FILE = `${CLI}AntigravityToolCard.js`;
  const tool = { id: "antigravity", name: "Antigravity", defaultModels: [] };
  const props = { tool, isExpanded: true, apiKeys: MASKED_KEYS, initialStatus: { running: false, needsSudoPassword: true }, hasActiveProviders: true };

  async function startWithPassword(h) {
    let tree = h.render();
    find(tree, (n) => typeof n.props?.onClick === "function" && text(n).includes("Start MITM")).props.onClick();
    tree = h.render();
    find(tree, (n) => n.props?.placeholder === "Enter sudo password").props.onChange({ target: { value: PW } });
    tree = h.render();
    buttonByText(tree, "Confirm").props.onClick();
    await flush();
    return h.render();
  }

  it("Retry after a 429 does not reuse a password the user cancelled", async () => {
    statusBody = { running: false, needsSudoPassword: true };
    revealMode = "429";
    const h = harness(FILE, "default");
    await h.mount(props);
    let tree = await startWithPassword(h);
    expect(revealCalls()).toHaveLength(1);
    buttonByText(tree, "Cancel").props.onClick();
    revealMode = "ok";
    tree = h.render();
    find(tree, (n) => n.type === "button" && text(n).trim() === "Retry").props.onClick();
    await flush();
    expect(bodiesWith(PW)).toHaveLength(0);
  });

  it("selection change and unmount clear the password", async () => {
    // The key selector only renders while MITM runs (the modal then serves Stop).
    statusBody = { running: true, needsSudoPassword: true };
    const h = harness(FILE, "default");
    let tree = await h.mount({ ...props, initialStatus: { running: true, needsSudoPassword: true } });
    find(tree, (n) => n.props?.placeholder === "Enter sudo password").props.onChange({ target: { value: PW } });
    tree = h.render();
    expect(serialize(h.states).includes(PW)).toBe(true);
    find(tree, (n) => n.type === "select").props.onChange({ target: { value: "k2" } });
    tree = h.render();
    expect(serialize(h.states).includes(PW)).toBe(false);
    find(tree, (n) => n.props?.placeholder === "Enter sudo password").props.onChange({ target: { value: PW } });
    h.render();
    h.unmount();
    // React drops component state on unmount; the ref is what could outlive it.
    expect(serialize(h.refs).includes(PW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
const TOOL = {
  id: "tool", name: "Tool", color: "#000", defaultModels: [],
  notes: [],
  guideSteps: [
    { step: 1, title: "Key", type: "apiKeySelector" },
    { step: 2, title: "Env", value: "API_KEY={{apiKey}}", copyable: true },
  ],
  codeBlock: { language: "bash", code: "export API_KEY={{apiKey}}" },
};
const CARD_PROPS = {
  toolId: "tool", tool: TOOL, isExpanded: true, baseUrl: "http://localhost:20140", apiKeys: MASKED_KEYS,
  activeProviders: [], hasActiveProviders: true, cloudEnabled: false, modelMappings: {}, onModelMappingChange() {},
  initialStatus: { installed: true, settings: { env: {} }, config: "" },
};
const CARDS = [
  "DefaultToolCard", "ClaudeToolCard", "ClineToolCard", "KiloToolCard", "CopilotToolCard", "DeepSeekTuiToolCard",
  "DroidToolCard", "CodexToolCard", "CoworkToolCard", "HermesToolCard", "GrokBuildToolCard", "JcodeToolCard",
  "OpenClawToolCard", "OpenCodeToolCard",
];
const isKeySelect = (n) => n.props && "apiKeys" in n.props && typeof n.props.onChange === "function" && "cloudEnabled" in n.props;

describe("F1 M1: tool cards keep only the key id", () => {
  it.each(CARDS)("%s: picking a stored key never puts the raw key in state, props or the tree", async (card) => {
    const h = harness(`${CLI}${card}.js`, "default");
    let tree = await h.mount(CARD_PROPS);
    const select = find(tree, isKeySelect);
    expect(select, "ApiKeySelect rendered").toBeTruthy();
    expect(typeof select.props.onKeyIdChange).toBe("function");
    select.props.onKeyIdChange("k1");
    tree = h.render();
    await flush();
    tree = h.render();
    expect(find(tree, isKeySelect).props.keyId).toBe("k1");
    expect(hasRaw(tree)).toBe(false);
    expect(hasRaw(h.states)).toBe(false);
    expect(revealCalls()).toHaveLength(0);
  });

  it.each(CARDS)("%s: no dead raw list-key fallbacks", (card) => {
    const s = readFileSync(new URL(`${CLI}${card}.js`, SRC), "utf8");
    expect(s).not.toMatch(/apiKeys\[0\]\.key/);
    expect(s).not.toMatch(/apiKeys\?\.\[0\]\?\.key/);
    expect(s).not.toMatch(/\bk\.key\b/);
    expect(s).not.toMatch(/onChange=\{setSelectedApiKey\}/);
  });

  it("DefaultToolCard: snippets show the masked token; Copy reveals once and copies the raw key", async () => {
    const h = harness(`${CLI}DefaultToolCard.js`, "default");
    let tree = await h.mount(CARD_PROPS);
    find(tree, isKeySelect).props.onKeyIdChange("k1");
    tree = h.render();
    expect(serialize(tree)).toContain("export API_KEY=sk-...MSK1");
    find(tree, (n) => typeof n.props?.onClick === "function" && text(n).includes("Copy")).props.onClick();
    await flush();
    expect(revealCalls()).toHaveLength(1);
    expect(copied.at(-1) === `export API_KEY=${RAW.k1}`).toBe(true);
    tree = h.render();
    expect(hasRaw(tree)).toBe(false);
    expect(hasRaw(h.states)).toBe(false);
  });

  it("ClaudeToolCard: Apply reveals at click time and posts the raw key; state stays masked", async () => {
    const h = harness(`${CLI}ClaudeToolCard.js`, "default");
    let tree = await h.mount(CARD_PROPS);
    find(tree, isKeySelect).props.onKeyIdChange("k1");
    tree = h.render();
    find(tree, (n) => typeof n.props?.onClick === "function" && /^Apply/.test(text(n).trim())).props.onClick();
    await flush();
    expect(revealCalls()).toHaveLength(1);
    const post = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/cli-tools/claude-settings" && init?.method === "POST");
    expect(JSON.parse(post[1].body).env.ANTHROPIC_AUTH_TOKEN === RAW.k1).toBe(true);
    expect(hasRaw(h.render())).toBe(false);
    expect(hasRaw(h.states)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("F1 M1/M2: ApiKeySelect", () => {
  const FILE = `${CLI}ApiKeySelect.js`;
  function load(presets = []) {
    const spies = { upsertKeyPreset: vi.fn(() => null), deleteKeyPreset: vi.fn() };
    const h = harness(FILE, "default", {
      "./cliEndpointPresets": { readKeyPresets: () => presets, subscribeKeyPresets: () => () => {}, ...spies },
    });
    return { h, spies };
  }

  it("selecting a stored key emits only its id and never fetches", async () => {
    const { h } = load();
    const onChange = vi.fn();
    const onKeyIdChange = vi.fn();
    const tree = await h.mount({ value: "", onChange, keyId: "", onKeyIdChange, apiKeys: MASKED_KEYS });
    find(tree, (n) => n.type === "select").props.onChange({ target: { value: "k1" } });
    await flush();
    expect(onKeyIdChange).toHaveBeenCalledWith("k1");
    expect(onChange.mock.calls.every(([v]) => !v)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a typed raw key never becomes an option value/label and is never persisted", async () => {
    const { h, spies } = load([{ name: "Work", label: "…0000" }]);
    const props = { value: RAW.k1, onChange: vi.fn(), keyId: "", onKeyIdChange: vi.fn(), apiKeys: MASKED_KEYS };
    let tree = await h.mount(props);
    const options = all(tree, (n) => n.type === "option");
    expect(hasRaw(options)).toBe(false);
    for (const o of options) {
      find(h.render(), (n) => n.type === "select").props.onChange({ target: { value: o.props.value } });
    }
    expect(hasRaw(spies.upsertKeyPreset.mock.calls)).toBe(false);
    tree = h.render();
    expect(hasRaw(all(tree, (n) => n.type === "option"))).toBe(false);
  });
});

describe("F1 M2: key preset store", () => {
  const KEY = "krouter9.cliToolApiKeyPresets";
  let store;
  let writes;
  beforeEach(() => {
    store = new Map();
    writes = [];
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:20140" },
      localStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { writes.push([k, v]); store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
      },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    });
    vi.stubGlobal("CustomEvent", class { constructor(type) { this.type = type; } });
  });

  it("cleans legacy plaintext entries once, keeping only safe names", async () => {
    store.set(KEY, JSON.stringify([{ name: RAW.k1, key: RAW.k1 }, { name: "Work", key: RAW.k2 }]));
    const m = await import("@/app/(dashboard)/dashboard/cli-tools/components/cliEndpointPresets.js");
    const list = m.readKeyPresets();
    expect(list.map((p) => p.name)).toEqual(["Work"]);
    expect(hasRaw(list)).toBe(false);
    expect(hasRaw(store.get(KEY))).toBe(false);
    expect(hasRaw(writes)).toBe(false);
  });

  it("upsert requires a name and stores a masked label only", async () => {
    const m = await import("@/app/(dashboard)/dashboard/cli-tools/components/cliEndpointPresets.js");
    expect(m.upsertKeyPreset(RAW.k1)).toBeNull();
    expect(m.upsertKeyPreset(RAW.k1, "Laptop")).toBe("Laptop");
    const list = m.readKeyPresets();
    expect(list.map((p) => p.name)).toEqual(["Laptop"]);
    expect(hasRaw(list)).toBe(false);
    expect(hasRaw(writes)).toBe(false);
    expect(hasRaw(store.get(KEY) || "")).toBe(false);
  });
});
