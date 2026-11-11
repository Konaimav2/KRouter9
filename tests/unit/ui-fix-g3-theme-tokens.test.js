// Wave G3 (ui-fix): Tailwind utilities named after tokens that the @theme block
// in src/app/globals.css never declares (and Tailwind's defaults do not know)
// compile to NO CSS — e.g. bg-surface-active, border-border-strong, bg-background,
// text-text-primary. This suite fails on any such utility in src/.
// Scanner: tests/helpers/tailwindTokenScan.mjs; one-off report:
// node tests/scripts/scan-unknown-tailwind-tokens.mjs [--tailwind]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyUtility, loadTheme, repoRoot, scanRepo, scanSource } from "../helpers/tailwindTokenScan.mjs";

const css = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8");
const theme = loadTheme(css);

// Documented exceptions: `file:line token` strings that may stay unknown.
// Each entry MUST carry a comment saying why it is not a defect. Empty today.
const ALLOW = new Set([]);

// ---- contrast helpers (same method as ui-fix-a-tokens.test.js) ---------------
function blockBody(selector) {
  const start = css.indexOf(`${selector} {`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}
const parseVars = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const darkVars = parseVars(blockBody(":root"));
const themes = { dark: darkVars, light: { ...darkVars, ...parseVars(blockBody(":root:not(.dark)")) } };
function resolve(vars, name, depth = 0) {
  const raw = vars[name];
  const ref = raw?.match(/^var\((--[\w-]+)\)$/);
  return ref && depth < 12 ? resolve(vars, ref[1], depth + 1) : raw;
}
function luminance(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(mode, fg, bg) {
  const a = resolve(themes[mode], fg);
  const b = resolve(themes[mode], bg);
  if (!/^#/.test(a || "") || !/^#/.test(b || "")) throw new Error(`${mode}: ${fg}/${bg} unresolved`);
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("G3 scanner self-check", () => {
  it("flags custom names that @theme does not declare", () => {
    for (const u of ["bg-surface-active", "bg-background", "text-text-primary", "bg-bg-subtle/30", "ring-surface-dark", "rounded-pill", "font-ui", "z-modal", "shadow-tray", "from-glacier"]) {
      expect(classifyUtility(u, theme), u).not.toBeNull();
    }
  });

  it("accepts Tailwind defaults, @theme names, keywords and arbitrary values", () => {
    for (const u of ["bg-surface", "bg-surface-2/40", "text-text-muted", "text-sm", "text-center", "border-border", "border-t-2", "border-dashed",
      "ring-2", "ring-offset-2", "ring-primary/50", "bg-black/5", "bg-white/[0.03]", "text-amber-500", "rounded-brand-lg", "rounded-t-lg", "rounded-full",
      "font-mono", "font-semibold", "z-50", "shadow-sm", "shadow-elev", "bg-[var(--color-surface-strong)]", "text-[length:var(--x)]", "bg-(--x)", "divide-y", "outline-none", "from-10%"]) {
      expect(classifyUtility(u, theme), u).toBeNull();
    }
  });

  it("reads className strings, ternaries inside template literals and skips prose and dynamic fragments", () => {
    const src = [
      'const a = <div className="p-2 bg-surface-active">x</div>;',
      "const b = <div className={`p-2 ${on ? \"bg-bg-subtle/30\" : \"\"}`} />;",
      'const c = { strategy: "fill-first", note: "e.g. voyage-3, text-embedding-3-small" };',
      "const d = `bg-${tone}-500 text-sm`;",
      "// border-border-strong in a comment",
    ].join("\n");
    expect(scanSource(src, theme).map((h) => `${h.line} ${h.token}`)).toEqual(["1 bg-surface-active", "2 bg-bg-subtle/30"]);
  });
});

describe("G3: no utility in src/ names an undeclared theme token", () => {
  it("every colour/radius/font/z utility resolves to a Tailwind default or an @theme token", () => {
    const unknown = scanRepo({ theme })
      .map((h) => `${h.file}:${h.line} ${h.token}`)
      .filter((key) => !ALLOW.has(key));
    expect(unknown).toEqual([]);
  });

  it("every allow-list entry is still needed", () => {
    const live = new Set(scanRepo({ theme }).map((h) => `${h.file}:${h.line} ${h.token}`));
    expect([...ALLOW].filter((key) => !live.has(key))).toEqual([]);
  });
});

describe("G3: tokens added to @theme inline map onto defined :root variables", () => {
  const ADDED = ["border-strong", "surface-hover", "danger-wash", "text-disabled"];
  const inline = css.slice(css.indexOf("@theme inline {"), css.indexOf("}", css.indexOf("@theme inline {")));
  for (const name of ADDED) {
    it(`--color-${name} is in @theme inline and defined in both themes`, () => {
      expect(inline).toContain(`--color-${name}:var(--color-${name})`);
      expect(themes.dark[`--color-${name}`]).toBeTruthy();
      expect(themes.light[`--color-${name}`]).toBeTruthy();
    });
  }
});

describe("G3: remapped text keeps >= 4.5:1", () => {
  // text-text-primary -> text-text; placed on surface, surface-2 (former bg-bg-subtle /
  // bg-background / bg-surface-secondary) and bg-alt (former bg-bg-base modal).
  for (const mode of ["dark", "light"]) {
    for (const bg of ["--color-surface", "--color-surface-strong", "--color-surface-raised", "--color-canvas"]) {
      it(`${mode}: --color-text on ${bg}`, () => {
        expect(contrast(mode, "--color-text", bg)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${mode}: --color-text-muted on ${bg}`, () => {
        expect(contrast(mode, "--color-text-muted", bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${mode}: --color-danger on --color-surface (text on danger-wash rows)`, () => {
      expect(contrast(mode, "--color-danger", "--color-surface")).toBeGreaterThanOrEqual(4.5);
    });
  }
});
