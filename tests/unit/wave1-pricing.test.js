import { describe, expect, it } from "vitest";
import { getModelPricing } from "../../open-sse/utils/pricing.js";

describe("C dated-build pricing using the shipped catalog", () => {
  it.each(["1017", "20261017"])("prices a missing -%s build using its base", (stamp) => {
    const base = getModelPricing("claude-sonnet-4-6");
    expect(base).toMatchObject({ input: 3, output: 15 });
    expect(getModelPricing(`CLAUDE-SONNET-4-6-${stamp}`)).toEqual(base);
  });
  it("preserves exact dated catalog entries", () => {
    expect(getModelPricing("claude-haiku-4-5-20251001")?.raw.id).toBe("claude-haiku-4-5-20251001");
  });
  it.each(["claude-sonnet-4-6-1017-1018", "claude-sonnet-4-6-12345", "unknown-1017", "claude-sonnet-4-6-１０１７"])("does not overstrip %s", (id) => {
    expect(getModelPricing(id)).toBeNull();
  });
});
