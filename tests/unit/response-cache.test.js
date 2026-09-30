import { describe, it, expect } from "vitest";
import {
  buildCacheKey, isCacheableRequest, isCacheEntryLive, pruneCacheEntries,
} from "open-sse/services/responseCache.js";

const REQ = (over = {}) => ({
  provider: "ag",
  model: "ag/claude-sonnet-4-6",
  body: { messages: [{ role: "user", content: "hi" }], stream: false },
  apiKeyId: "k1",
  ...over,
});

describe("responseCache (W14 own-cache)", () => {
  it("builds stable keys regardless of key order", async () => {
    const a = await buildCacheKey({ ...REQ(), body: { b: 1, a: 2, messages: [] } });
    const b = await buildCacheKey({ ...REQ(), body: { a: 2, b: 1, messages: [] } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates identities and models", async () => {
    const a = await buildCacheKey(REQ());
    const b = await buildCacheKey(REQ({ apiKeyId: "k2" }));
    const c = await buildCacheKey(REQ({ model: "ag/other" }));
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("skips streaming, tools, and non-text requests", () => {
    expect(isCacheableRequest(REQ()).ok).toBe(true);
    expect(isCacheableRequest(REQ({ body: { messages: [], stream: true } })).ok).toBe(false);
    expect(isCacheableRequest(REQ({ body: { messages: [], tools: [{ type: "function" }] } })).ok).toBe(false);
    expect(isCacheableRequest(REQ({ body: null })).ok).toBe(false);
  });

  it("expires entries by expiresAt", () => {
    expect(isCacheEntryLive({ expiresAt: Date.now() + 1000 })).toBe(true);
    expect(isCacheEntryLive({ expiresAt: Date.now() - 1000 })).toBe(false);
    expect(isCacheEntryLive(null)).toBe(false);
  });

  it("prunes expired entries", () => {
    const now = Date.now();
    const out = pruneCacheEntries([
      { key: "a", expiresAt: now - 1 },
      { key: "b", expiresAt: now + 1000 },
    ]);
    expect(out).toEqual([{ key: "b", expiresAt: now + 1000 }]);
  });
});
