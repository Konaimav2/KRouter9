// Wave G2 (ui-fix r3 leftovers, RESULTS.md (e) table + landing axe nodes).
//  C1  landing "How KRouter9 Works": the section paints an opaque dark surface
//      (a translucent one composites to #b5b3ac over the light canvas, 1.23:1)
//      and every text colour in it meets 4.5:1 on that surface.
//  C2  landing footer bottom row: >= 4.5:1 on #120f0d (was gray-600, 2.52:1).
//  C3  landing sweep: no text-bearing element sits on a translucent hex
//      surface, and every text colour used in landing/** meets 4.5:1 on the
//      darkest-and-lightest opaque landing surfaces it can land on.
//  T1  every (e)-table control in G2's files reaches 44px: breadcrumb links,
//      "Open settings" links, provider "Get API Key"/not-found back link,
//      thinking-level select, selection checkboxes (44px input box, 16px visual),
//      CLI copy buttons, MITM base URL/key inputs, combo model-picker chips and
//      search, landing logo, docs nav links, basic-chat composer.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../../src/", import.meta.url);
const read = (file) => readFileSync(new URL(file, SRC), "utf8");
const DASH = "app/(dashboard)/dashboard/";

// ---- WCAG contrast -------------------------------------------------------------
const hex = (h) => { const v = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)); };
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, alpha) => "#" + hex(fg).map((c, i) => Math.round(c * alpha + hex(bg)[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");

// Tailwind v4 palette values used by the landing page (oklch rounded to sRGB).
const TW = { white: "#ffffff", "gray-300": "#d1d5dc", "gray-400": "#99a1af", "gray-500": "#6a7282", "gray-600": "#4a5565", "gray-700": "#364153" };
const textColours = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/(?<![\w:-])text-(white|gray-\d00|\[#[0-9a-fA-F]{6}\])(?![\w/-])/g)) {
    out.add(m[1].startsWith("[") ? m[1].slice(1, -1).toLowerCase() : TW[m[1]]);
  }
  return [...out];
};
const LIGHT_CANVAS = "#f4f5f0"; // what axe composited the translucent section over (RESULTS.md)

describe("G2 C1: How KRouter9 Works contrast", () => {
  const src = read("app/landing/components/HowItWorks.js");
  const section = src.match(/<section className="([^"]*)"/)[1];

  it("the section surface is an opaque hex (no /alpha), so the light canvas never shows through", () => {
    expect(section).toMatch(/(?<![\w:-])bg-\[#[0-9a-fA-F]{6}\](?!\/)/);
    expect(section).not.toMatch(/bg-\[#[0-9a-fA-F]{6}\]\/\d+/);
  });

  it("every text colour (and the inherited white) is >= 4.5:1 on the section surface", () => {
    const bg = section.match(/bg-\[(#[0-9a-fA-F]{6})\](?!\/)/)?.[1];
    expect(bg, "opaque section bg").toBeTruthy();
    const colours = [TW.white, ...textColours(src)];
    for (const c of colours) expect(ratio(c, bg), `${c} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("documents the r3 failure: white / gray-400 over the translucent surface on the light canvas", () => {
    const composite = mix("#23180f", LIGHT_CANVAS, 0.3);
    expect(ratio(TW.white, composite)).toBeLessThan(4.5);
    expect(ratio(TW["gray-400"], composite)).toBeLessThan(4.5);
  });
});

describe("G2 C2: landing footer contrast", () => {
  const src = read("app/landing/components/Footer.js");
  it("no gray-600/700 text on the #120f0d footer", () => {
    expect(src).not.toMatch(/(?<![\w:-])text-gray-(600|700)\b/);
  });
  it("every footer text colour is >= 4.5:1 on #120f0d", () => {
    for (const c of [TW.white, ...textColours(src)]) expect(ratio(c, "#120f0d"), c).toBeGreaterThanOrEqual(4.5);
  });
});

describe("G2 C3: landing sweep", () => {
  const FILES = ["HeroSection", "HowItWorks", "Features", "GetStarted", "FlowAnimation", "Footer", "Navigation"].map((f) => `app/landing/components/${f}.js`).concat("app/landing/page.js");
  it("no translucent hex surface carries text (bg-[#hex]/NN on an element with a text colour)", () => {
    for (const f of FILES) {
      for (const m of read(f).matchAll(/className="([^"]*)"/g)) {
        const cls = m[1];
        const translucent = /(?<![\w:-])bg-\[#[0-9a-fA-F]{6}\]\/\d+/.test(cls) && !/(?<![\w:-])(blur-\[|pointer-events-none)/.test(cls);
        expect(translucent && /(?<![\w:-])text-/.test(cls), `${f}: ${cls}`).toBe(false);
      }
    }
  });
  it("every landing text colour meets 4.5:1 on its own opaque surface, else on every opaque landing surface", () => {
    // Opaque surfaces that sit under text on the landing page.
    const surfaces = ["#181411", "#120f0d", "#23180f", "#1e1e1e", "#252526"];
    for (const f of FILES) {
      for (const m of read(f).matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] || m[2];
        const colours = textColours(cls);
        if (!colours.length) continue;
        const own = cls.match(/(?<![\w:-])bg-\[(#[0-9a-fA-F]{6})\](?!\/)/)?.[1];
        for (const c of colours) {
          for (const bg of own ? [own] : surfaces) expect(ratio(c, bg), `${f}: ${c} on ${bg} (${cls})`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});

// ---- 44px targets ----------------------------------------------------------------
const TALL = /(?<![\w:-])(min-h-11|h-11|size-11|min-h-12|h-12|size-12|hit-target)(?![\w-])/;
function classOf(src, anchor) {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found: ${anchor}`);
  const open = src.lastIndexOf("<", at);
  const cn = src.indexOf("className=", open);
  if (cn < 0) return "";
  const rest = src.slice(cn + "className=".length);
  if (rest.startsWith('"')) return rest.slice(1, rest.indexOf('"', 1));
  if (rest.startsWith("{`")) return rest.slice(2, rest.indexOf("`}"));
  return "";
}

describe("G2 T1: (e) table controls reach 44px", () => {
  it("#1/#2 endpoint 'Open settings' links (card and SecurityWarning banner)", () => {
    expect(classOf(read(`${DASH}endpoint/EndpointPageClient.js`), 'href="/dashboard/profile" className')).toMatch(TALL);
    expect(classOf(read(`${DASH}endpoint/components/SecurityWarning.js`), "href={action.href}")).toMatch(TALL);
  });

  it("#3 landing logo button", () => {
    expect(classOf(read("app/landing/components/Navigation.js"), 'aria-label="KRouter9 home"')).toMatch(TALL);
  });

  it("#4/#5 docs header nav links (Dashboard, OpenAPI YAML)", () => {
    const src = read("app/docs/page.js");
    expect(classOf(src, 'href="/dashboard" className')).toMatch(TALL);
    expect(classOf(src, 'href="/api/docs/openapi.yaml"')).toMatch(TALL);
  });

  it("#6 basic-chat composer textarea is 44px tall when empty", () => {
    expect(classOf(read(`${DASH}basic-chat/BasicChatPageClient.js`), 'id="playground-composer"')).toMatch(TALL);
  });

  it("#14/#15 MITM base URL input, key select and sudo field", () => {
    const src = read(`${DASH}cli-tools/components/MitmServerCard.js`);
    const controls = [...src.matchAll(/<(input|select)\b[\s\S]*?className="([^"]*)"/g)].filter((m) => /flex-1 min-w-0/.test(m[2]));
    expect(controls.length).toBeGreaterThanOrEqual(2);
    for (const m of controls) expect(m[2], m[0].slice(0, 80)).toMatch(TALL);
  });

  it("#16 breadcrumb links in the shared header", () => {
    const src = read("shared/components/Header.js");
    expect(classOf(src, "<Link href={crumb.href}")).toMatch(TALL);
  });

  it("#17/#20/#21 provider detail: Get API Key, Service status, thinking select, not-found back link", () => {
    const src = read(`${DASH}providers/[id]/page.js`);
    expect(classOf(src, "href={providerInfo.notice?.apiKeyUrl || providerInfo.notice?.signupUrl || providerInfo.website}")).toMatch(TALL);
    expect(classOf(src, 'href="https://status.cursor.com"')).toMatch(TALL);
    expect(classOf(src, 'aria-label="Thinking level suffix for copied model names"')).toMatch(TALL);
    const notFound = src.slice(src.indexOf("Provider not found"));
    expect(classOf(notFound, 'href="/dashboard/providers"')).toMatch(TALL);
  });

  it("#18/#19 selection checkboxes: the input box fills the 44px label, a 16px mark stays the visual", () => {
    const src = read(`${DASH}providers/[id]/page.js`);
    const consts = Object.fromEntries([...src.matchAll(/const (\w+) = "([^"]*)";/g)].map((m) => [m[1], m[2]]));
    const inputs = [...src.matchAll(/<input\s+type="checkbox"[\s\S]*?className=(?:"([^"]*)"|\{(\w+)\})/g)].map((m) => m[1] ?? consts[m[2]]);
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const cls of inputs) {
      expect(typeof cls, "resolved checkbox class").toBe("string");
      // the input itself is positioned over its label: the label must be relative and 44px
      expect(src).toMatch(/<label className="relative flex min-h-11[^"]*">\s*<input\s+type="checkbox"/);
      expect(cls).not.toMatch(/\bh-(3\.5|4)\b|\bw-(3\.5|4)\b/);
      expect(cls).toMatch(/\babsolute\b/);
      expect(cls).toMatch(/\binset-0\b/);
      expect(cls).toMatch(/\bopacity-0\b/);
      expect(cls).toMatch(/\bpeer\b/);
    }
    expect(src).toMatch(/peer-checked:/);
    expect(src).toMatch(/peer-focus-visible:/);
  });

  it("#22/#23 CLI setup copy buttons", () => {
    const src = read(`${DASH}cli-tools/[toolId]/ToolDetailClient.js`);
    expect(classOf(src, "onClick={copy}")).toMatch(TALL);
  });

  it("#30-35 combo model picker: chips and search input", () => {
    const src = read("shared/components/ModelSelectModal.js");
    const search = src.slice(src.indexOf("<input", src.indexOf('name="search"')));
    expect(search.match(/className="([^"]*)"/)[1]).toMatch(TALL);
    const chips = [...src.matchAll(/className=\{`([\s\S]*?)`\}/g)].map((m) => m[1]).filter((c) => /rounded-xl text-xs font-medium/.test(c));
    expect(chips.length).toBe(2);
    for (const c of chips) {
      expect(c).toMatch(TALL);
      expect(c).not.toMatch(/\bpy-1\b(?!\.)/);
    }
  });
});
