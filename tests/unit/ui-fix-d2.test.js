// Wave D2 (ui-fix): two Judge leftovers.
//  1. AntigravityToolCard never puts a raw gateway key into the DOM: options
//     use the key id as value and a masked label; the raw key is revealed
//     lazily (once) on Start MITM via the single-record reveal endpoint.
//  2. combos ModelItem: Move up / Move down / Remove are 44px targets with an
//     aria-label naming the model (not title-only, not 18px).
// Fixtures use fake keys only (sk-test-FAKE-*). Nothing here prints them.
import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as maskedKeyClient from "@/lib/maskedKeyClient.js";

const SRC = new URL("../../src/", import.meta.url);
const DASH = "app/(dashboard)/dashboard/";
const HOOK_FILE = "shared/hooks/useOnDemandKey.js";
const RAW = { k1: "sk-test-FAKE-k1-0000", k2: "sk-test-FAKE-k2-0000" };
// Legacy list shape that still carries `key`: the card must ignore it.
const KEYS_WITH_RAW = [
  { id: "k1", name: "Main", maskedKey: "sk-...MSK1", isActive: true, key: RAW.k1 },
  { id: "k2", name: "Backup", maskedKey: "sk-...MSK2", isActive: true, key: RAW.k2 },
];

function compile(file, requireFn, extraExport) {
  let source = readFileSync(new URL(file, SRC), "utf8");
  if (extraExport) source += `\nexport { ${extraExport} };`;
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
      if (existsSync(new URL(HOOK_FILE, SRC))) return (cache.hook ||= compile(HOOK_FILE, requireFn));
    }
    return stubModule;
  };
  const exported = compile(file, requireFn, exportName === "default" ? null : exportName);
  const Component = exported[exportName];
  let lastProps = {};
  return {
    render(props = lastProps) {
      lastProps = props;
      cursor = 0; refCursor = 0; effects.length = 0;
      return Component(props);
    },
    async mount(props) {
      this.render(props);
      for (const effect of [...effects]) effect();
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
const containsRaw = (tree) => Object.values(RAW).some((raw) => serialize(tree).includes(raw));

function json(body, { ok = true, status = 200 } = {}) {
  return { ok, status, headers: { get: () => null }, async json() { return body; } };
}

describe("Wave D2: AntigravityToolCard masks the gateway key", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async (url) => {
      const u = String(url);
      const reveal = u.match(/\/api\/keys\/([^/]+)\/reveal/);
      if (reveal) return json({ id: reveal[1], key: RAW[reveal[1]] });
      if (u.startsWith("/api/models/alias")) return json({ aliases: {} });
      if (u.includes("/alias?tool=")) return json({ aliases: {} });
      if (u.startsWith("/api/cli-tools/antigravity-mitm")) return json({ running: false, needsSudoPassword: false });
      return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  const FILE = `${DASH}cli-tools/components/AntigravityToolCard.js`;
  const tool = { id: "antigravity", name: "Antigravity", defaultModels: [] };
  const mocks = { "@/lib/maskedKeyClient": maskedKeyClient };
  const revealCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/reveal"));

  it("running: options are id-valued with masked labels; raw key never in the tree; zero reveals", async () => {
    const h = harness(FILE, "default", mocks);
    const tree = await h.mount({ tool, isExpanded: true, apiKeys: KEYS_WITH_RAW, initialStatus: { running: true }, hasActiveProviders: true });
    const options = all(tree, (n) => n.type === "option");
    expect(options.map((o) => o.props.value)).toEqual(expect.arrayContaining(["k1", "k2"]));
    expect(text(options[0])).toContain("sk-...MSK1");
    expect(containsRaw(tree)).toBe(false);
    expect(revealCalls()).toHaveLength(0);
  });

  it("Start MITM reveals the selected key once at click time and posts it", async () => {
    const h = harness(FILE, "default", mocks);
    const tree = await h.mount({ tool, isExpanded: true, apiKeys: KEYS_WITH_RAW, initialStatus: { running: false, needsSudoPassword: false }, hasActiveProviders: true });
    expect(containsRaw(tree)).toBe(false);
    const start = find(tree, (n) => typeof n.props?.onClick === "function" && text(n).includes("Start MITM"));
    start.props.onClick();
    await flush();
    expect(revealCalls()).toHaveLength(1);
    expect(String(revealCalls()[0][0])).toContain("/api/keys/k1/reveal");
    const post = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/cli-tools/antigravity-mitm" && init?.method === "POST");
    expect(JSON.parse(post[1].body).apiKey === RAW.k1).toBe(true);
    expect(containsRaw(h.render())).toBe(false);
  });
});

describe("Wave D2: combos ModelItem action buttons", () => {
  const FILE = `${DASH}combos/page.js`;
  const render = (props) => harness(FILE, "ModelItem", {
    "@dnd-kit/sortable": { __esModule: true, useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef() {}, transform: null, isDragging: false }) },
    "@dnd-kit/utilities": { __esModule: true, CSS: { Transform: { toString: () => undefined } } },
  }).render({ id: "m", index: 1, model: "openai/gpt-x", isFirst: false, isLast: false, onRename() {}, onMoveUp() {}, onMoveDown() {}, onRemove() {}, ...props });

  for (const [verb, handler] of [["Move up", "onMoveUp"], ["Move down", "onMoveDown"], ["Remove", "onRemove"]]) {
    it(`${verb} is a 44px target named for the model`, () => {
      const fn = vi.fn();
      const tree = render({ [handler]: fn });
      const btn = find(tree, (n) => n.type === "button" && n.props?.["aria-label"] === `${verb} openai/gpt-x`);
      expect(btn).toBeTruthy();
      expect(btn.props.type).toBe("button");
      const cls = btn.props.className.split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining(["size-11", "shrink-0"]));
      expect(cls).not.toContain("p-0.5");
      btn.props.onClick();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  }
});
