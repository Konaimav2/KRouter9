import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
const path = new URL("../../src/app/(dashboard)/dashboard/token-saver/TokenSaverClient.js", import.meta.url);
let states = [], cursor = 0, effects = [];
const Toggle = (props) => React.createElement("input", { type: "checkbox", checked: props.checked, disabled: props.disabled, readOnly: true });
const react = { ...React, useCallback: (fn) => fn, useEffect: (fn) => effects.push(fn), useRef: (v) => ({ current: v }), useState: (v) => { const i = cursor++; if (!(i in states)) states[i] = v; return [states[i], (next) => { states[i] = typeof next === "function" ? next(states[i]) : next; }]; } };
const mocks = { react, "@/shared/components": { Toggle, Button: ({ children, ...props }) => React.createElement("button", props, children), Input: (props) => React.createElement("input", props), ConfirmModal: () => null }, "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copy: vi.fn() }) }, "@/i18n/runtime": { getCurrentLocale: () => "en", onLocaleChange: () => () => {} }, "../endpoint/endpointConstants": { WENYAN_LOCALES: [], CAVEMAN_LEVELS: [], PONYTAIL_LEVELS: [] } };
const mod = { exports: {} };
const compiled = transformSync(readFileSync(path, "utf8"), { filename: path.pathname, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
new Function("require", "module", "exports", "React", compiled)((name) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, mod, mod.exports, react);
function tree() { cursor = 0; effects = []; return mod.exports.default(); }
function html() { return renderToStaticMarkup(tree()); }
function find(node, predicate) { if (!node || typeof node !== "object") return null; if (predicate(node)) return node; for (const child of React.Children.toArray(node.props?.children)) { const found = find(child, predicate); if (found) return found; } return null; }
async function load(fetcher) { vi.stubGlobal("fetch", fetcher); tree(); for (const effect of effects) effect(); for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => { states = []; }); afterEach(() => vi.unstubAllGlobals());
describe("Wave C token saver", () => {
  it("does not flash enabled RTK before settings hydrate", () => { const markup = html(); expect(markup).toContain("Loading token saver settings"); expect(markup).not.toContain('checked=""'); });
  it("loads the actual disabled RTK setting without dead tabs and links Headroom to one rail", async () => {
    await load(async (url) => ({ ok: true, json: async () => url === "/api/settings" ? { rtkEnabled: false } : {} }));
    const markup = html(); expect(markup).not.toContain('role="tab"'); expect(markup).not.toContain("Loading token saver settings");
    expect(markup.match(/Headroom setup rail/g)).toHaveLength(1); expect(markup).toContain('href="#headroom-install"');
    expect(find(tree(), (n) => n.type === Toggle).props.checked).toBe(false);
  });
  it("keeps controls unavailable and offers retry after settings failure", async () => { await load(async () => ({ ok: false })); expect(html()).toContain("Unable to load token saver settings"); expect(html()).toContain("Retry"); expect(html()).not.toContain('checked=""'); });
  it("explains external URL setup instead of offering a local install", async () => {
    await load(async (url) => ({ ok: true, json: async () => url === "/api/settings" ? { rtkEnabled: false, headroomUrl: "https://headroom.example.test" } : url === "/api/headroom/status" ? { localUrl: false, installed: false } : {} }));
    expect(html()).toContain("External service"); expect(html()).toContain("external URL"); expect(html()).not.toContain('pip install');
  });
});
