import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => []),
  getCombos: vi.fn(async () => [
    { name: "mix-combo", models: ["ag/claude-opus-4-8", "cx/unknown-model-xyz"] },
    { name: "empty-combo", models: [] },
  ]),
  getCustomModels: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => ({})),
}));
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: vi.fn(async () => ({})),
}));

const { buildModelsList } = await import("@/app/api/v1/models/route.js");

describe("combo entries carry member context limits (W29)", () => {
  it("emits the MINIMUM member window (fallback-safe), alias-resolved", async () => {
    const list = await buildModelsList(["llm"]);
    const combo = list.find((m) => m.id === "mix-combo");
    expect(combo).toBeDefined();
    // ag/claude-opus-4-8 advertises 1M; unknown member floors at default 200k.
    // The combo may only promise the smallest (upstream #89ffac5a).
    expect(combo.context_length).toBe(200000);
  });

  it("expands nested combos cycle-guarded", async () => {
    const { getCombos } = await import("@/lib/localDb");
    getCombos.mockResolvedValueOnce([
      { name: "outer", models: ["mix-combo"] },
      { name: "mix-combo", models: ["ag/claude-opus-4-8", "cx/unknown-model-xyz"] },
    ]);
    const list = await buildModelsList(["llm"]);
    const outer = list.find((m) => m.id === "outer");
    expect(outer?.context_length).toBe(200000);
  });
});
