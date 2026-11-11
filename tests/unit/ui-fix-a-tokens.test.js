// Wave A (ui-fix plan): tokens and contrast, findings F1, F13, F14.
// F1  code/log surfaces stay dark in BOTH themes, so text on them must use a
//     paired foreground token (--color-code-fg / --color-code-muted), never the
//     theme text color (light text on light theme = carbon-900 on carbon-900, 1:1).
// F13 text-white on bg-primary measures 1.74:1 in dark; use --color-on-primary.
// F14 light --color-text-subtle (carbon-400) measures 2.90:1 on canvas.
// Every ratio below is computed from the real token values in globals.css.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const css = read("src/app/globals.css");

// ---- token resolution -------------------------------------------------------
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
// First `:root {` block = dark/default theme. Light = dark merged with the first
// `:root:not(.dark) {` overrides (that is how the cascade applies them).
const darkVars = parseVars(blockBody(":root"));
const lightVars = { ...darkVars, ...parseVars(blockBody(":root:not(.dark)")) };
const themes = { dark: darkVars, light: lightVars };

function resolve(vars, name, depth = 0) {
  if (depth > 12) throw new Error(`var loop at ${name}`);
  const raw = vars[name];
  if (raw === undefined) return undefined;
  const ref = raw.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(vars, ref[1], depth + 1);
  return raw;
}
function hexToRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(theme, fg, bg) {
  const vars = themes[theme];
  const a = resolve(vars, fg);
  const b = resolve(vars, bg);
  if (!a || !/^#/.test(a)) throw new Error(`${theme}: ${fg} unresolved (${a})`);
  if (!b || !/^#/.test(b)) throw new Error(`${theme}: ${bg} unresolved (${b})`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

// ---- source helpers ---------------------------------------------------------
function stringLiterals(source) {
  return [...source.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)].map((m) => m[2]);
}
const dash = "src/app/(dashboard)/dashboard/";
const CODE_FILES = [
  `${dash}console-log/ConsoleLogClient.js`,
  `${dash}cli-tools/components/SetupWizardCard.js`,
  `${dash}cli-tools/components/KRouter9ToolCard.js`,
  `${dash}token-saver/TokenSaverClient.js`,
  `${dash}pxpipe/PxpipeClient.js`,
  "src/app/docs/page.js",
];
const F13_FILES = [
  `${dash}endpoint/components/ManageKeyModal.js`,
  `${dash}cli-tools/components/CoworkToolCard.js`,
  "src/shared/components/PricingModal.js",
  "src/shared/components/ModelSelectModal.js",
  "src/shared/components/McpMarketplaceModal.js",
  "src/shared/components/UsageStats.js",
  "src/shared/components/NineRemotePromoModal.js",
];

describe("F1: code surfaces carry a paired foreground token", () => {
  for (const theme of ["light", "dark"]) {
    it(`${theme}: code-fg on code-bg >= 7:1`, () => {
      expect(contrast(theme, "--color-code-fg", "--color-code-bg")).toBeGreaterThanOrEqual(7);
    });
    it(`${theme}: code-muted on code-bg >= 4.5:1`, () => {
      expect(contrast(theme, "--color-code-muted", "--color-code-bg")).toBeGreaterThanOrEqual(4.5);
    });
    it(`${theme}: log level tokens on code-bg >= 4.5:1`, () => {
      for (const t of ["danger", "warning", "info"]) {
        expect(contrast(theme, `--color-code-${t}`, "--color-code-bg"), t).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it("exposes code-fg and code-muted in @theme inline", () => {
    const theme = css.slice(css.indexOf("@theme inline {"));
    expect(theme.slice(0, theme.indexOf("}"))).toMatch(/--color-code-fg:var\(--color-code-fg\)/);
    expect(theme.slice(0, theme.indexOf("}"))).toMatch(/--color-code-muted:var\(--color-code-muted\)/);
  });

  it("every code-bg class string also sets code-fg and never theme text colors", () => {
    const offenders = [];
    for (const file of CODE_FILES) {
      for (const s of stringLiterals(read(file))) {
        if (!s.includes("--color-code-bg")) continue;
        if (!s.includes("--color-code-fg") || /--color-text\)|text-text-(muted|primary|secondary)/.test(s)) {
          offenders.push(`${file}: ${s.slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no raw carbon palette text inside docs code examples", () => {
    expect(read("src/app/docs/page.js")).not.toMatch(/text-\[var\(--p-carbon-/);
  });

  it("console-log level styles use code-surface tokens", () => {
    const src = read(`${dash}console-log/ConsoleLogClient.js`);
    const levels = src.slice(src.indexOf("const LEVEL_STYLES"), src.indexOf("};", src.indexOf("const LEVEL_STYLES")));
    expect(levels).not.toMatch(/text-(danger|warning|info|text-secondary|text-muted)"/);
    expect(levels).toMatch(/--color-code-danger/);
  });

  // console-log keeps --color-rail-muted on its time/source columns (pinned by
  // console-log-u3c.test.js); guard that it stays legible on the dark code surface.
  for (const theme of ["light", "dark"]) {
    it(`${theme}: rail-muted on code-bg >= 4.5:1 (console-log time/source columns)`, () => {
      expect(contrast(theme, "--color-rail-muted", "--color-code-bg")).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("markdown code rules in globals.css set code-fg", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*background:\s*var\(--color-code-bg\)[^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, sel, body] of rules) expect(body, sel.trim()).toMatch(/(^|[;\s])color:\s*var\(--color-code-fg\)/);
  });

  it("scrollable <pre> code blocks are keyboard-focusable and named", () => {
    const offenders = [];
    for (const file of CODE_FILES) {
      for (const [tag] of read(file).matchAll(/<pre\b[\s\S]*?>/g)) {
        if (!/overflow-(x-)?auto/.test(tag)) continue;
        if (!/tabIndex=\{0\}/.test(tag) || !/aria-label=/.test(tag)) offenders.push(`${file}: ${tag.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("F13: text on primary uses --color-on-primary", () => {
  for (const theme of ["light", "dark"]) {
    it(`${theme}: on-primary on primary >= 4.5:1`, () => {
      expect(contrast(theme, "--color-on-primary", "--color-primary")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme, "--color-on-primary", "--color-primary-hover")).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("no class string pairs bg-primary with text-white in A-owned files", () => {
    const offenders = [];
    for (const file of F13_FILES) {
      for (const s of stringLiterals(read(file))) {
        if (/\bbg-primary\b|bg-\[var\(--color-primary\)\]/.test(s) && /\btext-white\b/.test(s)) {
          offenders.push(`${file}: ${s.slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("Avatar fallback initials on bg-primary use on-primary, not inherited text-white", () => {
    const src = read("src/shared/components/Avatar.js");
    expect(src).toMatch(/return "bg-primary text-\[var\(--color-on-primary\)\]"/);
    expect(src).not.toMatch(/"rounded-full flex items-center justify-center font-semibold text-white"/);
  });
});

describe("F14: subtle text reaches 4.5:1", () => {
  for (const theme of ["light", "dark"]) {
    for (const bg of ["--color-canvas", "--color-surface", "--color-surface-raised"]) {
      it(`${theme}: text-subtle on ${bg} >= 4.5:1`, () => {
        expect(contrast(theme, "--color-text-subtle", bg)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${theme}: text-muted on ${bg} >= 4.5:1`, () => {
        expect(contrast(theme, "--color-text-muted", bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
