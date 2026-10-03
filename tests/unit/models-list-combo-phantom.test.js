import { describe, it, expect, vi, afterEach } from "vitest";

// F04 RED proof: curated (custom/alias) ids whose bare tail matches a combo
// name are phantom provider entries — top-level `grip/<combo>` resolves via
// the combo path (handleChat getComboModels-first + tail strip in
// src/sse/services/model.js), never the grip connection. The bare combo entry
// already advertises the combo, so the prefixed form must not be emitted.

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => [
    {
      id: "conn-grip-1",
      provider: "openai-compatible-chat-5339f391-012d-4853-ac16-44c3c335b83e",
      apiKey: "k",
      isActive: true,
      name: "1",
      providerSpecificData: { baseUrl: "https://griphubrouter.web.id/v1", prefix: "grip" },
    },
  ]),
  getCombos: vi.fn(async () => [
    { name: "gpt-5.6-terra", models: ["cx/a"] },
    { name: "gpt-5.6-sol", models: ["cx/b"] },
    { name: "deepseek-v4-flash", models: ["cx/c"] },
  ]),
  getCustomModels: vi.fn(async () => [
    { providerAlias: "grip", id: "deepseek-v4-pro", type: "llm", name: "DeepSeek V4 Pro" },
    { providerAlias: "grip", id: "gpt-5.6-terra", type: "llm", name: "GPT 5.6 Terra" },
    { providerAlias: "grip", id: "gpt-5.6-sol", type: "llm", name: "GPT 5.6 Sol" },
    { providerAlias: "grip", id: "deepseek-v4-flash", type: "llm", name: "DeepSeek V4 Flash" },
  ]),
  getModelAliases: vi.fn(async () => ({})),
}));
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: vi.fn(async () => ({})),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const { buildModelsList } = await import("@/app/api/v1/models/route.js");

describe("buildModelsList phantom prefixed-combo guard (F04)", () => {
  it("lists the legit curated model but not combo-tailed phantoms", async () => {
    const list = await buildModelsList(["llm"]);
    const ids = list.map((m) => m.id);
    expect(ids).toContain("grip/deepseek-v4-pro");
    expect(ids).toContain("gpt-5.6-terra");
    expect(ids).toContain("gpt-5.6-sol");
    expect(ids).toContain("deepseek-v4-flash");
    expect(ids).not.toContain("grip/gpt-5.6-terra");
    expect(ids).not.toContain("grip/gpt-5.6-sol");
    expect(ids).not.toContain("grip/deepseek-v4-flash");
  });

  it("still surfaces node-id-keyed curated rows that are not combos", async () => {
    const { getCustomModels } = await import("@/lib/localDb");
    getCustomModels.mockResolvedValueOnce([
      {
        providerAlias: "openai-compatible-chat-5339f391-012d-4853-ac16-44c3c335b83e",
        id: "real-upstream-model",
        type: "llm",
        name: "Real",
      },
    ]);
    const list = await buildModelsList(["llm"]);
    expect(list.map((m) => m.id)).toContain("grip/real-upstream-model");
  });

  it("does not hide a curated id when its combo is gone", async () => {
    const { getCombos, getCustomModels } = await import("@/lib/localDb");
    getCombos.mockResolvedValueOnce([]);
    getCustomModels.mockResolvedValueOnce([
      { providerAlias: "grip", id: "gpt-5.6-sol", type: "llm", name: "GPT 5.6 Sol" },
    ]);
    const list = await buildModelsList(["llm"]);
    expect(list.map((m) => m.id)).toContain("grip/gpt-5.6-sol");
  });

  it("drops alias-backed ids whose tail matches a combo", async () => {
    const { getCustomModels, getModelAliases } = await import("@/lib/localDb");
    getCustomModels.mockResolvedValueOnce([]);
    getModelAliases.mockResolvedValueOnce({ "my-alias": "grip/gpt-5.6-sol" });
    const list = await buildModelsList(["llm"]);
    expect(list.map((m) => m.id)).not.toContain("grip/gpt-5.6-sol");
  });
});
