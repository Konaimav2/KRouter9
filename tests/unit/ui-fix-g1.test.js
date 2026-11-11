// Wave G1 (ui-fix r3 follow-up): undefined CSS variables (item m) and the
// touch-target / Retry gaps in Usage, Console Log, Quota, Proxy Pools, MITM,
// Token Saver and Media pages (RESULTS.md ui-fix-r3-20261111, item e table and
// remaining-defects list).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");
const css = read("src/app/globals.css");
const D = "src/app/(dashboard)/dashboard";
const MEDIA = `${D}/media-providers/[kind]/[id]/components`;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?jsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

const defined = new Set([...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
const remToPx = (value) => {
  const m = String(value).match(/^([\d.]+)(rem|px)$/);
  if (!m) return NaN;
  return m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
};
// className of the element carrying id="<id>" (attributes may contain "=>").
const classOfId = (src, id) => {
  const at = src.indexOf(`id="${id}"`);
  if (at < 0) return "";
  return src.slice(at).match(/className="([^"]*)"/)?.[1] || "";
};
const touchMin = remToPx(css.match(/--touch-min:\s*([^;]+);/)?.[1]);

describe("item m: every var(--name) used in src/ is defined", () => {
  it("--touch-min is at least 44px", () => {
    expect(touchMin).toBeGreaterThanOrEqual(44);
  });

  it("has no var() without a fallback that globals.css never defines", () => {
    const missing = [];
    for (const file of walk(join(root, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g)) {
        const [, name, next] = m;
        if (next === ",") continue; // has a fallback
        if (name.startsWith("--tw-")) continue; // Tailwind internals
        if (!defined.has(name)) missing.push(`${file.slice(root.length)}: ${name}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("usage controls size off --touch-min (>=44px), not undefined tokens", () => {
    for (const file of [`${D}/usage/page.js`, `${D}/usage/components/UsageLogs.js`, `${D}/usage/components/PerKeyUsageSection.js`, `${D}/usage/components/UsageTable.js`]) {
      const src = read(file);
      expect(src, file).not.toMatch(/--touch-h|--control-h/);
    }
    const page = read(`${D}/usage/page.js`);
    for (const id of ["usage-start", "usage-end"]) {
      expect(classOfId(page, id), id).toMatch(/min-h-\[var\(--touch-min\)\]/);
    }
    expect(page).toMatch(/type="submit" className="[^"]*min-h-\[var\(--touch-min\)\][^"]*">Apply range/);
    const logs = read(`${D}/usage/components/UsageLogs.js`);
    for (const id of ["request-search", "status-filter", "provider-filter"]) {
      expect(classOfId(logs, id), id).toMatch(/h-\[var\(--touch-min\)\]/);
    }
    const perKey = read(`${D}/usage/components/PerKeyUsageSection.js`);
    for (const id of ["key-search", "mobile-key"]) {
      expect(classOfId(perKey, id), id).toMatch(/h-\[var\(--touch-min\)\]/);
    }
    // An inline <a> ignores min-height: "Manage key" must be a flex box.
    expect(perKey).toMatch(/className="[^"]*inline-flex[^"]*min-h-\[var\(--touch-min\)\][^"]*">Manage key/);
  });

  it("usage error text uses the real danger token (>=4.5:1 in both themes)", () => {
    const page = read(`${D}/usage/page.js`);
    expect(page).toMatch(/role="alert" className="[^"]*text-\[var\(--color-danger\)\]/);
  });

  it("Console Log Live/Pause group has a defined radius", () => {
    const src = read(`${D}/console-log/ConsoleLogClient.js`);
    expect(src).not.toContain("--radius-status");
    expect(src).toMatch(/role="radiogroup" aria-label="Log stream mode"/);
    expect(src).toMatch(/rounded-\[var\(--radius-control\)\][^"]*" role="radiogroup"/);
  });
});

describe("item e: controls under 44px in G1 files", () => {
  it("quota bulk buttons are at least 44px wide when icon-only", () => {
    const src = read(`${D}/usage/components/ProviderLimits/index.js`);
    for (const title of ["Disable connections with depleted quota", "Enable connections that still have quota", "Refresh all"]) {
      const idx = src.indexOf(`title="${title}`);
      expect(idx, title).toBeGreaterThan(0);
      const cls = src.slice(src.lastIndexOf("className=", idx), idx);
      expect(cls, title).toMatch(/min-w-11/);
      expect(cls, title).toMatch(/h-11/);
    }
  });

  it("proxy Reveal button is 44x44", () => {
    const src = read("src/shared/components/MaskedProxyValue.js");
    const idx = src.indexOf('title="Reveal full URL');
    const cls = src.slice(src.lastIndexOf("className=", idx), idx);
    expect(cls).toMatch(/size-11/);
  });

  it("token-saver extras checkbox gets a 44px label hit area; Uninstall is 44px", () => {
    const src = read(`${D}/token-saver/TokenSaverClient.js`);
    expect(src).toMatch(/<label className="[^"]*min-h-11[^"]*"><input type="checkbox" checked=\{pending\}/);
    expect(src).toMatch(/onClick=\{\(\) => handleRemoveExtra\(extra\)\}[^>]*className="[^"]*min-h-11/);
  });

  it("media detail 'Get API Key' links are 44px tall", () => {
    const src = read(`${D}/media-providers/[kind]/[id]/page.js`);
    const links = [...src.matchAll(/href=\{provider\.notice\.apiKeyUrl\}[\s\S]*?className="([^"]+)"/g)].map((m) => m[1]);
    expect(links.length).toBe(2);
    for (const cls of links) expect(cls).toMatch(/min-h-11/);
  });
});

describe("Retry for failed API-key loads and token-saver stats", () => {
  const cards = [`${MEDIA}/EmbeddingExampleCard.js`, `${MEDIA}/TtsExampleCard.js`, `${MEDIA}/GenericExampleCard.js`, `${MEDIA}/SttExampleCard.js`, `${D}/media-providers/combo/[id]/page.js`];
  for (const file of cards) {
    it(`${file.split("/").slice(-2).join("/")} offers Retry when API keys fail to load`, () => {
      const src = read(file);
      expect(src).toMatch(/const fetchKeys = useCallback\(/);
      expect(src).toMatch(/const retryKeys = \(\) => \{[^}]*fetchKeys\(\)/);
      expect(src).toMatch(/keysError && <button type="button" onClick=\{retryKeys\}[^>]*min-h-11[^>]*>Retry<\/button>/);
    });
  }

  it("token-saver 'stats unavailable' alerts carry a Retry", () => {
    const src = read(`${D}/token-saver/TokenSaverClient.js`);
    const alerts = [...src.matchAll(/stats unavailable[\s\S]{0,400}?<\/span>/g)];
    expect(alerts.length).toBe(2);
    const retries = src.match(/onClick=\{retryStats\}[^>]*min-h-11[^>]*>Retry<\/button>/g) || [];
    expect(retries.length).toBe(2);
    expect(src).toMatch(/statsRetry/);
  });
});
