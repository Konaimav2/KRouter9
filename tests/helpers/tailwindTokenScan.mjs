// Wave G3 (ui-fix): unknown Tailwind token scanner.
//
// Tailwind v4 silently emits NO CSS for a utility whose value is a name that is
// neither a Tailwind default nor declared in an `@theme` block (e.g.
// `bg-surface-active`, `border-border-strong` before G3). This helper finds
// every such utility in className strings under src/ and reports file:line.
//
// Known names = Tailwind's own default theme (node_modules/tailwindcss/theme.css)
// + every `@theme` / `@theme inline` declaration in src/app/globals.css
// + the per-utility keywords below + plain class selectors that globals.css
//   defines itself (e.g. `.bg-vibrancy`).
// Arbitrary values (`bg-[var(--x)]`, `bg-(--x)`) are always accepted: they emit
// CSS regardless of the theme. Dynamic fragments (`bg-${tone}-500`) are skipped.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// ---- theme names --------------------------------------------------------------
function themeBlocks(css) {
  const out = [];
  for (const m of css.matchAll(/@theme(?:\s+[a-z\s]+)?\s*\{/g)) {
    const open = m.index + m[0].length;
    out.push(css.slice(open, css.indexOf("}", open)));
  }
  return out;
}

function namespaceNames(vars, ns) {
  const names = new Set();
  for (const v of vars) {
    if (!v.startsWith(`--${ns}-`)) continue;
    const name = v.slice(ns.length + 3);
    if (name.includes("--")) continue; // e.g. --text-xs--line-height
    names.add(name);
  }
  return names;
}

function defaultThemeCss() {
  const require = createRequire(join(repoRoot, "package.json"));
  const pkgDir = join(require.resolve("tailwindcss/package.json"), "..");
  return readFileSync(join(pkgDir, "theme.css"), "utf8");
}

export function loadTheme(globalsCss = readFileSync(join(repoRoot, "src/app/globals.css"), "utf8")) {
  const declared = (css) => [...css.matchAll(/(--[A-Za-z0-9_.-]+)\s*:/g)].map((m) => m[1]);
  const defaults = themeBlocks(defaultThemeCss()).flatMap(declared);
  const custom = themeBlocks(globalsCss).flatMap(declared);
  const all = [...defaults, ...custom];
  const pick = (ns) => namespaceNames(all, ns);
  const definedClasses = new Set(
    [...globalsCss.replace(/\{[^{}]*\}/g, "{}").matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]),
  );
  return {
    colors: new Set([...pick("color"), "inherit", "current", "transparent"]),
    customColors: namespaceNames(custom, "color"),
    radius: pick("radius"),
    font: pick("font"),
    fontWeight: pick("font-weight"),
    text: pick("text"),
    textShadow: pick("text-shadow"),
    shadow: pick("shadow"),
    definedClasses,
  };
}

// ---- per-utility keyword values ------------------------------------------------
const NUM = /^\d+(\.\d+)?$/;
const PCT = /^\d+(\.\d+)?%$/;
const POS = ["top", "bottom", "center", "left", "right", "left-top", "left-bottom", "right-top", "right-bottom", "top-left", "top-right", "bottom-left", "bottom-right"];
const LINE_STYLES = ["solid", "dashed", "dotted", "double", "hidden", "none"];
const DIRS = ["t", "r", "b", "l", "tr", "tl", "br", "bl", "x", "y", "s", "e"];
const KEYWORDS = {
  bg: new Set([
    "none", "fixed", "local", "scroll", "auto", "cover", "contain", "repeat", "no-repeat", "repeat-x", "repeat-y",
    "repeat-round", "repeat-space", "radial", "conic", ...POS,
    ...["border", "padding", "content", "text"].flatMap((v) => [`clip-${v}`, `origin-${v}`]),
    ...["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light",
      "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"].map((v) => `blend-${v}`),
    ...DIRS.flatMap((d) => [`linear-to-${d}`, `gradient-to-${d}`]),
  ]),
  text: new Set(["left", "center", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"]),
  border: new Set([...LINE_STYLES, "collapse", "separate"]),
  ring: new Set(["inset"]),
  fill: new Set(["none"]),
  stroke: new Set(["none"]),
  divide: new Set(["x", "y", "x-reverse", "y-reverse", ...LINE_STYLES]),
  outline: new Set([...LINE_STYLES]),
  shadow: new Set(["none"]),
  accent: new Set(["auto"]),
  caret: new Set([]),
  decoration: new Set(["solid", "double", "dotted", "dashed", "wavy", "auto", "from-font", "clone", "slice"]),
  placeholder: new Set([]),
  from: new Set([]),
  via: new Set([]),
  to: new Set([]),
};
const FONT_KEYWORDS = new Set(["stretch-normal", "stretch-ultra-condensed", "stretch-extra-condensed", "stretch-condensed",
  "stretch-semi-condensed", "stretch-semi-expanded", "stretch-expanded", "stretch-extra-expanded", "stretch-ultra-expanded"]);

const COLOR_PREFIXES = Object.keys(KEYWORDS);
const PREFIX_RE = new RegExp(`^(${[...COLOR_PREFIXES, "rounded", "font", "z"].join("|")})-(.+)$`);

const isArbitrary = (value) => /[[(]/.test(value);
const stripModifier = (value) => value.replace(/\/(\d+(\.\d+)?|\[[^\]]*\]|\([^)]*\))$/, "");

// Split `md:hover:!bg-x/50` into variants and the utility (bracket-aware).
function splitVariants(token) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[" || ch === "(") depth += 1;
    if (ch === "]" || ch === ")") depth -= 1;
    if (ch === ":" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

// Returns null when the utility is fine, or a short reason when it emits no CSS.
export function classifyUtility(utility, theme) {
  let u = utility.replace(/^!|!$/g, "").replace(/^-/, "");
  const m = u.match(PREFIX_RE);
  if (!m) return null;
  const [, prefix] = m;
  let value = m[2];
  if (isArbitrary(value)) return null;
  const known = (v) => theme.colors.has(stripModifier(v));

  switch (prefix) {
    case "z":
      return value === "auto" || NUM.test(value) ? null : "z-index: not a number";
    case "rounded": {
      const side = value.match(/^(t|r|b|l|s|e|ss|se|es|ee|tl|tr|br|bl)(?:-(.+))?$/);
      if (side) { if (!side[2]) return null; value = side[2]; }
      return value === "none" || value === "full" || theme.radius.has(value) ? null : "radius";
    }
    case "font":
      return theme.font.has(value) || theme.fontWeight.has(value) || FONT_KEYWORDS.has(value) || NUM.test(value) ? null : "font";
    case "text": {
      if (value.startsWith("shadow")) {
        const v = value.slice("shadow".length).replace(/^-/, "");
        return !v || v === "none" || theme.textShadow.has(stripModifier(v)) || known(v) ? null : "text-shadow";
      }
      return KEYWORDS.text.has(value) || theme.text.has(stripModifier(value)) || known(value) ? null : "colour/size";
    }
    case "border": {
      const side = value.match(/^(x|y|t|r|b|l|s|e|bs|be)(?:-(.+))?$/);
      if (side) { if (!side[2]) return null; value = side[2]; }
      if (value.startsWith("spacing")) return null;
      return NUM.test(value) || KEYWORDS.border.has(value) || known(value) ? null : "colour";
    }
    case "ring": {
      if (value.startsWith("offset-")) {
        const v = value.slice(7);
        return NUM.test(v) || isArbitrary(v) || known(v) ? null : "colour";
      }
      return NUM.test(value) || KEYWORDS.ring.has(value) || known(value) ? null : "colour";
    }
    case "divide":
    case "outline": {
      if (prefix === "divide") value = value.replace(/^[xy]-(?=\d)/, "");
      if (prefix === "outline" && value.startsWith("offset-")) return null;
      return NUM.test(value) || KEYWORDS[prefix].has(value) || known(value) ? null : "colour";
    }
    case "shadow":
      return KEYWORDS.shadow.has(value) || theme.shadow.has(stripModifier(value)) || known(value) ? null : "shadow";
    case "from":
    case "via":
    case "to":
      return PCT.test(value) || known(value) ? null : "colour";
    case "stroke":
    case "decoration":
      return NUM.test(value) || KEYWORDS[prefix].has(value) || known(value) ? null : "colour";
    default:
      return KEYWORDS[prefix].has(value) || known(value) ? null : "colour";
  }
}

// ---- source extraction ---------------------------------------------------------
// String literals with offsets. "..." / '...' never span lines (a lone apostrophe
// in JSX text is treated as plain text). Template literals keep their static text
// with every ${...} replaced by \u0000, and their expressions are lexed too.
export function stringLiterals(src, base = 0, out = []) {
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") { const nl = src.indexOf("\n", i); i = nl < 0 ? src.length : nl; continue; }
    if (ch === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); i = end < 0 ? src.length : end + 2; continue; }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      if (src[j] === ch) { out.push({ text: src.slice(i + 1, j), offset: base + i + 1 }); i = j + 1; } else i += 1;
      continue;
    }
    if (ch === "`") {
      let j = i + 1;
      let text = "";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") { text += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") {
          let depth = 1;
          let k = j + 2;
          while (k < src.length && depth) {
            const c = src[k];
            if (c === "{") depth += 1;
            else if (c === "}") depth -= 1;
            else if (c === "`" || c === '"' || c === "'") {
              // skip nested string so its braces do not count
              const q = c;
              k += 1;
              while (k < src.length && src[k] !== q) k += src[k] === "\\" ? 2 : 1;
            }
            k += 1;
          }
          stringLiterals(src.slice(j + 2, k - 1), base + j + 2, out);
          text += "\u0000";
          j = k;
          continue;
        }
        text += src[j];
        j += 1;
      }
      out.push({ text, offset: base + i + 1 });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

const CLASSY_TOKEN = /^[!-]?[a-z0-9@[*&]/;
function isClassToken(tok) {
  if (!CLASSY_TOKEN.test(tok)) return false;
  // commas / semicolons only inside arbitrary brackets
  const outside = tok.replace(/\[[^\]]*\]|\([^)]*\)/g, "");
  return !/[,;"'<>{}=]/.test(outside) && !/[A-Z]/.test(outside);
}

const CLASS_CONTEXT = /className|class=|\b(cn|clsx|cx|twMerge|classNames)\(/;

// Every unknown utility in one source file: [{ line, token, reason }].
export function scanSource(src, theme) {
  const lineStarts = [0];
  for (let i = 0; i < src.length; i += 1) if (src[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  const lines = src.split("\n");
  const found = [];
  for (const lit of stringLiterals(src)) {
    const tokens = lit.text.split(/\s+/).filter(Boolean);
    if (!tokens.length || !tokens.every((t) => t.includes("\u0000") || isClassToken(t))) continue;
    const line = lineOf(lit.offset);
    // A lone word ("fill-first") is only a class when its line is a class context.
    const staticTokens = tokens.filter((t) => !t.includes("\u0000"));
    if (staticTokens.length < 2 && !CLASS_CONTEXT.test(lines[line - 1] || "")) continue;
    let offset = 0;
    for (const tok of lit.text.split(/(\s+)/)) {
      if (tok && !/^\s+$/.test(tok) && !tok.includes("\u0000")) {
        const utility = splitVariants(tok).pop();
        if (!theme.definedClasses.has(utility)) {
          const reason = classifyUtility(utility, theme);
          if (reason) found.push({ line: lineOf(lit.offset + offset), token: tok, reason });
        }
      }
      offset += tok.length;
    }
  }
  return found;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?jsx?|tsx?)$/.test(name)) out.push(full);
  }
  return out;
}

// [{ file, line, token, reason }] for every unknown utility under src/.
export function scanRepo({ root = repoRoot, theme = loadTheme() } = {}) {
  const results = [];
  for (const file of walk(join(root, "src")).sort()) {
    for (const hit of scanSource(readFileSync(file, "utf8"), theme)) {
      results.push({ file: relative(root, file), ...hit });
    }
  }
  return results;
}
