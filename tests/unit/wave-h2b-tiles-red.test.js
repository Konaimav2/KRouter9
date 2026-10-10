// Wave H2b item 2 (tiles) — regression pin (was RED pre-fix, GREEN post-fix).
// Real-click battery FAIL: "tile count-vs-grid" (x2): Rate limited (3) /
// Network (5) tiles vs empty provider grids.
// Pre-fix, the API-key lane filtered on bare "apikey":
//   getProviderStats(providerId, "apikey")
// while real stored connections use "api_key" (windsurf oauth flow in
// src/app/api/oauth/[provider]/[action]/route.js, kiro api-key flow in
// src/app/api/oauth/kiro/api-key/route.js) — so the lane was EMPTY and the
// error-class tile filter dropped it. Fix: lane stats use both variants.
// This test fails on the pre-fix source and passes on the fixed source.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../src/app/(dashboard)/dashboard/providers/page.js", import.meta.url),
  "utf8",
);

describe("wave-h2b tiles: apikey lane matches stored authType vocabulary", () => {
  it("RED pre-fix / GREEN post-fix: apikey lane stats include api_key", () => {
    expect(source).toContain('getProviderStats(providerId, ["apikey", "api_key"])');
  });

  it("no bare-apikey lane stats remain", () => {
    expect(source).not.toContain('getProviderStats(providerId, "apikey")');
  });
});
