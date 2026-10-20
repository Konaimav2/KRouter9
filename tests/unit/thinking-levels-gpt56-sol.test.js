import { describe, it, expect } from "vitest";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { QUOTA_AUTOPING_CONFIG } from "../../src/shared/constants/config.js";

describe("getThinkingLevels", () => {
  it.each([
    ["gpt-5.6-sol", ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]],
    ["gpt-5.6-terra", ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]],
    ["gpt-5.6-luna", ["none", "minimal", "low", "medium", "high", "xhigh", "max"]],
    ["gpt-5.6-sol-review", ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]],
    ["gpt-5.6-terra-review", ["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]],
    ["gpt-5.6-luna-review", ["none", "minimal", "low", "medium", "high", "xhigh", "max"]],
  ])("returns Codex levels for %s", (model, expected) => {
    expect(getThinkingLevels("codex", model)).toEqual(expected);
  });

  it("does not expose Codex-only GPT-5.6 overrides on Kiro", () => {
    expect(getThinkingLevels("kiro", "gpt-5.6-sol")).toEqual([
      "none", "minimal", "low", "medium", "high", "xhigh",
    ]);
  });

  it("does not add max for other codex models", () => {
    const levels = getThinkingLevels("codex", "gpt-5.3-codex");
    expect(levels).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("does not add max for other Codex models", () => {
    expect(getModelsByProviderId("codex").map(m => m.id)).not.toContain("gpt-5.5");
    expect(getModelsByProviderId("codex").map(m => m.id)).not.toContain("gpt-5.5-review");
    expect(getModelsByProviderId("codex").map(m => m.id)).not.toContain("gpt-5.5-image");
    expect(getModelsByProviderId("codex").map(m => m.id)).not.toContain("gpt-5.3-image");
    expect(QUOTA_AUTOPING_CONFIG.providers.codex.pingModel).toBe("gpt-5.6-terra");
    const levels = getThinkingLevels("codex", "gpt-daybreak-blue-latest");
    expect(levels || []).not.toContain("max");
  });
});
