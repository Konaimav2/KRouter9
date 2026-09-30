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

describe("combo entries carry max-member context limits (W29)", () => {
  it("emits context_length on combos", async () => {
    const list = await buildModelsList(["llm"]);
    const combo = list.find((m) => m.id === "mix-combo");
    expect(combo).toBeDefined();
    expect(Number.isFinite(combo.context_length)).toBe(true);
    expect(combo.context_length).toBeGreaterThan(0);
  });
});
