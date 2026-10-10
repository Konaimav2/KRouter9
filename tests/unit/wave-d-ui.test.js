import React from "react";
import { readFileSync } from "node:fs";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as playgroundModels from "../../src/shared/utils/playgroundModels.js";

const dashboard = new URL("../../src/app/(dashboard)/dashboard/", import.meta.url);
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
    useEffect: (effect) => effects.push(effect),
    useRef: (value) => refs[refCursor++] ||= { current: value },
    useState: (initial) => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
  };
  let source = readFileSync(new URL(file, dashboard), "utf8");
  // Optional historical fixture makes the same behavioral suite prove RED.
  if (process.env.WAVE_D_BASELINE) source = readFileSync(`${process.env.WAVE_D_BASELINE}/${file.split("/")[0]}.js`, "utf8");
  if (exportName !== "default") source += `\nexport { ${exportName} };`;
  const code = transformSync(source, {
    filename: file,
    presets: [[presetReact, { runtime: "classic" }]],
    plugins: [transformModulesCommonjs],
  }).code;
  const clientModule = { exports: {} };
  const passthrough = ({ children }) => children;
  const stubModule = new Proxy({ __esModule: true, default: passthrough }, { get: (object, key) => object[key] || passthrough });
  new Function("require", "module", "exports", "React", code)(
    (name) => name === "react" ? testReact : mocks[name] || stubModule, clientModule, clientModule.exports, testReact,
  );
  return {
    states, refs, effects,
    render: (props = {}) => { cursor = 0; refCursor = 0; effects.length = 0; return clientModule.exports[exportName](props); },
  };
}
function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [ ...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((child) => all(child, predicate)) ];
}
const find = (node, predicate) => all(node, predicate)[0];
const text = (node) => typeof node === "string" || typeof node === "number" ? String(node)
  : node && typeof node === "object" ? React.Children.toArray(node.props?.children).map(text).join(" ") : "";
const byLabel = (tree, label) => find(tree, (node) => node.props?.["aria-label"] === label);
const groups = [
  { providerId: "empty", providerName: "Empty", models: [] },
  { providerId: "active", providerName: "Active", models: [{ id: "active/model", name: "A model", requestModel: `active/${"long".repeat(80)}` }] },
  { providerId: "third", providerName: "Third", models: [{ id: "third/model", name: "Third model", requestModel: "third/model" }] },
];
function playground() {
  const h = harness("basic-chat/BasicChatPageClient.js", "default", {
    "@/shared/utils/playgroundModels.js": playgroundModels,
    "@/shared/constants/models": { getModelsByProviderId: () => [] },
    "@/shared/constants/providers": { isAnthropicCompatibleProvider: () => false, isOpenAICompatibleProvider: () => false },
    "open-sse/providers/thinkingLevels.js": { getThinkingLevels: () => null },
  });
  // Seed through real handlers instead of fixed hook offsets.
  let tree = h.render();
  const trigger = find(tree, (node) => node.props?.["aria-haspopup"] === "dialog");
  trigger.props.onClick();
  h.states[0] = groups;
  h.states[1] = false;
  return h;
}
function combo() {
  const h = harness("combos/page.js", "ComboCard", { "@dnd-kit/sortable": { arrayMove: (items, from, to) => {
    const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
  } } });
  const props = { combo: { id: "combo-1", name: "SafeCombo", models: ["a", "b", "c"] }, strategy: {} };
  const render = () => h.render(props);
  let tree = render();
  find(tree, (node) => node.props?.label === "Manage").props.onClick();
  tree = render();
  find(tree, (node) => node.props?.role === "menuitem").props.onClick();
  return { ...h, render };
}
const dragEvent = (position = 0, externalText = "0") => ({
  preventDefault: vi.fn(), clientY: position,
  dataTransfer: { setData: vi.fn(), getData: () => externalText },
  currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 100 }), contains: () => false },
});
afterEach(() => vi.unstubAllGlobals());

describe("Wave D settings navigation", () => {
  it("desktop INDEX and mobile select scroll the dashboard section and focus it", () => {
    const section = { scrollIntoView: vi.fn(), focus: vi.fn() };
    vi.stubGlobal("document", { cookie: "", getElementById: (id) => id === "dashboard-main" ? { contains: () => true } : section });
    vi.stubGlobal("window", { location: {}, matchMedia: () => ({ matches: false }), history: { replaceState: vi.fn() } });
    const h = harness("profile/page.js", "default", { "@/shared/hooks/useTheme": { useTheme: () => ({}) }, "@/shared/utils/cn": { cn: (...values) => values.filter(Boolean).join(" ") } });
    const tree = h.render();
    const link = find(tree, (node) => node.props?.href === "#routing");
    const event = { preventDefault: vi.fn(), detail: 1 };
    expect(link.props.onClick).toBeTypeOf("function");
    link.props.onClick(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(section.scrollIntoView).toHaveBeenLastCalledWith({ behavior: "smooth", block: "start" });
    expect(section.focus).toHaveBeenCalledWith({ preventScroll: true });
    find(tree, (node) => node.props?.id === "settings-section").props.onChange({ target: { value: "network" } });
    expect(section.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "#network");
    window.matchMedia = () => ({ matches: true });
    link.props.onClick(event);
    expect(section.scrollIntoView).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
    window.matchMedia = () => ({ matches: false });
    link.props.onClick({ ...event, detail: 0 });
    expect(section.scrollIntoView).toHaveBeenLastCalledWith({ behavior: "instant", block: "start" });
  });
});

describe("Wave D combo interactions", () => {
  it("shows insertion markers above/below rows, reorders on drop, and clears on drag end", () => {
    const h = combo();
    let rows = all(h.render(), (node) => node.props?.draggable === true);
    rows[0].props.onDragStart(dragEvent());
    rows[1].props.onDragOver(dragEvent(10));
    expect(find(h.render(), (node) => node.props?.["data-testid"] === "combo-drop-indicator").props.className).toContain("top-0");
    rows[1].props.onDragLeave({ currentTarget: { contains: () => false }, relatedTarget: null });
    expect(find(h.render(), (node) => node.props?.["data-testid"] === "combo-drop-indicator")).toBeUndefined();
    rows[1].props.onDragOver(dragEvent(80));
    let marker = find(h.render(), (node) => node.props?.["data-testid"] === "combo-drop-indicator");
    expect(marker).toBeTruthy();
    expect(marker.props.className).toContain("top-0"); // insertion before row three
    rows[1].props.onDrop(dragEvent(80));
    rows = all(h.render(), (node) => node.props?.draggable === true);
    expect(rows.map((row) => text(row).split(" ").filter(Boolean)[1])).toEqual(["b", "a", "c"]);
    expect(find(h.render(), (node) => node.props?.["data-testid"] === "combo-drop-indicator")).toBeUndefined();
    rows[0].props.onDragStart(dragEvent());
    rows[2].props.onDragOver(dragEvent(80));
    marker = find(h.render(), (node) => node.props?.["data-testid"] === "combo-drop-indicator");
    expect(marker.props.className).toContain("bottom-0");
    rows[2].props.onDragEnd();
    expect(find(h.render(), (node) => node.props?.["data-testid"] === "combo-drop-indicator")).toBeUndefined();
  });
  it("ignores unrelated external drag data instead of mutating route members", () => {
    const h = combo();
    const row = all(h.render(), (node) => node.props?.draggable)[2];
    row.props.onDrop(dragEvent(80, "0"));
    expect(text(h.render())).toContain("a");
    expect(all(h.render(), (node) => node.props?.draggable).map((item) => text(item).split(" ").filter(Boolean)[1])).toEqual(["a", "b", "c"]);
  });
  it("closes commands on outside mousedown and Escape, retaining inside clicks and cleaning listeners", () => {
    const listeners = {};
    const remove = vi.fn();
    vi.stubGlobal("document", { addEventListener: (name, handler) => { listeners[name] = handler; }, removeEventListener: remove });
    const h = harness("combos/page.js", "ComboCard");
    const props = { combo: { id: "x", name: "Route", models: [] } };
    const render = () => h.render(props);
    find(render(), (node) => node.props?.label === "Manage").props.onClick();
    let tree = render();
    const menuContainer = find(tree, (node) => node.props?.ref && find(node, (child) => child.props?.role === "menu"));
    expect(menuContainer).toBeTruthy();
    const focus = vi.fn();
    menuContainer.props.ref.current = { contains: (target) => target === "inside", querySelector: () => ({ focus }) };
    const cleanup = h.effects.map((effect) => effect()).find((value) => typeof value === "function");
    expect(listeners.mousedown).toBeTypeOf("function");
    listeners.mousedown({ target: "inside" });
    expect(find(render(), (node) => node.props?.role === "menu")).toBeTruthy();
    listeners.mousedown({ target: "outside" });
    expect(find(render(), (node) => node.props?.role === "menu")).toBeUndefined();
    find(render(), (node) => node.props?.label === "Manage").props.onClick();
    render();
    listeners.keydown({ key: "Escape", preventDefault: vi.fn() });
    expect(find(render(), (node) => node.props?.role === "menu")).toBeUndefined();
    expect(focus).toHaveBeenCalledOnce();
    cleanup();
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

describe("Wave D playground six gaps", () => {
  it("keeps connected zero-model scopes reachable after catalog load", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, status: 200, json: async () => url.startsWith("/api/providers") ? { connections: [{ id: "empty-key", provider: "empty" }] } : url === "/api/models/alias" ? { aliases: {} } : url === "/api/models/disabled" ? { disabled: {} } : url === "/api/combos" ? { combos: [] } : { models: [] } })));
    const h = playground();
    h.render();
    const cleanup = h.effects[2]();
    for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
    expect(h.states[0]).toHaveLength(1);
    expect(h.states[0][0].models).toEqual([]);
    cleanup();
  });
  it("renders policy recovery for empty scopes, and no-match search feedback separately", () => {
    const h = playground();
    const tree = h.render();
    expect(text(tree)).toContain("No picked models in this provider.");
    expect(find(tree, (node) => node.props?.href === "/dashboard/providers" && text(node) === "Open provider model policy")).toBeTruthy();
    find(tree, (node) => node.props?.id === "playground-model-search").props.onChange({ target: { value: "no-such-model" } });
    expect(text(h.render())).toContain("No models match this search.");
  });
  it("scope Arrow keys wrap, Home/End select extremes, and focus follows selection", () => {
    const h = playground();
    const scopes = () => React.Children.toArray(byLabel(h.render(), "Model provider scopes").props.children);
    const focus = [vi.fn(), vi.fn(), vi.fn()];
    const currentTarget = { parentElement: { querySelectorAll: () => focus.map((fn) => ({ focus: fn })) } };
    for (const [key, start, target] of [["ArrowDown", 0, 1], ["End", 1, 2], ["Home", 2, 0], ["ArrowUp", 0, 2], ["ArrowRight", 2, 0], ["ArrowLeft", 0, 2]]) {
      const event = { key, currentTarget, preventDefault: vi.fn() };
      expect(scopes()[start].props.onKeyDown).toBeTypeOf("function");
      scopes()[start].props.onKeyDown(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(scopes()[target].props["aria-pressed"]).toBe(true);
      expect(focus[target]).toHaveBeenCalled();
    }
  });
  it("truncates requestModel with full title and retains a close control at sm and above", () => {
    const h = playground();
    React.Children.toArray(byLabel(h.render(), "Model provider scopes").props.children)[1].props.onClick();
    const tree = h.render();
    const identifier = find(tree, (node) => node.props?.title === groups[1].models[0].requestModel);
    expect(identifier).toBeTruthy();
    expect(identifier.props.className).toContain("truncate");
    const close = byLabel(tree, "Close model picker");
    expect(close.props.className).not.toMatch(/sm:hidden|hidden/);
    close.props.onClick();
    expect(byLabel(h.render(), "Choose a model")).toBeUndefined();
  });
  it("expands and collapses composer without losing multiline draft", () => {
    const h = playground();
    let tree = h.render();
    find(tree, (node) => node.type === "textarea").props.onChange({ target: { value: "first\nsecond\nthird" } });
    tree = h.render();
    expect(find(tree, (node) => node.type === "textarea").props.rows).toBe(3);
    expect(byLabel(tree, "Expand composer")).toBeTruthy();
    byLabel(tree, "Expand composer").props.onClick();
    tree = h.render();
    expect(find(tree, (node) => node.type === "textarea").props.rows).toBe(10);
    expect(byLabel(tree, "Collapse composer").props["aria-expanded"]).toBe(true);
    byLabel(tree, "Collapse composer").props.onClick();
    expect(find(h.render(), (node) => node.type === "textarea").props.value).toBe("first\nsecond\nthird");
  });
  it("explains no sessions in desktop rail and mobile history", () => {
    const h = playground();
    let tree = h.render();
    expect(text(tree)).toContain("No sessions yet");
    byLabel(tree, "Open session history").props.onClick();
    tree = h.render();
    expect(text(byLabel(tree, "Session history"))).toContain("No sessions yet");
  });
});
