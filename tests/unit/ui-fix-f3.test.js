// Wave F3 (ui-fix QA re-walk r2, leftovers from F2's "not fixed" list).
//  T1  every interactive control (button, a, Link, select, input, textarea,
//      summary) whose className carries a sub-44px size class (h-5..h-10,
//      min-h-5..min-h-10, size-5..size-10, p-0.5, p-1, p-1.5) also carries a
//      44px target: min-h-11/h-11/size-11 (plus a 44px width when it has no
//      text), or the `hit-target` utility, which grows the hit area to 44x44
//      through a ::after box without enlarging the visual.
//  T2  inline clear buttons are named (aria-label) and use a 44px hit area.
//  T3  the cline/roo "01" step label meets 4.5:1 in both themes.
//  T4  src/app/not-found.js exists, uses theme tokens (>=4.5:1 both themes),
//      has an h1 and a 44px link back to /dashboard.
//  T5  regression scans: no bg-sidebar paired with text-text-*, no 20128
//      literal in client code.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync, traverse } from "@babel/core";
import presetReact from "next/dist/compiled/babel/preset-react";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url);
const SRC = new URL("../../src/", import.meta.url);
const SRC_DIR = fileURLToPath(SRC);
const read = (file) => readFileSync(new URL(file, SRC), "utf8");
const css = readFileSync(new URL("src/app/globals.css", ROOT), "utf8");

// ---- token resolution (same method as ui-fix-a-tokens / f2) -------------------
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
function rgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function lum([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}
// fg at `alpha` composited over bg
const mix = (fg, bg, alpha) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
const tok = (theme, name) => {
  const v = resolve(themes[theme], name);
  if (!(v || "").startsWith("#")) throw new Error(`${theme}: ${name}=${v} unresolved`);
  return rgb(v);
};

// ---- source walking -----------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}
const ALL_SRC = walk(SRC_DIR).map((full) => relative(SRC_DIR, full).split("\\").join("/"));
// src/app/api/** is backend; ClaudeToolCard.js is owned by a parallel wave.
const UI_SRC = ALL_SRC.filter((f) => !f.startsWith("app/api/") && !f.endsWith("ClaudeToolCard.js"));

const INTERACTIVE = new Set(["button", "a", "Link", "select", "input", "textarea", "summary"]);
const SMALL = /(?:^|[\s"'`:])(?:h-(?:[5-9]|10)|min-h-(?:[5-9]|10)|size-(?:[5-9]|10)|p-0\.5|p-1(?:\.5)?)(?=[\s"'`]|$)/;
const TALL44 = /(?:^|[\s"'`])(?:min-h-11|h-11|size-11|min-h-12|h-12|size-12)(?=[\s"'`]|$)/;
const WIDE44 = /(?:^|[\s"'`])(?:min-w-11|w-11|size-11|min-w-12|w-12|size-12|w-full)(?=[\s"'`]|$)/;
const HIT = /(?:^|[\s"'`])hit-target(?=[\s"'`]|$)/;

function hasText(children) {
  return children.some((c) => {
    if (c.type === "JSXText") return c.value.trim().length > 0;
    if (c.type === "JSXExpressionContainer") return c.expression.type !== "JSXEmptyExpression" && c.expression.type !== "JSXElement";
    if (c.type === "JSXElement") return hasText(c.children);
    if (c.type === "JSXFragment") return hasText(c.children);
    return false;
  });
}
const nameOf = (n) => (n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? `${n.object.name}.${n.property.name}` : "");

function interactiveElements(file) {
  const source = read(file);
  if (!/<(button|a|Link|select|input|textarea|summary)\b/.test(source)) return [];
  let ast;
  try {
    ast = parseSync(source, { filename: file, presets: [[presetReact, { runtime: "classic" }]], babelrc: false, configFile: false });
  } catch { return []; }
  const out = [];
  traverse(ast, {
    JSXElement(path) {
      const open = path.node.openingElement;
      const tag = nameOf(open.name);
      if (!INTERACTIVE.has(tag)) return;
      const attrs = {};
      for (const a of open.attributes) if (a.type === "JSXAttribute") attrs[a.name.name] = a.value ? source.slice(a.value.start, a.value.end) : "true";
      if (tag === "input" && /checkbox|radio|hidden|range|file/.test(attrs.type || "")) return;
      if (tag === "input" && /sr-only|hidden/.test(attrs.className || "")) return;
      out.push({ file, tag, line: open.loc.start.line, attrs, className: attrs.className || "", text: hasText(path.node.children), src: source.slice(path.node.start, path.node.end) });
    },
  });
  return out;
}
const ELEMENTS = UI_SRC.flatMap(interactiveElements);
const meets44 = (el) => HIT.test(el.className) || (TALL44.test(el.className) && (el.text || ["select", "input", "textarea"].includes(el.tag) || WIDE44.test(el.className)));

describe("F3 T1: no interactive control below 44px in src/", () => {
  it("the scan sees the dashboard's controls (sanity)", () => {
    expect(ELEMENTS.length).toBeGreaterThan(300);
  });
  it("every sub-44 sized button/a/Link/select/input/textarea/summary has a 44px target", () => {
    const offenders = ELEMENTS.filter((el) => SMALL.test(el.className) && !meets44(el)).map((el) => `${el.file}:${el.line} <${el.tag}> ${el.className.slice(0, 120)}`);
    expect(offenders).toEqual([]);
  });
  it("hit-target utility grows the hit area to 44x44 via ::after without changing the visual", () => {
    const body = css.match(/\.hit-target(?::where\([^{]*\))?\s*\{([^}]*)\}/)?.[1] || "";
    const after = css.match(/\.hit-target::after\s*\{([^}]*)\}/)?.[1] || "";
    expect(body).toMatch(/position:\s*relative/);
    expect(after).toMatch(/content:\s*""/);
    expect(after).toMatch(/position:\s*absolute/);
    expect(after).toMatch(/min-width:\s*var\(--touch-min\)|width:\s*max\(100%,\s*var\(--touch-min\)\)/);
    expect(after).toMatch(/min-height:\s*var\(--touch-min\)|height:\s*max\(100%,\s*var\(--touch-min\)\)/);
  });
});

describe("F3 T1 named areas from F2's not-fixed list", () => {
  const fileHas = (file, re) => expect(read(file)).toMatch(re);
  it("quota filters are 44px (no h-8 control left)", () => {
    const quota = UI_SRC.filter((f) => f.includes("dashboard/quota") || f.includes("usage/components/ProviderLimits"));
    expect(quota.length).toBeGreaterThan(0);
    const small = ELEMENTS.filter((el) => quota.includes(el.file) && /(?:^|\s|")h-8(?=\s|")/.test(el.className) && !meets44(el));
    expect(small).toEqual([]);
  });
  it("console-log toolbar controls are 44px", () => {
    const els = ELEMENTS.filter((el) => el.file.includes("console-log/"));
    expect(els.length).toBeGreaterThan(0);
    expect(els.filter((el) => /min-h-9/.test(el.className) && !meets44(el))).toEqual([]);
  });
  it("mitm Reveal control is 44px", () => {
    fileHas("app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js", /Reveal/);
    const els = ELEMENTS.filter((el) => el.file.endsWith("MitmServerCard.js") && /min-h-8/.test(el.className) && !meets44(el));
    expect(els).toEqual([]);
  });
});

describe("F3 T2: inline clear buttons are named and 44px", () => {
  const isClear = (el) => el.tag === "button" && (/title="Clear"/.test(el.src.slice(0, 400)) || (/\babsolute\b/.test(el.className) && /<Icon\s+name="close"/.test(el.src)));
  it("the scan finds the inline clear buttons (sanity)", () => {
    expect(ELEMENTS.filter(isClear).length).toBeGreaterThan(8);
  });
  it("every inline clear button has an aria-label and a 44px hit area", () => {
    const bad = ELEMENTS.filter(isClear).filter((el) => !(el.attrs["aria-label"] && (HIT.test(el.className) || (TALL44.test(el.className) && WIDE44.test(el.className))))).map((el) => `${el.file}:${el.line}`);
    expect(bad).toEqual([]);
  });
  it("hit-target never forces position:relative onto an absolutely positioned button", () => {
    const rule = css.match(/\.hit-target(?::where\([^{]*\))?\s*\{[^}]*position:\s*relative/)?.[0] || "";
    expect(rule).toMatch(/:where\(:not\(\.absolute/);
  });
});

describe("F3 T1b: controls with no size class that F2 left small", () => {
  it("back links (arrow_back / 'Back to') are 44px tall", () => {
    const back = ELEMENTS.filter((el) => ["a", "Link", "button"].includes(el.tag) && (/name="arrow_back"/.test(el.src) || /aria-label=\{?[`"]Back to/.test(el.src.slice(0, 300))));
    expect(back.length).toBeGreaterThan(4);
    expect(back.filter((el) => !meets44(el)).map((el) => `${el.file}:${el.line}`)).toEqual([]);
  });
  it("skills page uses only defined tokens and 44px controls", () => {
    const file = "app/(dashboard)/dashboard/skills/page.js";
    const s = read(file);
    const used = [...new Set([...s.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]))];
    const undefinedTokens = used.filter((v) => !new RegExp(`${v}\\s*:`).test(css));
    expect(undefinedTokens).toEqual([]);
    const els = ELEMENTS.filter((el) => el.file === file && ["button", "a", "input"].includes(el.tag) && !/role="menuitem"/.test(el.src.slice(0, 120)));
    expect(els.length).toBeGreaterThan(4);
    const sized = (el) => meets44(el) || /className=\{secondary\}/.test(el.src.slice(0, 200));
    expect(els.filter((el) => !sized(el)).map((el) => `${file}:${el.line} ${el.className.slice(0, 60)}`)).toEqual([]);
    expect(s).toMatch(/const secondary = "[^"]*\bmin-h-11\b/);
  });
  it("basic-chat attach and remove-attachment buttons are 44x44", () => {
    const file = "app/(dashboard)/dashboard/basic-chat/BasicChatPageClient.js";
    const els = ELEMENTS.filter((el) => el.file === file && /aria-label="(Attach|Remove attachment)"/.test(el.src.slice(0, 400)));
    expect(els.length).toBe(2);
    expect(els.filter((el) => !(HIT.test(el.className) || (TALL44.test(el.className) && WIDE44.test(el.className))))).toEqual([]);
  });
  it("pagination prev/next icon buttons are 44px wide", () => {
    expect(read("shared/components/Pagination.js")).not.toMatch(/"w-9 px-0"/);
  });
});

describe("F3 T3: cline/roo '01' step label contrast", () => {
  // The cli-cline / cli-roo detail pages show their loading ledger while the
  // status request is in flight. The "01" label sat inside an animate-pulse row,
  // so axe sampled it mid-fade (Tailwind pulse dips to opacity .5): primary on
  // surface at alpha .5 is below 4.5:1 in dark. The fade belongs on the
  // placeholder bars only; the label stays at full opacity.
  it("primary at the pulse trough is below AA (documents the defect)", () => {
    const bg = tok("dark", "--color-surface");
    expect(ratio(mix(tok("dark", "--color-primary"), bg, 0.5), bg)).toBeLessThan(4.5);
  });
  it("primary at full opacity meets 4.5:1 on every ledger surface in both themes", () => {
    for (const theme of ["dark", "light"]) for (const bg of ["--color-surface", "--color-surface-raised", "--color-surface-hover"]) {
      expect(ratio(tok(theme, "--color-primary"), tok(theme, bg)), `${theme} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  for (const file of ["app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js", "app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js"]) {
    it(`${file.split("/").pop()} keeps row-number labels out of animate-pulse containers`, () => {
      const source = read(file);
      const ast = parseSync(source, { filename: file, presets: [[presetReact, { runtime: "classic" }]], babelrc: false, configFile: false });
      const bad = [];
      traverse(ast, {
        JSXElement(path) {
          const c = path.node.openingElement.attributes.find((x) => x.name?.name === "className");
          if (!c || !/animate-pulse/.test(source.slice(c.value.start, c.value.end))) return;
          const inner = source.slice(path.node.start, path.node.end);
          if (/padStart\(2|>\s*0\d\s*</.test(inner)) bad.push(path.node.loc.start.line);
        },
      });
      expect(bad).toEqual([]);
    });
  }
});

describe("F3 T4: themed not-found page", () => {
  const file = "app/not-found.js";
  it("exists with an h1 and a 44px link back to /dashboard", () => {
    expect(existsSync(new URL(file, SRC))).toBe(true);
    const s = read(file);
    expect(s).toMatch(/<h1\b/);
    expect(s).toMatch(/href="\/dashboard"/);
    const link = s.match(/<(?:Link|a)\b[^>]*href="\/dashboard"[^>]*>/)?.[0] || "";
    expect(link).toMatch(/min-h-11|h-11/);
  });
  it("uses theme tokens for its surfaces and text at >=4.5:1 in both themes", () => {
    const s = read(file);
    const vars = [...s.matchAll(/(?:bg|text)-\[var\((--[\w-]+)\)\]/g)].map((m) => m[1]);
    const bg = s.match(/bg-\[var\((--color-[\w-]+)\)\]/)?.[1];
    const fgs = [...s.matchAll(/text-\[var\((--color-[\w-]+)\)\]/g)].map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(1);
    expect(bg).toBeTruthy();
    expect(fgs.length).toBeGreaterThan(0);
    for (const theme of ["dark", "light"]) {
      for (const fg of fgs) {
        // link text sits on the primary button surface, not the page
        const surface = fg === "--color-on-primary" ? "--color-primary" : bg;
        expect(ratio(tok(theme, fg), tok(theme, surface)), `${theme} ${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(s).not.toMatch(/\b(?:bg-black|text-black|bg-white|text-white)\b/);
  });
});

describe("F3 T5: regression scans", () => {
  it("no bg-sidebar paired with text-text-* on one element", () => {
    const hits = UI_SRC.flatMap((f) => read(f).split("\n").map((l, i) => [l, i + 1]).filter(([l]) => /\bbg-sidebar\b/.test(l) && /\btext-text-/.test(l)).map(([, n]) => `${f}:${n}`));
    expect(hits).toEqual([]);
  });
  it("no 20128 literal in client code", () => {
    const hits = UI_SRC.filter((f) => /^\s*["']use client["']/m.test(read(f)) && /\b20128\b/.test(read(f)));
    expect(hits).toEqual([]);
  });
});

