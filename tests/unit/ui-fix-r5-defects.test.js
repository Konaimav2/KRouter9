import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

describe("QA r5 defects", () => {
  it("D1 pagination controls have accessible names", () => {
    const s = read("src/shared/components/Pagination.js");
    expect(s).toMatch(/aria-label="Previous page"/);
    expect(s).toMatch(/aria-label="Next page"/);
    expect(s).toMatch(/aria-label="Rows per page"/);
  });
  it("D2 usage logs scroll region is keyboard focusable", () => {
    expect(read("src/app/(dashboard)/dashboard/usage/components/UsageLogs.js")).toMatch(/overflow-x-auto" tabIndex=\{0\} role="region"/);
  });
  it("D3 small links and Add Model reach 44px", () => {
    expect(read("src/shared/components/Header.js")).toMatch(/min-h-11 min-w-11/);
    expect(read("src/shared/components/ProviderInfoCard.js").match(/min-h-11/g).length).toBe(2);
    expect(read("src/app/(dashboard)/dashboard/providers/components/ModelsCard.js")).toMatch(/flex min-h-11 items-center gap-1.5/);
  });
  it("D4 landing feature icons exist in the icon map", () => {
    const icon = read("src/shared/components/Icon.js");
    const map = icon.match(/const ICONS = \{([\s\S]*?)\n\};/)[1];
    const names = [...read("src/app/landing/components/Features.js").matchAll(/icon: "(\w+)"/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(5);
    for (const n of names) expect(map).toMatch(new RegExp(`\\b${n}:`));
  });
  it("legacy key presets are scrubbed at page load", () => {
    expect(read("src/app/(dashboard)/dashboard/cli-tools/CLIToolsPageClient.js")).toMatch(/readKeyPresets\(\)/);
    expect(read("src/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js")).toMatch(/readKeyPresets\(\)/);
  });
});

describe("QA r5b defects", () => {
  it("E1 tool detail surfaces a keys load failure with Retry", () => {
    const s = read("src/app/(dashboard)/dashboard/cli-tools/[toolId]/ToolDetailClient.js");
    expect(s).toMatch(/LoadFailedState/);
    expect(s).toMatch(/API keys could not be loaded \(HTTP/);
    expect(s).toMatch(/Providers could not be loaded \(HTTP/);
  });
  it("E2/E3 endpoint Retry and MITM Start Server reach 44px", () => {
    expect(read("src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js")).toMatch(/min-h-11 min-w-11 items-center justify-center font-semibold underline/);
    expect(read("src/app/(dashboard)/dashboard/cli-tools/components/MitmServerCard.js")).toMatch(/min-h-11 sm:w-auto sm:py-1.5/);
  });
});

describe("QA r5 judge D2: every literal icon name resolves", () => {
  it("no <Icon name>/icon: literal falls back to AlertCircle", () => {
    const iconSrc = read("src/shared/components/Icon.js");
    const known = new Set([...iconSrc.match(/const ICONS = \{([\s\S]*?)\n\};/)[1].matchAll(/(\w+):/g)].map((m) => m[1]));
    const skip = /guardrails|migrations|api\/|schedulerLifecycle/;
    const missing = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
        const rel = `${d}/${f.name}`;
        if (f.isDirectory()) walk(rel);
        else if (/\.js$/.test(f.name) && !skip.test(rel)) {
          const s = read(rel);
          for (const m of s.matchAll(/<Icon[^>]*\bname="([a-z][a-z0-9_]+)"/g)) if (!known.has(m[1])) missing.push(`${rel}:${m[1]}`);
        }
      }
    };
    walk("src");
    const consts = read("src/shared/constants/providers.js");
    for (const m of consts.matchAll(/icon:\s*"([a-z_]+)"/g)) if (!known.has(m[1])) missing.push(`providers.js:${m[1]}`);
    expect(missing).toEqual([]);
  });
});

describe("QA r6: reveal-error Retry is a 44px target", () => {
  it("every onDemand.retry button carries min-h-11", () => {
    const base = "src/app/(dashboard)/dashboard/media-providers";
    const files = ["[kind]/[id]/components/GenericExampleCard.js","[kind]/[id]/components/SttExampleCard.js","[kind]/[id]/components/EmbeddingExampleCard.js","[kind]/[id]/components/TtsExampleCard.js","combo/[id]/page.js"];
    for (const f of files) expect(read(`${base}/${f}`)).not.toMatch(/onClick=\{onDemand\.retry\} className="underline/);
  });
});
