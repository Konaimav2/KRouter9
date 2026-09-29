import { describe, it, expect } from "vitest";
import { buildComboGroup, filterModelGroups } from "@/shared/utils/playgroundModels.js";

describe("filterModelGroups (W08 picker search)", () => {
  const groups = [
    {
      providerId: "combo", providerName: "Combos", connections: [],
      models: [{ id: "gpt-5.6-terra", requestModel: "gpt-5.6-terra", name: "gpt-5.6-terra" }],
    },
    {
      providerId: "cca", providerName: "CodeCraft", connections: [{}, {}],
      models: [
        { id: "cca/gpt-5.6-terra", requestModel: "cca/gpt-5.6-terra", name: "gpt-5.6-terra" },
        { id: "cca/other", requestModel: "cca/other", name: "Other Model" },
      ],
    },
  ];

  it("returns all groups on empty query", () => {
    expect(filterModelGroups(groups, "")).toHaveLength(2);
    expect(filterModelGroups(groups, "  ")).toHaveLength(2);
  });

  it("matches model name, requestModel, and provider name case-insensitively", () => {
    const byModel = filterModelGroups(groups, "OTHER");
    expect(byModel).toHaveLength(1);
    expect(byModel[0].models.map((m) => m.id)).toEqual(["cca/other"]);
    const byProvider = filterModelGroups(groups, "codecraft");
    expect(byProvider).toHaveLength(1);
    expect(byProvider[0].providerId).toBe("cca");
    const byRequest = filterModelGroups(groups, "cca/gpt");
    expect(byRequest[0].models.map((m) => m.id)).toEqual(["cca/gpt-5.6-terra"]);
  });

  it("drops empty groups and preserves group shape", () => {
    const out = filterModelGroups(groups, "terra");
    expect(out).toHaveLength(2);
    expect(out[0].connections).toEqual([]);
    expect(out[1].models).toHaveLength(1);
    expect(filterModelGroups(groups, "zzz-no-match")).toEqual([]);
  });
});
