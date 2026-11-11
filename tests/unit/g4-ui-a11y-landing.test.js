// Wave G4 (ui-fix QA round 4, shard A + shard C RESULTS.md).
//  S1  aria-prohibited-attr: no generic element (div/span/p/...) carries
//      aria-label / aria-labelledby without a role, anywhere in src/.
//  S2  every loading skeleton is a status region: role="status" +
//      aria-busy="true" on the wrapper, a visually hidden text node naming what
//      loads, and decorative bars aria-hidden.
//  M1  pages under (dashboard) never render their own <main>; DashboardLayout's
//      #dashboard-main is the only main landmark.
//  L1  landing hero provider pills: white text >= 4.5:1 on the pill.
//  L2  landing paints its own dark surface on the content wrapper (not only in a
//      fixed pointer-events-none layer that axe and unrastered tiles skip).
//  L3  worst-case composite of every translucent decorative layer stays under
//      the text colours of the transparent sections (hero, features, CTA) at
//      >= 4.5:1.
//  L4  nothing on the landing depends on scroll-triggered JS to become visible.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");
const DASH = "app/(dashboard)/dashboard/";

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => p.slice(SRC.length + 1);

// Opening JSX tags, tolerant of quoted strings and (two-level) {expressions}.
const TAG = /<(div|span|p|i|b|em|strong|small)\b((?:[^>"'{]|"[^"]*"|'[^']*'|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*)>/g;

describe("G4 S1: no aria-label on a role-less generic element", () => {
  it("src/ has no div/span/p/... with aria-label(ledby) and no role", () => {
    const offenders = [];
    for (const f of walk(SRC)) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(TAG)) {
        if (/\baria-label(ledby)?=/.test(m[2]) && !/\brole=/.test(m[2])) {
          offenders.push(`${rel(f)}:${s.slice(0, m.index).split("\n").length} <${m[1]}> ${(m[2].match(/aria-label(?:ledby)?=("[^"]*"|\{[^}]*\})/) || [])[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("G4 S2: loading skeletons are status regions", () => {
  const SITES = [
    [`${DASH}providers/page.js`, "Loading providers"],
    [`${DASH}endpoint/EndpointPageClient.js`, "Loading endpoint configuration"],
    [`${DASH}combos/page.js`, "Loading routing configuration"],
    [`${DASH}usage/page.js`, "Loading usage"],
    [`${DASH}usage/components/UsageDashboard.js`, "Loading usage"],
    [`${DASH}usage/components/UsageChart.js`, "Loading usage trend"],
    [`${DASH}usage/components/PerKeyUsageSection.js`, "Loading API-key usage"],
    [`${DASH}basic-chat/BasicChatPageClient.js`, "Loading models"],
  ];
  for (const [file, label] of SITES) {
    it(`${file}: "${label}" is sr-only text inside role=status aria-busy=true`, () => {
      const s = read(file);
      const at = s.indexOf(`<span className="sr-only">${label}</span>`);
      expect(at, "sr-only loading text").toBeGreaterThan(-1);
      const open = s.lastIndexOf("<div", at);
      const tag = s.slice(open, s.indexOf(">", open) + 1);
      expect(tag).toMatch(/role="status"/);
      expect(tag).toMatch(/aria-busy="true"/);
      expect(tag).not.toMatch(/aria-label=/);
    });
  }
  it("decorative skeleton bars with animate-pulse are aria-hidden", () => {
    for (const f of [`${DASH}usage/components/UsageDashboard.js`, `${DASH}usage/components/UsageChart.js`, `${DASH}usage/components/PerKeyUsageSection.js`]) {
      for (const m of read(f).matchAll(TAG)) {
        if (/animate-pulse/.test(m[2])) expect(m[2], f).toMatch(/aria-hidden="true"/);
      }
    }
  });
});

describe("G4 M1: one main landmark in the dashboard", () => {
  it("no page or component under (dashboard) renders <main>", () => {
    const offenders = walk(join(SRC, "app/(dashboard)")).filter((f) => /<main[\s>]/.test(readFileSync(f, "utf8"))).map(rel);
    expect(offenders).toEqual([]);
  });
  it("DashboardLayout owns exactly one <main id=dashboard-main>", () => {
    const s = read("shared/components/layouts/DashboardLayout.js");
    expect(s.match(/<main[\s>]/g)).toHaveLength(1);
    expect(s).toMatch(/<main id="dashboard-main"/);
  });
});

// ---- colour helpers ------------------------------------------------------------
const theme = readFileSync(join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8");
function oklchToRgb(L, C, H) {
  L /= 100; const h = (H * Math.PI) / 180; const a = C * Math.cos(h); const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return lin.map((x) => { x = Math.min(1, Math.max(0, x)); return Math.round((x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255); });
}
const hexRgb = (h) => { const v = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
function colour(token) {
  if (token === "white") return [255, 255, 255];
  if (token.startsWith("#")) return hexRgb(token);
  if (token.startsWith("[#")) return hexRgb(token.slice(1, -1));
  const m = theme.match(new RegExp(`--color-${token}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
  if (!m) throw new Error(`unknown colour ${token}`);
  return oklchToRgb(+m[1], +m[2], +m[3]);
}
const lum = (rgb) => { const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (fg, alpha, bg) => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
const textColours = (src) => [...new Set([...src.matchAll(/(?<![\w:-])text-(white|gray-\d00|\[#[0-9a-fA-F]{6}\])(?![\w/-])/g)].map((m) => m[1]))];

describe("G4 L1: hero provider pills", () => {
  const src = read("app/landing/components/FlowAnimation.js");
  const pills = [...src.matchAll(/name: "([^"]+)",\s*color: "bg-([\w-]+|\[#[0-9a-fA-F]{6}\])",\s*textColor: "text-([\w-]+|\[#[0-9a-fA-F]{6}\])"/g)];
  it("parses all four provider pills", () => expect(pills).toHaveLength(4));
  for (const [, name, bg, fg] of pills) {
    it(`${name}: text >= 4.5:1 on its pill`, () => {
      expect(ratio(colour(fg), colour(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe("G4 L2: landing owns its dark surface", () => {
  const page = read("app/landing/page.js");
  const rootCls = page.match(/return \(\s*<div\b[^>]*className="([^"]*)"/)[1];
  it("the content wrapper paints an opaque dark background and fills the viewport", () => {
    const bg = rootCls.match(/(?<![\w:-])bg-\[(#[0-9a-fA-F]{6})\](?!\/)/)?.[1];
    expect(bg, rootCls).toBeTruthy();
    expect(ratio([255, 255, 255], hexRgb(bg))).toBeGreaterThanOrEqual(7);
    expect(rootCls).toMatch(/(?<![\w:-])(min-h-screen|min-h-\[100dvh\]|min-h-dvh)(?![\w-])/);
  });
  it("the wrapper is marked as the landing root and html/body adopt its dark canvas", () => {
    expect(page).toMatch(/data-landing-root/);
    expect(page).toMatch(/html:has\(\[data-landing-root\]\)[^{]*\{[^}]*background(-color)?:\s*#181411/);
    expect(page).toMatch(/html:has\(\[data-landing-root\]\)[^{]*\{[^}]*color-scheme:\s*dark/);
  });
  it("the fixed decorative layer is aria-hidden", () => {
    expect(page).toMatch(/<div aria-hidden="true" className="fixed inset-0/);
  });
});

describe("G4 L3: translucent decoration never drops text below 4.5:1", () => {
  const page = read("app/landing/page.js");
  const hero = read("app/landing/components/HeroSection.js");
  const features = read("app/landing/components/Features.js");
  const base = hexRgb(page.match(/className="[^"]*?(?<![\w:-])bg-\[(#[0-9a-fA-F]{6})\](?!\/)[^"]*"/)[1]);
  // Every translucent fill of the fixed layer (it can sit under any section), all
  // stacked at full alpha (blur only lowers the peak, so this is a bound), plus
  // the section's own glow/gradient.
  const layers = [];
  const decor = page.slice(page.indexOf("fixed inset-0"), page.indexOf("relative z-10"));
  for (const m of decor.matchAll(/bg-(\[#[0-9a-fA-F]{6}\]|[a-z]+-\d00)\/(\d+)/g)) layers.push([colour(m[1]), +m[2] / 100]);
  const grid = decor.match(/opacity-\[([\d.]+)\]/);
  if (grid) layers.push([hexRgb("#f97815"), +grid[1]]);
  const heroGlow = [...hero.matchAll(/bg-(\[#[0-9a-fA-F]{6}\])\/(\d+)[^"]*blur/g)].map((m) => [colour(m[1]), +m[2] / 100]);
  const ctaGlow = [...page.matchAll(/from-(\[#[0-9a-fA-F]{6}\])\/(\d+)/g)].map((m) => [colour(m[1]), +m[2] / 100]);
  const stack = (extra) => [...layers, ...extra].reduce((bg, [c, a]) => over(c, a, bg), base);

  it("finds the decorative layers", () => {
    expect(layers.length).toBeGreaterThanOrEqual(4);
    expect(heroGlow).toHaveLength(1);
    expect(ctaGlow).toHaveLength(1);
  });
  const heading = features.slice(0, features.indexOf("grid grid-cols"));
  const ctaStart = page.indexOf("CTA Section");
  const cta = page.slice(ctaStart, page.indexOf("</section>", ctaStart));
  const transparentText = [
    ["hero", hero.replace(/className="[^"]*bg-\[#[0-9a-fA-F]{6}\](?!\/)[^"]*"/g, ""), heroGlow],
    ["features heading", heading, []],
    ["cta", cta.replace(/className="[^"]*bg-\[#[0-9a-fA-F]{6}\](?!\/)[^"]*"/g, ""), ctaGlow],
  ];
  for (const [where, src, extra] of transparentText) {
    it(`${where}: inherited white and every text colour >= 4.5:1 on the worst composite`, () => {
      const worst = stack(extra);
      for (const c of ["white", ...textColours(src)]) {
        expect(ratio(colour(c), worst), `${where}: ${c} on rgb(${worst})`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it("feature card hover titles stay >= 4.5:1 on the card plus its hover tint", () => {
    for (const m of features.matchAll(/bg: "hover:bg-([a-z]+-\d00)\/(\d+)",[\s\S]*?titleHover: "group-hover:text-([a-z]+-\d00)"/g)) {
      const surface = over(colour(m[1]), +m[2] / 100, hexRgb("#23180f"));
      expect(ratio(colour(m[3]), surface), m[3]).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("G4 L4: landing content needs no scroll-triggered JS to be visible", () => {
  const files = walk(join(SRC, "app/landing"));
  it("no IntersectionObserver / scroll listeners gate visibility", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/IntersectionObserver|addEventListener\(\s*["']scroll/);
  });
  it("opacity-0 only on hover-revealed affordances", () => {
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] || m[2];
        if (/(?<![\w:-])opacity-0(?![\w-])/.test(cls)) expect(cls, rel(f)).toMatch(/group-hover:opacity-100/);
      }
    }
  });
  it("animated blobs stop under prefers-reduced-motion", () => {
    expect(read("app/landing/page.js")).toMatch(/prefers-reduced-motion[\s\S]*animate-blob[\s\S]*animation:\s*none/);
  });
});
