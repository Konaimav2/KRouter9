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

afterEach(() => vi.unstubAllGlobals());
describe("Wave H1 composer controls", () => {
  it("names Send and provides a 44px target", () => {
    const h = playground();
    const send = byLabel(h.render(), "Send message");
    expect(send).toBeTruthy();
    expect(send.props.className).toContain("h-11 w-11");
  });
  it("keeps Text/Images menu alive through document mousedown then opens chooser", () => {
    const h = playground();
    byLabel(h.render(), "Attach").props.onClick();
    const tree = h.render();
    const menu = find(tree, n => n.props?.["data-attach-menu"] !== undefined);
    expect(menu).toBeTruthy();
    const listeners = {};
    vi.stubGlobal("document", { addEventListener: (name, fn) => { listeners[name] = fn; }, removeEventListener() {} });
    h.effects.find(fn => String(fn).includes("handleClickOutside"))();
    for (const [label, accept] of [["Images", "image/*"], ["Text files", ".txt"]]) {
      const input = find(tree, n => n.type === "input" && n.props.accept?.startsWith(accept));
      const click = vi.fn(); input.props.ref.current = { click };
      const button = find(tree, n => n.type === "button" && text(n).trim() === label);
      listeners.mousedown?.({ target: { closest: (selector) => selector === "[data-attach-menu]" ? menu : null } });
      expect(find(h.render(), n => n.type === "button" && text(n).trim() === label)).toBeTruthy();
      button.props.onClick(); expect(click).toHaveBeenCalledOnce();
      byLabel(h.render(), "Attach").props.onClick();
    }
  });
  it.each([["image/*", "fixture.png", "image/png"], [".txt", "fixture.txt", "text/plain"]])("%s chooser creates a visible attachment", async (accept, name, type) => {
    const h = playground();
    vi.stubGlobal("FileReader", class { readAsDataURL() { this.result = "data:image/png;base64,fixture"; this.onload(); } readAsText() { this.result = "fixture text"; this.onload(); } });
    const input = find(h.render(), n => n.type === "input" && n.props.accept?.startsWith(accept));
    await input.props.onChange({ target: { files: [{ name, type, size: 20 }], value: name } });
    expect(text(h.render())).toContain(name);
    expect(byLabel(h.render(), "Remove attachment")).toBeTruthy();
  });
});
