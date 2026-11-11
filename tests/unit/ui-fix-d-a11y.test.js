// Wave D (ui-fix plan): F6 accessible names, F7 44px touch targets, F15
// Change Log dialog focus + Escape, keyboard-reachable scroll regions, plus the
// Wave D extras: docs gateway origin, notice-button contrast token, and
// non-blocking secondary loads on providers/[id], proxy-pools and MITM.
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, traverse, transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as providersConst from "@/shared/constants/providers.js";
import * as modelsConst from "@/shared/constants/models.js";
import * as thinkingLevels from "open-sse/providers/thinkingLevels.js";
import * as appConfig from "@/shared/constants/config.js";
import * as proxyMask from "@/lib/proxyMask.js";
import * as providerCustomModels from "@/shared/utils/providerCustomModels.js";

const SRC = new URL("../../src/", import.meta.url);
const DASH = "app/(dashboard)/dashboard/";
const read = (file) => readFileSync(new URL(file, SRC), "utf8");

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ---- JSX source scanning ----------------------------------------------------
function jsxNameOf(node) {
  const n = node.openingElement.name;
  return n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? `${n.object.name}.${n.property.name}` : "";
}
function hasTextChild(children) {
  return children.some((child) => {
    if (child.type === "JSXText") return child.value.trim().length > 0;
    if (child.type === "JSXExpressionContainer") {
      const e = child.expression;
      if (e.type === "JSXEmptyExpression" || e.type === "JSXElement") return e.type === "JSXElement" && hasTextChild([e]);
      if (e.type === "LogicalExpression") return e.right.type !== "JSXElement" || hasTextChild([e.right]);
      if (e.type === "ConditionalExpression") return [e.consequent, e.alternate].some((b) => b.type !== "JSXElement" || hasTextChild([b]));
      return true;
    }
    if (child.type === "JSXElement") return jsxNameOf(child) !== "Icon" && hasTextChild(child.children);
    if (child.type === "JSXFragment") return hasTextChild(child.children);
    return false;
  });
}
function scanElements(file, tag) {
  const source = read(file);
  const ast = parseSync(source, { filename: file, presets: [[presetReact, { runtime: "classic" }]], babelrc: false, configFile: false });
  const out = [];
  traverse(ast, {
    JSXElement(path) {
      if (jsxNameOf(path.node) !== tag) return;
      const attrs = {};
      for (const attr of path.node.openingElement.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        attrs[attr.name.name] = attr.value ? source.slice(attr.value.start, attr.value.end) : "true";
      }
      out.push({ file, line: path.node.loc.start.line, attrs, hasText: hasTextChild(path.node.children) });
    },
  });
  return out;
}
const iconOnlyButtons = (file) => scanElements(file, "button").filter((b) => !b.hasText);
const is44 = (cls = "") => /\bsize-11\b/.test(cls) || (/\bmin-h-11\b/.test(cls) && /\bmin-w-11\b/.test(cls)) || /\bribbon-icon-action\b/.test(cls);

function walk(dir) {
  const abs = fileURLToPath(new URL(dir, SRC));
  return readdirSync(abs).flatMap((name) => {
    const full = join(abs, name);
    const rel = `${dir}${name}`;
    return statSync(full).isDirectory() ? walk(`${rel}/`) : name.endsWith(".js") ? [rel] : [];
  });
}

const PROVIDER_ROW_FILES = [
  `${DASH}providers/[id]/ModelRow.js`,
  `${DASH}providers/[id]/CompatibleModelsSection.js`,
  `${DASH}providers/[id]/PassthroughModelsSection.js`,
  `${DASH}providers/components/ModelsCard.js`,
];
const D_SELECT_FILES = [
  `${DASH}cli-tools/components/ApiKeySelect.js`,
  `${DASH}cli-tools/components/BaseUrlSelect.js`,
  `${DASH}cli-tools/components/EndpointPresetControl.js`,
];

// ---- F6 accessible names -----------------------------------------------------
describe("F6: accessible names", () => {
  it("every <select> under cli-tools has an accessible name (D3)", () => {
    const offenders = [];
    for (const file of walk(`${DASH}cli-tools/`)) {
      const source = read(file);
      for (const s of scanElements(file, "select")) {
        const id = s.attrs.id?.replace(/^["{]|["}]$/g, "");
        const labelled = s.attrs["aria-label"] || s.attrs["aria-labelledby"] || (id && source.includes(`htmlFor="${id}"`));
        if (!labelled) offenders.push(`${file}:${s.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every icon-only button under cli-tools has a name (D2 roo/amp)", () => {
    const offenders = [];
    for (const file of walk(`${DASH}cli-tools/`)) {
      for (const b of iconOnlyButtons(file)) if (!b.attrs["aria-label"] && !b.attrs["aria-labelledby"] && !b.attrs.title) offenders.push(`${file}:${b.line}`);
    }
    expect(offenders).toEqual([]);
  });

  it.each([...PROVIDER_ROW_FILES, ...D_SELECT_FILES])("%s: icon-only buttons carry aria-label", (file) => {
    const offenders = iconOnlyButtons(file).filter((b) => !b.attrs["aria-label"]).map((b) => `${file}:${b.line}`);
    expect(offenders).toEqual([]);
  });

  it("provider row action names include the model id", () => {
    for (const file of PROVIDER_ROW_FILES) {
      for (const b of iconOnlyButtons(file)) expect(b.attrs["aria-label"], `${file}:${b.line}`).toMatch(/\$\{(fullModel|displayModel|modelId)\}/);
    }
  });

  it("ApiKeySelect and BaseUrlSelect render a named <select>", () => {
    const stubs = {
      "./cliEndpointPresets": { readKeyPresets: () => [], upsertKeyPreset() {}, deleteKeyPreset() {}, subscribeKeyPresets: () => () => {}, readEndpointPresets: () => [], upsertEndpointPreset() {}, deleteEndpointPreset() {}, subscribeEndpointPresets: () => () => {}, readPresets: () => [], subscribePresets: () => () => {} },
    };
    const load = (file) => {
      const code = transformSync(read(file), { presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
      const mod = { exports: {} };
      new Function("require", "module", "exports", "React", code)((id) => (id === "react" ? React : stubs[id] || new Proxy({ __esModule: true, default: () => null }, { get: (o, k) => (k in o ? o[k] : () => [] ) })), mod, mod.exports, React);
      return mod.exports.default;
    };
    const ApiKeySelect = load(`${DASH}cli-tools/components/ApiKeySelect.js`);
    const BaseUrlSelect = load(`${DASH}cli-tools/components/BaseUrlSelect.js`);
    const a = renderToStaticMarkup(React.createElement(ApiKeySelect, { value: "", onChange() {}, apiKeys: [{ id: "k1", maskedKey: "sk-1•••abcd" }] }));
    const b = renderToStaticMarkup(React.createElement(BaseUrlSelect, { value: "", onChange() {} }));
    for (const html of [a, b]) expect(html).toMatch(/<select[^>]*aria-label="[^"]+"/);
    expect(renderToStaticMarkup(React.createElement(ApiKeySelect, { value: "", onChange() {}, apiKeys: [{ id: "k1" }], ariaLabel: "Codex API key" }))).toContain('aria-label="Codex API key"');
  });

  it("landing Navigation mobile menu button has a name, aria-expanded and aria-controls", () => {
    const states = [];
    let cursor = 0;
    const testReact = { ...React, useState: (init) => { const i = cursor++; if (!(i in states)) states[i] = init; return [states[i], (v) => { states[i] = typeof v === "function" ? v(states[i]) : v; }]; }, useId: () => "nav-menu" };
    const code = transformSync(read("app/landing/components/Navigation.js"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
    const mod = { exports: {} };
    new Function("require", "module", "exports", "React", code)((id) => (id === "react" ? testReact : id === "next/navigation" ? { useRouter: () => ({ push() {} }) } : { default: () => null }), mod, mod.exports, testReact);
    const render = () => { cursor = 0; return mod.exports.default(); };
    const find = (node, pred) => { if (!node || typeof node !== "object") return null; if (Array.isArray(node)) { for (const c of node) { const r = find(c, pred); if (r) return r; } return null; } if (pred(node)) return node; return find(React.Children.toArray(node.props?.children), pred); };
    const toggle = (tree) => find(tree, (n) => n.type === "button" && /\bmd:hidden\b/.test(n.props.className || ""));
    let btn = toggle(render());
    expect(btn.props["aria-label"]).toBeTruthy();
    expect(btn.props["aria-expanded"]).toBe(false);
    expect(btn.props["aria-controls"]).toBeTruthy();
    btn.props.onClick();
    const tree = render();
    btn = toggle(tree);
    expect(btn.props["aria-expanded"]).toBe(true);
    expect(find(tree, (n) => n.props?.id === btn.props["aria-controls"])).toBeTruthy();
    expect(is44(btn.props.className)).toBe(true);
  });
});

// ---- F7 44px touch targets -------------------------------------------------
const CSS = read("app/globals.css");
function cssRules() {
  const rules = [];
  for (const m of CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2], index: m.index });
  return rules;
}
const ROOT_VARS = Object.fromEntries([...CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("}", CSS.indexOf(":root {"))).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
function toPx(value) {
  const v = value.replace(/!important/, "").trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return toPx(ROOT_VARS[ref[1]] || "0");
  if (v.endsWith("rem")) return parseFloat(v) * 16;
  if (v.endsWith("px")) return parseFloat(v);
  return NaN;
}
// Last declaration of `prop` on a rule (any media) listing `selector` wins.
function lastPx(selector, prop) {
  let value;
  for (const rule of cssRules()) {
    if (!rule.selectors.includes(selector)) continue;
    for (const m of rule.body.matchAll(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`, "g"))) value = m[1];
  }
  return value === undefined ? NaN : toPx(value);
}

describe("F7: 44px touch targets", () => {
  it("header chrome resolves to >= 44px", () => {
    for (const sel of [".gateway-state button", ".ribbon-action", ".ribbon-icon-action", ".skip-link"]) expect(lastPx(sel, "min-height"), sel).toBeGreaterThanOrEqual(44);
    expect(lastPx(".ribbon-icon-action", "width")).toBeGreaterThanOrEqual(44);
    expect(lastPx(".ribbon-icon-action", "min-width")).toBeGreaterThanOrEqual(44);
  });

  it("Wave D rules are appended after Wave A's blocks", () => {
    const marker = CSS.indexOf("/* Wave D: touch targets");
    expect(marker).toBeGreaterThan(CSS.indexOf(".changelog-body hr"));
  });

  it("checkbox and radio labels give a 44px hit row; header search controls reach 44px", () => {
    expect(lastPx('label:has(> input[type="checkbox"])', "min-height")).toBeGreaterThanOrEqual(44);
    expect(lastPx(".route-ribbon__actions input", "min-height")).toBeGreaterThanOrEqual(44);
    expect(lastPx('.route-ribbon__actions button[aria-label="Clear search"]', "min-height")).toBeGreaterThanOrEqual(44);
    expect(lastPx('.route-ribbon__actions button[aria-label="Clear search"]', "min-width")).toBeGreaterThanOrEqual(44);
  });

  it("Toggle keeps its visual track and wraps it in a 44px switch hit box for every size", () => {
    const code = transformSync(read("shared/components/Toggle.js"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
    const mod = { exports: {} };
    new Function("require", "module", "exports", "React", code)((id) => (id === "react" ? React : { cn: (...p) => p.filter(Boolean).join(" ") }), mod, mod.exports, React);
    const tracks = { sm: "w-8 h-4", md: "w-11 h-6", lg: "w-14 h-7" };
    for (const [size, track] of Object.entries(tracks)) {
      const html = renderToStaticMarkup(React.createElement(mod.exports.default, { checked: true, size, ariaLabel: "x" }));
      const button = html.match(/<button[^>]*role="switch"[^>]*>/)[0];
      expect(button, size).toMatch(/min-h-11/);
      expect(button, size).toMatch(/min-w-11/);
      expect(html, size).toContain(track);
      expect(button, size).not.toContain(track);
    }
  });

  it.each([...PROVIDER_ROW_FILES, ...D_SELECT_FILES])("%s: icon-only buttons are 44px", (file) => {
    expect(iconOnlyButtons(file).filter((b) => !is44(b.attrs.className)).map((b) => `${file}:${b.line}`)).toEqual([]);
  });

  it.each([`${DASH}providers/[id]/ConnectionRow.js`, `${DASH}providers/components/ConnectionsCard.js`])("%s: move up/down are 44px", (file) => {
    const moves = scanElements(file, "button").filter((b) => /Move \$\{/.test(b.attrs["aria-label"] || ""));
    expect(moves.length).toBe(2);
    for (const b of moves) expect(is44(b.attrs.className), `${file}:${b.line}`).toBe(true);
  });

  it("hover-revealed row actions become visible on keyboard focus", () => {
    const offenders = [];
    for (const file of PROVIDER_ROW_FILES) {
      for (const b of scanElements(file, "button")) {
        const cls = b.attrs.className || "";
        if (/(^|[\s"`])(sm:)?opacity-0\b/.test(cls) && !/focus-visible:opacity-100/.test(cls)) offenders.push(`${file}:${b.line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("dialog close buttons and header icon buttons are 44px", () => {
    const close = (file, label) => scanElements(file, "button").filter((b) => (b.attrs["aria-label"] || "").includes(label));
    for (const [file, label] of [["shared/components/Modal.js", "Close dialog"], ["shared/components/ChangelogModal.js", "Close"], ["shared/components/LanguageSwitcher.js", "Close"]]) {
      const found = close(file, label).filter((b) => !/tabIndex=\{-1\}/.test(JSON.stringify(b.attrs)) && b.attrs.tabIndex !== "{-1}");
      expect(found.length, file).toBeGreaterThan(0);
      for (const b of found) expect(is44(b.attrs.className), `${file}:${b.line}`).toBe(true);
    }
    const lang = scanElements("shared/components/HeaderLanguage.js", "button")[0];
    expect(lang.attrs["aria-label"]).toBeTruthy();
    expect(is44(lang.attrs.className)).toBe(true);
    expect(read("shared/components/ThemeToggle.js")).not.toMatch(/size-10/);
  });

  it("shared Button sm and md sizes reach 44px", () => {
    const src = read("shared/components/Button.js");
    const sizes = src.match(/const sizes=\{([^}]*)\}/)[1];
    expect(sizes).toMatch(/sm:"[^"]*min-h-11/);
    expect(sizes).toMatch(/md:"[^"]*min-h-11/);
  });
});

// ---- F15 Change Log dialog -----------------------------------------------------
describe("F15: ChangelogModal focus management", () => {
  function setup() {
    const states = []; const refs = []; const effects = [];
    let cursor = 0; let refCursor = 0;
    const testReact = {
      ...React,
      useState: (init) => { const i = cursor++; if (!(i in states)) states[i] = typeof init === "function" ? init() : init; return [states[i], (v) => { states[i] = typeof v === "function" ? v(states[i]) : v; }]; },
      useRef: (v) => (refs[refCursor++] ||= { current: v }),
      useEffect: (fn) => effects.push(fn),
      useLayoutEffect: (fn) => effects.push(fn),
      useCallback: (fn) => fn,
      useId: () => "changelog",
    };
    const code = transformSync(read("shared/components/ChangelogModal.js"), { presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
    const mod = { exports: {} };
    const req = (id) => {
      if (id === "react") return testReact;
      if (id === "react-dom") return { createPortal: (el) => el };
      if (id === "marked") return { marked: { setOptions() {}, parse: (s) => s } };
      if (id === "prop-types") return { __esModule: true, default: new Proxy({}, { get: () => ({ isRequired: {} }) }) };
      if (id === "@/shared/constants/config") return { GITHUB_CONFIG: { changelogUrl: "/CHANGELOG.md" } };
      return { default: () => null };
    };
    new Function("require", "module", "exports", "React", code)(req, mod, mod.exports, testReact);
    const listeners = new Map();
    const opener = { focus: vi.fn(), isConnected: true };
    vi.stubGlobal("document", { body: {}, activeElement: opener, addEventListener: (n, fn) => listeners.set(n, fn), removeEventListener: (n) => listeners.delete(n) });
    vi.stubGlobal("requestAnimationFrame", (cb) => { cb(); return 1; });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const render = (props) => { cursor = 0; refCursor = 0; effects.length = 0; return mod.exports.default(props); };
    return { render, effects, listeners, opener };
  }
  const find = (node, pred) => { if (!node || typeof node !== "object") return null; if (Array.isArray(node)) { for (const c of node) { const r = find(c, pred); if (r) return r; } return null; } if (pred(node)) return node; return find(React.Children.toArray(node.props?.children), pred); };

  it("focuses the close button, closes on Escape, traps Tab and restores focus to the opener", () => {
    const h = setup();
    const onClose = vi.fn();
    const tree = h.render({ isOpen: true, onClose });
    const closeBtn = find(tree, (n) => n.type === "button" && n.props["aria-label"] === "Close");
    const dialog = find(tree, (n) => n.props?.role === "dialog");
    expect(closeBtn?.props.ref, "close button needs a ref").toBeTruthy();
    const closeEl = { focus: vi.fn() };
    const lastEl = { focus: vi.fn() };
    closeBtn.props.ref.current = closeEl;
    dialog.props.ref.current = { contains: () => true, querySelectorAll: () => [closeEl, lastEl] };
    const cleanups = h.effects.map((fn) => fn());
    expect(closeEl.focus).toHaveBeenCalled();

    const keydown = h.listeners.get("keydown");
    expect(keydown, "keydown listener on document").toBeTruthy();
    document.activeElement = lastEl;
    const tab = { key: "Tab", shiftKey: false, preventDefault: vi.fn() };
    keydown(tab);
    expect(tab.preventDefault).toHaveBeenCalled();
    expect(closeEl.focus).toHaveBeenCalledTimes(2);
    document.activeElement = closeEl;
    const shiftTab = { key: "Tab", shiftKey: true, preventDefault: vi.fn() };
    keydown(shiftTab);
    expect(lastEl.focus).toHaveBeenCalled();

    keydown({ key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(onClose).toHaveBeenCalledTimes(1);

    cleanups.forEach((fn) => fn?.());
    expect(h.opener.focus).toHaveBeenCalled();
    expect(h.listeners.has("keydown")).toBe(false);
  });

  it("the scrolling body is keyboard-reachable and named", () => {
    const h = setup();
    const tree = h.render({ isOpen: true, onClose() {} });
    const body = find(tree, (n) => /overflow-y-auto/.test(n.props?.className || ""));
    expect(body.props.tabIndex).toBe(0);
    expect(body.props["aria-label"]).toBeTruthy();
  });
});

// ---- extras ----------------------------------------------------------------
describe("Wave D extras", () => {
  it("docs page derives the client example origin from gatewayOrigin, no 20128 literal", () => {
    const src = read("app/docs/page.js");
    expect(src).not.toMatch(/20128/);
    expect(src).toMatch(/getGatewayOrigin/);
  });

  it("providers/[id] notice button uses the on-primary token pair, not white on blue-500", () => {
    const src = read(`${DASH}providers/[id]/page.js`);
    for (const m of src.matchAll(/className="([^"]*)"/g)) {
      expect(/\bbg-blue-500\b/.test(m[1]) && /\btext-white\b/.test(m[1]), m[1]).toBe(false);
    }
    const link = src.slice(src.indexOf("providerInfo.notice.apiKeyUrl && ("), src.indexOf("Get API Key →"));
    expect(link).toContain("bg-[var(--color-primary)]");
    expect(link).toContain("text-[var(--color-on-primary)]");
  });
});

// ---- non-blocking secondary loads (harness from Wave C) --------------------
function compile(file, requireFn) {
  const code = transformSync(read(file), { filename: file, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "React", code)(requireFn, mod, mod.exports, requireFn("react"));
  return mod.exports;
}
const passthrough = (props) => props?.children ?? null;
const stubModule = new Proxy({ __esModule: true, default: passthrough }, { get: (o, k) => o[k] || passthrough });
const LoadFailedState = compile("shared/components/LoadFailedState.js", (name) => (name === "react" ? React : stubModule)).default;
LoadFailedState.__expand = true;

function harness(file, mocks = {}) {
  const states = []; const refs = []; const effects = [];
  let cursor = 0; let refCursor = 0;
  const testReact = {
    ...React,
    useCallback: (cb) => cb,
    useMemo: (f) => f(),
    useEffect: (e) => { effects.push(e); },
    useLayoutEffect: () => {},
    useRef: (v) => (refs[refCursor++] ||= { current: v }),
    useState: (init) => { const i = cursor++; if (!(i in states)) states[i] = typeof init === "function" ? init() : init; return [states[i], (n) => { states[i] = typeof n === "function" ? n(states[i]) : n; }]; },
  };
  const known = {
    "next/navigation": { useParams: () => mocks.params || {}, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(""), usePathname: () => "/dashboard", notFound: () => { throw new Error("NEXT_NOT_FOUND"); } },
    "@/store/notificationStore": { useNotificationStore: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) },
    "@/shared/hooks/useTheme": { useTheme: () => ({ theme: "light", setTheme: vi.fn(), isDark: false }) },
    "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copied: false, copy: vi.fn() }) },
    "@/shared/hooks/useModelCaps": { useModelCaps: () => ({ getCaps: () => ({}) }) },
    "@/shared/constants/providers": providersConst,
    "@/shared/constants/models": modelsConst,
    "open-sse/providers/thinkingLevels.js": thinkingLevels,
    "@/shared/components/LoadFailedState": { __esModule: true, default: LoadFailedState },
    "@/shared/constants/config": appConfig,
    "@/lib/proxyMask.js": proxyMask,
    "@/shared/utils/providerCustomModels": providerCustomModels,
  };
  const exported = compile(file, (name) => (name === "react" ? testReact : name in known ? known[name] : stubModule));
  return {
    render() { cursor = 0; refCursor = 0; effects.length = 0; return exported.default({}); },
    async mount(wait = 0) { this.render(); effects.map((e) => e()); await flush(wait); return this.render(); },
  };
}
async function flush(wait = 0) {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}
function all(node, pred) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((c) => all(c, pred));
  if (typeof node.type === "function" && node.type.__expand) return all(node.type(node.props), pred);
  return [...(pred(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((c) => all(c, pred))];
}
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join(" ")
    : node && typeof node === "object" ? (typeof node.type === "function" && node.type.__expand ? text(node.type(node.props)) : React.Children.toArray(node.props?.children).map(text).join(" ")) : "");
function res(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, async json() { return body; }, async text() { return JSON.stringify(body); } };
}
function installFetch(routes, failing = {}) {
  const fetchMock = vi.fn(async (url) => {
    const u = String(url);
    for (const [prefix, mode] of Object.entries(failing)) if (u.startsWith(prefix)) { if (mode === "reject") throw new TypeError("Failed to fetch"); return res({ error: "boom" }, mode); }
    for (const [prefix, body] of routes) if (u.startsWith(prefix)) return res(body);
    return res({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const warnings = (tree) => all(tree, (n) => n.props?.["data-testid"] === "secondary-load-warning");

describe("secondary loads never hide the main list", () => {
  it("proxy-pools: a settings failure keeps the pool list and shows an inline warning", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    installFetch([["/api/proxy-pools", { proxyPools: [{ id: "p1", name: "pool-a", isActive: true }] }]], { "/api/settings": 500 });
    const tree = await harness(`${DASH}proxy-pools/page.js`).mount();
    expect(text(tree)).not.toContain("Couldn't load proxy pools");
    expect(text(tree)).toContain("pool-a");
    const w = warnings(tree);
    expect(w).toHaveLength(1);
    expect(w[0].props.role).toBe("status");
  });

  it("providers/[id]: settings and proxy-pool failures keep the provider page and warn inline", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    installFetch([["/api/providers", { connections: [] }], ["/api/provider-nodes", { nodes: [] }], ["/api/models", { aliases: {}, models: [] }]], { "/api/settings": 500, "/api/proxy-pools": "reject" });
    const tree = await harness(`${DASH}providers/[id]/page.js`, { params: { id: "openai" } }).mount();
    const flat = text(tree);
    expect(flat).not.toContain("Couldn't load this provider");
    expect(flat).not.toContain("Provider not found");
    expect(flat).toContain(providersConst.AI_PROVIDERS?.openai?.name || "OpenAI");
    const w = warnings(tree);
    expect(w).toHaveLength(1);
    expect(text(w[0])).toMatch(/proxy pools/i);
    expect(text(w[0])).toMatch(/settings/i);
  });

  it("MITM: alias and settings failures keep the server and tool ledgers and warn inline", async () => {
    installFetch([["/api/providers", { connections: [] }], ["/api/keys", { keys: [] }]], { "/api/models/alias": 500, "/api/settings": "reject" });
    const tree = await harness(`${DASH}mitm/MitmPageClient.js`).mount();
    const flat = text(tree);
    expect(flat).not.toContain("Couldn't load MITM data");
    expect(all(tree, (n) => typeof n.props?.onStatusChange === "function").length, "MitmServerCard rendered").toBeGreaterThan(0);
    expect(warnings(tree)).toHaveLength(1);
  });
});
