// Guards E1: display fields live in providersDisplay.js, merged back into AI_PROVIDERS (shape unchanged).
import { describe, it, expect } from "vitest";

const DISPLAY_FIELDS = ["name", "icon", "color"];

describe("provider display split (E1)", () => {
  it("AI_PROVIDERS entries still carry merged display + transport", async () => {
    const { AI_PROVIDERS } = await import("../../src/shared/constants/providers.js");
    const kiro = AI_PROVIDERS.kiro;
    // display merged
    expect(kiro.name).toBe("Kiro AI");
    expect(kiro.icon).toBe("psychology_alt");
    // transport kept
    expect(kiro.id).toBe("kiro");
    expect(kiro.alias).toBe("kiro");
    // transport-heavy provider keeps its config
    expect(AI_PROVIDERS.gemini.serviceKinds).toContain("tts");
    expect(AI_PROVIDERS.gemini.ttsConfig).toBeTruthy();
  });

  it("display fields source from providersDisplay.js", async () => {
    const { PROVIDER_DISPLAY } = await import("../../src/shared/constants/providersDisplay.js");
    const { AI_PROVIDERS } = await import("../../src/shared/constants/providers.js");
    for (const f of DISPLAY_FIELDS) {
      expect(PROVIDER_DISPLAY.kiro[f]).toBe(AI_PROVIDERS.kiro[f]);
    }
  });

  it("helpers still work after split", async () => {
    const m = await import("../../src/shared/constants/providers.js");
    expect(m.ALIAS_TO_ID.kiro).toBe("kiro");
    expect(m.getProvidersByKind("tts").length).toBeGreaterThan(0);
  });

  it("Cloudflare exposes API-key authentication on its free-tier card", async () => {
    const { FREE_TIER_PROVIDERS } = await import("../../src/shared/constants/providers.js");
    expect(FREE_TIER_PROVIDERS["cloudflare-ai"].authType).toBe("apikey");
    expect(FREE_TIER_PROVIDERS["cloudflare-ai"].authModes).toEqual(["apikey"]);
  });

  it("Kimchi keeps free-tier grouping and both authentication modes", async () => {
    const {
      FREE_TIER_PROVIDERS, AI_PROVIDERS, OAUTH_PROVIDERS,
      APIKEY_PROVIDERS, getProviderByAlias,
    } = await import("../../src/shared/constants/providers.js");
    const kimchi = FREE_TIER_PROVIDERS.kimchi;
    expect(kimchi).toBeDefined();
    expect(kimchi.id).toBe("kimchi");
    expect(kimchi.alias).toBe("kimchi");
    expect(kimchi.authModes).toEqual(["oauth", "apikey"]);
    expect(kimchi.hasOAuth).toBe(true);
    expect(AI_PROVIDERS.kimchi).toBe(kimchi);
    expect(OAUTH_PROVIDERS.kimchi).toBeUndefined();
    expect(APIKEY_PROVIDERS.kimchi).toBeUndefined();
    expect(getProviderByAlias("kimchi")).toBe(kimchi);
  });
});
