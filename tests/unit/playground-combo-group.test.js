import { describe, it, expect } from "vitest";
import { buildComboGroup } from "@/shared/utils/playgroundModels.js";

describe("buildComboGroup (T2 combo listing)", () => {
  it("builds a Combos group with bare-name requestModels", () => {
    const group = buildComboGroup([
      { name: "gpt-5.6-terra", models: ["cx/a", "cca/b"] },
      { name: "hermes-test", models: ["ag/c"] },
    ]);
    expect(group).not.toBeNull();
    expect(group.providerId).toBe("combo");
    expect(group.models.map((m) => m.requestModel)).toEqual(["gpt-5.6-terra", "hermes-test"]);
    expect(group.models.map((m) => m.id)).toEqual(["gpt-5.6-terra", "hermes-test"]);
    expect(group.models.every((m) => m.providerName === group.providerName)).toBe(true);
  });

  it("returns null for empty input (group filtered downstream)", () => {
    expect(buildComboGroup([])).toBeNull();
    expect(buildComboGroup(null)).toBeNull();
  });

  it("skips nameless entries", () => {
    const group = buildComboGroup([{ models: [] }, { name: "ok", models: [] }]);
    expect(group.models.map((m) => m.id)).toEqual(["ok"]);
  });
});
