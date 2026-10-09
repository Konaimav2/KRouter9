import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

describe("keys disclosure hardening (RED)", () => {
  it("list GET returns metadata + server mask only, never raw key", () => {
    const src = read("src/app/api/keys/route.js");
    expect(src).toMatch(/maskedKey|mask.*key|keyPreview/i);
    expect(src).not.toMatch(/return NextResponse\.json\(\{\s*keys\s*\}\)/);
    expect(src).not.toMatch(/getApiKeys\(\)[\s\S]{0,400}\{\s*keys\s*\}/);
  });

  it("detail GET returns sanitized metadata, never raw key", () => {
    const src = read("src/app/api/keys/[id]/route.js");
    expect(src).toMatch(/maskedKey|sanitiz/i);
    expect(src).not.toMatch(/return NextResponse\.json\(\{\s*key\s*\}\)/);
  });

  it("PUT responses sanitized (no update-bypass raw echo)", () => {
    const src = read("src/app/api/keys/[id]/route.js");
    expect(src).not.toMatch(/return NextResponse\.json\(\{\s*key:\s*(updated|rotated)\s*\}\)/);
    expect(src).toMatch(/sanitiz/i);
  });

  it("create/rotate require strict dashboard/CLI auth independent of requireLogin + no-store", () => {
    const list = read("src/app/api/keys/route.js");
    const detail = read("src/app/api/keys/[id]/route.js");
    const rotate = read("src/app/api/keys/[id]/rotate/route.js");
    for (const src of [list, rotate, detail]) {
      expect(src).toMatch(/authorize|hasValidDashboardSession|requireLogin/i);
    }
    for (const src of [list, rotate]) {
      expect(src).toMatch(/no-store/);
    }
  });

  it("keys reveal endpoint exists with confirm + limiter + audit + no-store, no bulk", () => {
    const rel = "src/app/api/keys/[id]/reveal/route.js";
    expect(exists(rel)).toBe(true);
    const src = read(rel);
    expect(src).toMatch(/confirm/);
    expect(src).toMatch(/429|RateLimit|reveal/i);
    expect(src).toMatch(/no-store/);
    expect(src).toMatch(/audit/i);
    expect(src).not.toMatch(/getApiKeys\(\)/);
  });

  it("provider api-key reveal exists, apikey-auth ONLY (never OAuth/proxy/full-connection)", () => {
    const rel = "src/app/api/providers/[id]/api-key/reveal/route.js";
    expect(exists(rel)).toBe(true);
    const src = read(rel);
    expect(src).toMatch(/confirm/);
    expect(src).toMatch(/no-store/);
    expect(src).toMatch(/audit/i);
    expect(src).not.toMatch(/proxyUrl|connectionProxyUrl|proxy-pool/i);
    expect(src).not.toMatch(/oauth|refresh_token|clientSecret/i);
  });

  it("reveal guards reject login-disabled and gateway bearers (route-local auth)", () => {
    const k = read("src/app/api/keys/[id]/reveal/route.js");
    const p = read("src/app/api/providers/[id]/api-key/reveal/route.js");
    for (const src of [k, p]) {
      expect(src).toMatch(/dashboard|cli/i);
      expect(src).not.toMatch(/requireLogin\s*===?\s*false[^]*return[^]*reveal/i);
    }
    expect(k + p).not.toMatch(/Authorization.*Bearer.*validateApiKey|getApiKeyByKey/);
  });

  it("UI loads masked metadata only; reveal/copy via guarded reads; clears <=15s + on dismiss/navigate", () => {
    const src = read("src/app/(dashboard)/dashboard/endpoint/EndpointPageClient.js");
    expect(src).toMatch(/maskedKey|maskKey/);
    expect(src).toMatch(/\/api\/keys\/.*\/reveal\?confirm=true/);
    expect(src).toMatch(/15_?000|15\s*\*\s*1000|setTimeout/);
    expect(src).not.toMatch(/visibleKeys\.has\(key\.id\) \? key\.key/);
  });
});
