import { describe, it, expect, vi, afterEach } from "vitest";
import { testApiKeyConnection } from "../../src/app/api/providers/[id]/test/testUtils.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("testApiKeyConnection for registry OpenAI providers (P-SUG test gaps)", () => {
  it("probes registry baseUrl when psd.baseUrl is absent (migrated connections)", async () => {
    const seen = {};
    vi.stubGlobal("fetch", async (url, opts) => {
      seen.url = String(url);
      seen.auth = opts?.headers?.Authorization;
      return { ok: true, status: 200 };
    });
    const res = await testApiKeyConnection({
      provider: "agentrouter",
      apiKey: "test-key",
      providerSpecificData: {},
    });
    expect(res.valid).toBe(true);
    expect(seen.url).toContain("agentrouter.org/v1/models");
    expect(seen.auth).toBe("Bearer test-key");
  });

  it("reports invalid key when upstream rejects", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401 }));
    const res = await testApiKeyConnection({
      provider: "tokenharbor",
      apiKey: "bad-key",
      providerSpecificData: {},
    });
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Invalid API key or base URL");
  });

  it("still reports missing base URL for unknown providers", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("must not fetch"); });
    const res = await testApiKeyConnection({
      provider: "definitely-not-a-provider",
      apiKey: "k",
      providerSpecificData: {},
    });
    expect(res.valid).toBe(false);
  });
});
