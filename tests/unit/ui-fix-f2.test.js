// Wave F2 (ui-fix QA re-walk r2): the defects still open after waves C0..F1.
//  F1  bg-sidebar (the dark rail token) paired with theme text renders dark on
//      dark in the light theme (1.00:1). Code-like blocks use code-bg/code-fg,
//      chips and panels use the theme surface pair; no bg-sidebar left in src/.
//  F6  media Example cards: named clear buttons and labelled inputs; media combo
//      back link named + 44px; web hub title "Web"; pxpipe h1; scrollable code
//      blocks focusable; docs/landing/misc contrast and naming rows from axe.
//  F7  44px targets: provider row actions, combos mode + member edit, endpoint
//      copy/key buttons, selection checkboxes (44px label), usage tabs.
//  F11 no 20128 literal (or UPDATER_CONFIG.appPort) in client code; Base URL
//      select and MITM default derive from getGatewayOrigin after mount.
//  F3  usage logs alert does not flap on poll; token-saver load failure uses
//      LoadFailedState (Retry inside the alert); pxpipe shows LoadFailedState.
//  Nit settings/pricing highlights the Settings destination (System zone).
// Every contrast ratio is computed from the real token values in globals.css.
import React from "react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, traverse, transformSync } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import transformModulesCommonjs from "next/dist/compiled/babel/plugin-transform-modules-commonjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as gatewayOrigin from "@/shared/utils/gatewayOrigin.js";
import * as providersConst from "@/shared/constants/providers.js";
import * as appConfig from "@/shared/constants/config.js";

const ROOT = new URL("../../", import.meta.url);
const SRC = new URL("../../src/", import.meta.url);
const SRC_DIR = fileURLToPath(SRC);
const DASH = "app/(dashboard)/dashboard/";
const MEDIA = `${DASH}media-providers/[kind]/[id]/components/`;
const CARDS = ["EmbeddingExampleCard.js", "GenericExampleCard.js", "TtsExampleCard.js", "SttExampleCard.js"].map((f) => `${MEDIA}${f}`);
const COMBO = `${DASH}media-providers/combo/[id]/page.js`;
const read = (file) => readFileSync(new URL(file, SRC), "utf8");
const css = readFileSync(new URL("src/app/globals.css", ROOT), "utf8");

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ---- token resolution (same method as ui-fix-a-tokens) ------------------------
function blockBody(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}
function parseVars(body) {
  const vars = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const darkVars = parseVars(blockBody(":root"));
const lightVars = { ...darkVars, ...parseVars(blockBody(":root:not(.dark)")) };
const themes = { dark: darkVars, light: lightVars };
function resolve(vars, name, depth = 0) {
  if (depth > 12) throw new Error(`var loop at ${name}`);
  if (name.startsWith("#")) return name;
  const raw = vars[name];
  if (raw === undefined) return undefined;
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolve(vars, ref[1], depth + 1) : raw;
}
function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(theme, fg, bg) {
  const a = resolve(themes[theme], fg);
  const b = resolve(themes[theme], bg);
  if (!(a || "").startsWith("#") || !(b || "").startsWith("#")) throw new Error(`${theme}: ${fg}=${a} ${bg}=${b} unresolved`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// ---- JSX source scanning ------------------------------------------------------
function jsxNameOf(node) {
  const n = node.openingElement.name;
  return n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? `${n.object.name}.${n.property.name}` : "";
}
function hasTextChild(children) {
  return children.some((child) => {
    if (child.type === "JSXText") return child.value.trim().length > 0;
    if (child.type === "JSXExpressionContainer") {
      const e = child.expression;
      if (e.type === "JSXEmptyExpression") return false;
      if (e.type === "JSXElement") return hasTextChild([e]);
      if (e.type === "LogicalExpression") return e.right.type !== "JSXElement" || hasTextChild([e.right]);
      if (e.type === "ConditionalExpression") return [e.consequent, e.alternate].some((b) => b.type !== "JSXElement" || hasTextChild([b]));
      return true;
    }
    if (child.type === "JSXElement") return !["Icon"].includes(jsxNameOf(child)) && hasTextChild(child.children);
    if (child.type === "JSXFragment") return hasTextChild(child.children);
    return false;
  });
}
const FOCUSABLE = new Set(["button", "a", "input", "select", "textarea", "Link", "Button", "Toggle"]);
function scan(file) {
  const source = read(file);
  const ast = parseSync(source, { filename: file, presets: [[presetReact, { runtime: "classic" }]], babelrc: false, configFile: false });
  const out = [];
  traverse(ast, {
    JSXElement(path) {
      const attrs = {};
      for (const attr of path.node.openingElement.attributes) {
        if (attr.type !== "JSXAttribute") continue;
        attrs[attr.name.name] = attr.value ? source.slice(attr.value.start, attr.value.end) : "true";
      }
      const parentEl = path.findParent((p) => p.isJSXElement());
      const parent = parentEl ? { tag: jsxNameOf(parentEl.node), className: (parentEl.node.openingElement.attributes.find((a) => a.name?.name === "className")?.value && source.slice(parentEl.node.openingElement.attributes.find((a) => a.name?.name === "className").value.start, parentEl.node.openingElement.attributes.find((a) => a.name?.name === "className").value.end)) || "" } : null;
      let focusableInside = false;
      path.traverse({ JSXElement(inner) { if (FOCUSABLE.has(jsxNameOf(inner.node))) focusableInside = true; } });
      out.push({ file, tag: jsxNameOf(path.node), line: path.node.loc.start.line, attrs, parent, hasText: hasTextChild(path.node.children), focusableInside, text: source.slice(path.node.start, path.node.end) });
    },
  });
  return out;
}
const cls = (el) => el.attrs.className || "";
const named = (el) => Boolean(el.attrs["aria-label"] || el.attrs["aria-labelledby"]);
const is44 = (c = "") => /\bsize-11\b/.test(c) || (/\b(min-)?h-11\b/.test(c) && /\b(min-)?w-11\b/.test(c));
const tall44 = (c = "") => /\b(min-h-11|h-11|size-11|min-h-12)\b/.test(c);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
const ALL_SRC = walk(SRC_DIR).map((full) => relative(SRC_DIR, full).split("\\").join("/"));

// ---- component harness ----------------------------------------------------------
function compile(file, requireFn, exportNames = []) {
  let source = read(file);
  if (exportNames.length) source += `\nexport { ${exportNames.join(", ")} };`;
  const code = transformSync(source, { filename: file, presets: [[presetReact, { runtime: "classic" }]], plugins: [transformModulesCommonjs] }).code;
  const mod = { exports: {} };
  new Function("require", "module", "exports", "React", code)(requireFn, mod, mod.exports, requireFn("react"));
  return mod.exports;
}
const passthrough = (props) => props?.children ?? null;
const stubModule = new Proxy({ __esModule: true, default: passthrough }, { get: (o, k) => o[k] || passthrough });
const LoadFailedState = compile("shared/components/LoadFailedState.js", (name) => (name === "react" ? React : stubModule)).default;
LoadFailedState.__expand = true;

function harness(file, { mocks = {}, exportNames = [] } = {}) {
  const states = [];
  const history = [];
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
      if (!(index in states)) { states[index] = typeof initial === "function" ? initial() : initial; history[index] = [states[index]]; }
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; history[index].push(states[index]); }];
    },
  };
  const requireFn = (name) => {
    if (name === "react") return testReact;
    if (name in mocks) return mocks[name];
    if (name === "@/shared/components/LoadFailedState") return { __esModule: true, default: LoadFailedState };
    if (name === "@/shared/utils/gatewayOrigin") return gatewayOrigin;
    return stubModule;
  };
  const exported = compile(file, requireFn, exportNames);
  let lastProps = {};
  return {
    states, history, exports: exported,
    render(props = lastProps) { lastProps = props; cursor = 0; refCursor = 0; effects.length = 0; return exported.default(props); },
    runEffects() { return [...effects].map((effect) => effect()); },
    async mount(props) { this.render(props); this.runEffects(); await flush(); return this.render(); },
  };
}
async function flush() { for (let i = 0; i < 15; i++) await new Promise((r) => setTimeout(r, 0)); }
function all(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => all(child, predicate));
  if (typeof node.type === "function" && node.type.__expand) return [...(predicate(node) ? [node] : []), ...all(node.type(node.props), predicate)];
  return [...(predicate(node) ? [node] : []), ...React.Children.toArray(node.props?.children).flatMap((child) => all(child, predicate))];
}
const text = (node) => (typeof node === "string" || typeof node === "number" ? String(node)
  : Array.isArray(node) ? node.map(text).join(" ")
    : node && typeof node === "object"
      ? (typeof node.type === "function" && node.type.__expand ? text(node.type(node.props)) : React.Children.toArray(node.props?.children).map(text).join(" "))
      : "");
function res(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, async json() { return body; }, async text() { return JSON.stringify(body); } };
}

// =================================================================================
describe("F1 surfaces: token pairs computed from globals.css", () => {
  it("documents the defect: theme text on bg-sidebar is unreadable in light", () => {
    expect(contrast("light", "--color-text-main", "--color-sidebar")).toBeLessThan(1.5);
    expect(contrast("light", "--color-text-muted", "--color-sidebar")).toBeLessThan(4.5);
  });
  const PAIRS = [
    ["--color-code-fg", "--color-code-bg"],
    ["--color-code-muted", "--color-code-bg"],
    ["--color-text-main", "--color-surface-2"],
    ["--color-text-muted", "--color-surface-2"],
    ["--color-primary", "--color-surface-2"],
    ["--color-text-muted", "--color-surface"],
    ["--color-danger", "--color-surface"],
    ["--color-danger", "--color-bg"],
  ];
  for (const theme of ["light", "dark"]) {
    for (const [fg, bg] of PAIRS) {
      it(`${theme}: ${fg} on ${bg} >= 4.5:1`, () => {
        expect(contrast(theme, fg, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});

describe("F1 surfaces: no bg-sidebar outside the rail", () => {
  it("no bg-sidebar utility (any variant) anywhere in src/", () => {
    const offenders = [];
    for (const file of ALL_SRC) {
      const lines = read(file).split("\n");
      lines.forEach((line, i) => { if (/(^|[\s"'`:])bg-sidebar\b/.test(line)) offenders.push(`${file}:${i + 1}`); });
    }
    expect(offenders).toEqual([]);
  });

  it.each([...CARDS, COMBO])("%s: code-like blocks use the code-bg/code-fg pair at full opacity", (file) => {
    const blocks = scan(file).filter((el) => el.tag === "pre" || (el.tag === "code" && /\bbg-/.test(cls(el))));
    expect(blocks.length, file).toBeGreaterThan(0);
    for (const el of blocks) {
      const c = cls(el);
      expect(c, `${file}:${el.line}`).toMatch(/bg-code-bg|bg-\[var\(--color-code-bg\)\]/);
      expect(c, `${file}:${el.line}`).toMatch(/text-code-(fg|muted)|text-\[var\(--color-code-(fg|muted)\)\]/);
      expect(c, `${file}:${el.line}`).not.toMatch(/\bopacity-\d+/);
    }
  });

  it.each([
    `${DASH}providers/[id]/ModelRow.js`,
    `${DASH}providers/components/ModelsCard.js`,
    `${DASH}providers/[id]/CompatibleModelsSection.js`,
    `${DASH}providers/[id]/PassthroughModelsSection.js`,
  ])("%s: model chips use the surface-2 pair and no faded /70 text", (file) => {
    const chips = scan(file).filter((el) => el.tag === "code");
    expect(chips.length).toBeGreaterThan(0);
    for (const el of chips) expect(cls(el), `${file}:${el.line}`).toMatch(/\bbg-surface-2\b/);
    expect(read(file)).not.toMatch(/text-text-muted\/70/);
  });
});

// =================================================================================
describe("F6 media Example cards: names and labels", () => {
  it.each([...CARDS, COMBO])("%s: every input/select/textarea is named", (file) => {
    const fields = scan(file).filter((el) => ["input", "select", "textarea"].includes(el.tag) && !/"hidden"/.test(el.attrs.type || "") && !el.attrs.id);
    expect(fields.filter((el) => !named(el)).map((el) => `${file}:${el.line}`)).toEqual([]);
  });

  it.each([...CARDS, COMBO])("%s: every icon-only button has an aria-label", (file) => {
    const buttons = scan(file).filter((el) => el.tag === "button" && !el.hasText);
    expect(buttons.filter((el) => !named(el)).map((el) => `${file}:${el.line}`)).toEqual([]);
  });

  it.each([...CARDS, COMBO])("%s: error copy uses the danger token, not text-red-500", (file) => {
    expect(read(file)).not.toMatch(/text-red-500/);
  });

  it.each([...CARDS, COMBO])("%s: Reveal/Hide key button is 44px tall", (file) => {
    const reveal = scan(file).filter((el) => el.tag === "button" && /aria-pressed=\{!!revealedKey\}/.test(el.text));
    expect(reveal.length).toBeGreaterThan(0);
    for (const el of reveal) expect(tall44(cls(el)), `${file}:${el.line}`).toBe(true);
  });

  it("embedding endpoint placeholder is not a hardcoded localhost:3000", () => {
    expect(read(`${MEDIA}EmbeddingExampleCard.js`)).not.toMatch(/localhost:3000/);
  });

  it("media combo back link is named and 44px; remove buttons are named and 44px", () => {
    const els = scan(COMBO);
    const back = els.find((el) => el.tag === "Link" && /backHref/.test(el.attrs.href || ""));
    expect(back).toBeTruthy();
    expect(named(back)).toBe(true);
    expect(is44(cls(back))).toBe(true);
    const remove = els.filter((el) => el.tag === "button" && /handleRemoveProvider/.test(el.attrs.onClick || ""));
    expect(remove.length).toBe(1);
    expect(named(remove[0])).toBe(true);
    expect(is44(cls(remove[0]))).toBe(true);
  });
});

describe("F6 headings", () => {
  const header = () => harness("shared/components/Header.js", { exportNames: ["getPageInfo"], mocks: { "@/shared/constants/providers": providersConst, "@/shared/constants/config": appConfig, "@/shared/utils/providerIcon": { getProviderIconSrc: () => "" } } }).exports.getPageInfo;
  it("the web media hub title is capitalised 'Web'", () => {
    expect(header()("/dashboard/media-providers/web").title).toBe("Web");
  });
  it("pxpipe gets a route title (rendered as the ribbon h1)", () => {
    expect(header()("/dashboard/pxpipe").title).toBeTruthy();
  });
  it("route ribbon title sets an explicit theme colour (no inherited #000 on dark 404s)", () => {
    const rule = css.match(/\.route-ribbon__title[^{]*\{([^}]*)\}/);
    expect(rule).toBeTruthy();
    const all = [...css.matchAll(/(^|\n)([^{}\n]*\.route-ribbon__title[^{}]*)\{([^}]*)\}/g)].map((m) => m[3]).join(";");
    expect(all).toMatch(/(^|[;\s])color:\s*var\(--color-text\)/);
  });
});

describe("F6 scrollable regions are keyboard focusable and named", () => {
  const SCOPE = ALL_SRC.filter((f) => f.startsWith(`${DASH}cli-tools/`) || f.startsWith(`${DASH}token-saver/`) || f.startsWith(`${DASH}pxpipe/`) || f.startsWith(MEDIA) || f === COMBO || f === "shared/components/SegmentedControl.js");
  it("scope covers the cli tool cards", () => { expect(SCOPE.length).toBeGreaterThan(20); });
  it("every overflow-auto / overflow-x-auto element without focusable content has tabIndex={0} and a name", () => {
    const offenders = [];
    for (const file of SCOPE) {
      for (const el of scan(file)) {
        const c = cls(el);
        if (!/\boverflow-(x-)?auto\b/.test(c)) continue;
        if (el.focusableInside) continue;
        if (el.attrs.tabIndex !== "{0}" || !named(el)) offenders.push(`${file}:${el.line} <${el.tag}>`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("F6 docs, landing and misc axe rows", () => {
  it("docs CopyButton on code surfaces uses the code-muted token and is 44px", () => {
    const src = read("app/docs/CopyButton.js");
    expect(src).toMatch(/code:\s*"[^"]*text-\[var\(--color-code-muted\)\]/);
    const btn = scan("app/docs/CopyButton.js").find((el) => el.tag === "button");
    expect(btn.attrs.className).toMatch(/TONES\[tone\]/);
    expect(tall44(btn.attrs.className)).toBe(true);
    expect(read("app/docs/page.js")).toMatch(/<CopyButton[^>]*tone="code"/);
  });
  it("landing copy avoids text-gray-500 (3.2-3.9:1 on the landing surfaces)", () => {
    const offenders = ALL_SRC.filter((f) => f.startsWith("app/landing/") && /text-gray-500/.test(read(f)));
    expect(offenders).toEqual([]);
    // gray-400 (#99a1af) on the landing surfaces (#120f0d, #252526)
    expect(contrast("dark", "#99a1af", "#120f0d")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("dark", "#99a1af", "#252526")).toBeGreaterThanOrEqual(4.5);
  });
  it("landing footer icon link is named; logo button name contains its visible text", () => {
    const icon = scan("app/landing/components/Footer.js").filter((el) => el.tag === "a" && !el.hasText);
    expect(icon.length).toBeGreaterThan(0);
    for (const el of icon) expect(named(el), `Footer.js:${el.line}`).toBe(true);
    const logo = scan("app/landing/components/Navigation.js").find((el) => el.tag === "button" && /router\.push\("\/"\)/.test(el.attrs.onClick || ""));
    expect(logo.attrs["aria-label"] || "").toMatch(/KRouter9/);
  });
  it("quota order button name contains its visible text and is 44px", () => {
    const btn = scan(`${DASH}usage/components/ProviderLimits/index.js`).find((el) => el.tag === "button" && /toggleExpiringSort/.test(el.attrs.onClick || ""));
    expect(btn.attrs["aria-label"]).toMatch(/Expiring first/);
    expect(btn.attrs["aria-label"]).toMatch(/A-Z/);
    expect(btn.attrs["aria-label"]).toMatch(/"Expiring first[^"]*"\s*:\s*"A-Z/);
    expect(tall44(cls(btn))).toBe(true);
  });
  it("provider thinking select has an aria-label (not title-only)", () => {
    const sel = scan(`${DASH}providers/[id]/page.js`).find((el) => el.tag === "select" && /Appends \(level\) suffix/.test(el.attrs.title || ""));
    expect(named(sel)).toBe(true);
  });
  it("mitm warning heading uses the text token (amber on amber wash is 4.34:1)", () => {
    expect(read(`${DASH}mitm/MitmPageClient.js`)).not.toMatch(/<h2 className="[^"]*text-\[var\(--color-warning\)\][^"]*">Traffic interception warning/);
  });
  it("disabled media provider cards do not fade text with opacity", () => {
    expect(read(`${DASH}media-providers/[kind]/page.js`)).not.toMatch(/allDisabled \? "opacity-50"/);
  });
});

// =================================================================================
describe("F7 touch targets", () => {
  it.each([`${DASH}providers/[id]/ConnectionRow.js`, `${DASH}providers/components/ConnectionsCard.js`])("%s: Proxy / Auto-ping / Edit / Delete row actions are 44px", (file) => {
    const actions = scan(file).filter((el) => el.tag === "button" && /\bflex-col\b/.test(cls(el)) && /text-\[10px\]/.test(el.text));
    expect(actions.length).toBeGreaterThanOrEqual(3);
    for (const el of actions) expect(is44(cls(el)), `${file}:${el.line}`).toBe(true);
  });

  it("combos: Fallback / Round robin and the member edit button are 44px tall", () => {
    const els = scan(`${DASH}combos/page.js`);
    const modes = els.filter((el) => el.tag === "button" && /patch\(\{ roundRobin/.test(el.attrs.onClick || ""));
    expect(modes.length).toBe(2);
    for (const el of modes) expect(tall44(cls(el)), `combos:${el.line}`).toBe(true);
    const edit = els.find((el) => el.tag === "button" && /startEdit\(index\)/.test(el.attrs.onClick || ""));
    expect(tall44(cls(edit))).toBe(true);
  });

  it("endpoint: row Copy button and key row icon buttons are 44px", () => {
    const copy = scan(`${DASH}endpoint/components/EndpointRow.js`).find((el) => el.tag === "button");
    expect(tall44(cls(copy))).toBe(true);
    const page = read(`${DASH}endpoint/EndpointPageClient.js`);
    expect(page).not.toMatch(/grid size-9/);
  });

  it("SegmentedControl (usage tabs, period, mode) sizes are all >= 44px", () => {
    const src = read("shared/components/SegmentedControl.js");
    const sizes = src.match(/const sizes = \{([\s\S]*?)\};/)[1];
    for (const size of ["sm", "md", "lg"]) expect(sizes).toMatch(new RegExp(`${size}: "[^"]*\\b(min-h-11|min-h-12)\\b`));
    expect(sizes).not.toMatch(/\bh-(7|9)\b/);
  });

  it.each([`${DASH}providers/[id]/page.js`, `${DASH}proxy-pools/page.js`])("%s: selection checkboxes sit in a 44px label", (file) => {
    const boxes = scan(file).filter((el) => el.tag === "input" && /"checkbox"/.test(el.attrs.type || ""));
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (const el of boxes) {
      expect(el.parent?.tag, `${file}:${el.line}`).toBe("label");
      expect(tall44(el.parent.className), `${file}:${el.line}`).toBe(true);
    }
  });
});

// =================================================================================
describe("F11 gateway origin in client code", () => {
  const SERVER_ONLY = (f) => f.startsWith("app/api/") || f.startsWith("lib/") || f.startsWith("mitm/") || f === "shared/utils/gatewayOrigin.js" || f === "shared/constants/config.js";
  it("no 20128 literal in client-reachable src/ files", () => {
    const offenders = ALL_SRC.filter((f) => !SERVER_ONLY(f) && /20128/.test(read(f)));
    expect(offenders).toEqual([]);
  });
  it("no client component reads UPDATER_CONFIG.appPort", () => {
    const offenders = ALL_SRC.filter((f) => /^\s*["']use client["']/.test(read(f)) && /UPDATER_CONFIG\.appPort/.test(read(f)));
    expect(offenders).toEqual([]);
    expect(read(`${DASH}cli-tools/components/cliEndpointPresets.js`)).not.toMatch(/UPDATER_CONFIG\.appPort/);
  });

  function baseUrlSelect(origin) {
    vi.stubGlobal("window", { location: { origin }, prompt: () => null, addEventListener() {}, removeEventListener() {} });
    const onChange = vi.fn();
    const presets = { readPresets: () => [], upsertPreset: vi.fn(), deletePreset: vi.fn(), subscribePresets: () => () => {}, stripSlash: (u) => String(u || "").replace(/\/+$/, "") };
    const h = harness(`${DASH}cli-tools/components/BaseUrlSelect.js`, { mocks: { "./cliEndpointPresets": presets, "@/shared/constants/config": { UPDATER_CONFIG: { appPort: 20128 } } } });
    h.render({ value: "", onChange });
    h.runEffects();
    h.render({ value: "", onChange });
    h.runEffects();
    const tree = h.render({ value: "", onChange });
    const options = all(tree, (n) => n.type === "option").map((n) => text(n).trim());
    return { options, onChange };
  }
  it("Base URL select local option and default follow the page origin", () => {
    const { options, onChange } = baseUrlSelect("http://10.1.2.3:20141");
    expect(options).toContain("http://10.1.2.3:20141/v1");
    expect(options.join(" ")).not.toMatch(/20128/);
    expect(onChange).toHaveBeenCalledWith("http://10.1.2.3:20141/v1");
  });
  it("Base URL select pins localhost to the loopback address", () => {
    const { options } = baseUrlSelect("http://localhost:20141");
    expect(options).toContain("http://127.0.0.1:20141/v1");
  });

  it("gatewayOrigin recognises the stored server default so the MITM field shows the page origin", () => {
    expect(typeof gatewayOrigin.isDefaultGatewayOrigin).toBe("function");
    expect(gatewayOrigin.isDefaultGatewayOrigin("http://localhost:20128")).toBe(true);
    expect(gatewayOrigin.isDefaultGatewayOrigin("http://127.0.0.1:20128/")).toBe(true);
    expect(gatewayOrigin.isDefaultGatewayOrigin("http://10.0.0.5:20141")).toBe(false);
    expect(read(`${DASH}cli-tools/components/MitmServerCard.js`)).toMatch(/isDefaultGatewayOrigin\(/);
  });
});

// =================================================================================
describe("F3 failure states", () => {
  it("usage logs: a persistent poll failure never clears the error (no alert/Retry flap)", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async () => (fail ? res({ error: "x" }, 500) : res(["10:00 | m | p | r | 1 | 2 | OK"]))));
    vi.stubGlobal("setInterval", () => 0);
    vi.stubGlobal("clearInterval", () => {});
    const h = harness(`${DASH}usage/components/UsageLogs.js`, { mocks: { "lucide-react": stubModule, "@/shared/components/Toggle": stubModule } });
    h.render();
    h.runEffects();
    await flush();
    const errorIndex = h.states.findIndex((v) => typeof v === "string" && /could not be refreshed/.test(v));
    expect(errorIndex).toBeGreaterThanOrEqual(0);
    // poll again while still failing: the error must not blink to ""
    const fetchLogs = () => all(h.render(), (n) => n.type === LoadFailedState)[0].props.onRetry;
    const before = h.history[errorIndex].length;
    fetchLogs()();
    await flush();
    expect(h.history[errorIndex].slice(before)).not.toContain("");
    expect(h.states[errorIndex]).toMatch(/could not be refreshed/);
    // success clears it
    fail = false;
    fetchLogs()();
    await flush();
    expect(h.states[errorIndex]).toBe("");
  });

  it("token saver: a settings load failure renders LoadFailedState with Retry inside the alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res({}, 500)));
    const Button = ({ children, ...props }) => React.createElement("button", props, children);
    const h = harness(`${DASH}token-saver/TokenSaverClient.js`, {
      mocks: {
        "@/shared/components": new Proxy({ Button, Toggle: () => null, Input: () => null, ConfirmModal: () => null }, { get: (o, k) => o[k] || passthrough }),
        "@/shared/hooks/useCopyToClipboard": { useCopyToClipboard: () => ({ copy: vi.fn() }) },
        "@/i18n/runtime": { getCurrentLocale: () => "en", onLocaleChange: () => () => {} },
        "../endpoint/endpointConstants": { WENYAN_LOCALES: [], CAVEMAN_LEVELS: [], PONYTAIL_LEVELS: [] },
      },
    });
    const tree = await h.mount();
    const alert = all(tree, (n) => n.type === LoadFailedState)[0];
    expect(alert, "LoadFailedState").toBeTruthy();
    expect(typeof alert.props.onRetry).toBe("function");
    expect(text(tree)).toContain("Unable to load token saver settings");
  });

  it("token saver: the settings-not-saved alert carries a Retry", () => {
    const src = read(`${DASH}token-saver/TokenSaverClient.js`);
    const block = src.slice(src.indexOf("{settingsActionError && ("), src.indexOf("{settingsActionError && (") + 900);
    expect(block).toMatch(/role="alert"/);
    expect(block).toMatch(/>\s*Retry\s*</);
  });

  for (const mode of [500, "reject"]) {
    it(`pxpipe: a failed status load (${mode}) shows LoadFailedState, not "Not installed"`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => { if (mode === "reject") throw new TypeError("Failed to fetch"); return res({ error: "boom" }, 500); }));
      const h = harness(`${DASH}pxpipe/PxpipeClient.js`, { mocks: { "lucide-react": stubModule, recharts: stubModule, "@/shared/components": stubModule } });
      const tree = await h.mount();
      const alert = all(tree, (n) => n.type === LoadFailedState)[0];
      expect(alert, "LoadFailedState").toBeTruthy();
      expect(typeof alert.props.onRetry).toBe("function");
      expect(JSON.stringify(all(tree, (n) => n.props?.label === "Status").map((n) => n.props.value))).not.toContain("Not installed");
    });
  }

  it("pxpipe: a healthy load shows no alert", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => res(String(url).includes("status") ? { installed: true, running: true } : String(url).includes("logs") ? { logs: [] } : {})));
    const h = harness(`${DASH}pxpipe/PxpipeClient.js`, { mocks: { "lucide-react": stubModule, recharts: stubModule, "@/shared/components": stubModule } });
    const tree = await h.mount();
    expect(all(tree, (n) => n.type === LoadFailedState)).toHaveLength(0);
  });
});

// =================================================================================
describe("Nit: settings/pricing sidebar zone", () => {
  it("/dashboard/settings/pricing makes the Settings destination current (System zone)", () => {
    const h = harness("shared/components/Sidebar.js", {
      exportNames: ["ZONES", "isDestinationActive"],
      mocks: { "next/navigation": { usePathname: () => "/dashboard/settings/pricing" }, "@/shared/constants/config": { APP_CONFIG: { name: "K", version: "0" }, UPDATER_CONFIG: {} } },
    });
    const { ZONES, isDestinationActive } = h.exports;
    const active = ZONES.flatMap((zone) => zone.items.filter(([href]) => isDestinationActive("/dashboard/settings/pricing", href)).map(([, label]) => `${zone.id}:${label}`));
    expect(active).toEqual(["system:Settings"]);
  });
});
