import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(async () => [
    {
      id: "conn-x", provider: "openai-compatible-chat-x", apiKey: "k",
      isActive: true, providerSpecificData: { baseUrl: "https://x.example/v1", prefix: "xx" },
    },
  ]),
  getCombos: vi.fn(async () => []),
  getCustomModels: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => ({})),
}));
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: vi.fn(async () => ({})),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const { buildModelsList } = await import("@/app/api/v1/models/route.js");

describe("buildModelsList slim-down (M)", () => {
  it("does not bulk-import the upstream catalog for compatible providers without enabled models", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ data: [{ id: "upstream-a" }, { id: "upstream-b" }] }),
    }));
    const list = await buildModelsList(["llm"]);
    expect(list.some((m) => String(m.id).includes("upstream-"))).toBe(false);
  });

  it("still surfaces explicitly enabled models", async () => {
    const { getProviderConnections } = await import("@/lib/localDb");
    getProviderConnections.mockResolvedValueOnce([
      {
        id: "conn-y", provider: "openai-compatible-chat-x", apiKey: "k",
        isActive: true,
        providerSpecificData: { baseUrl: "https://x.example/v1", prefix: "xx", enabledModels: ["chosen-one"] },
      },
    ]);
    const list = await buildModelsList(["llm"]);
    expect(list.some((m) => m.id === "xx/chosen-one")).toBe(true);
  });
});
