import { describe, it, expect } from "vitest";
import {
  augmentModelsWithCapacityAdapter,
  getCapacityAdapterModels,
} from "../../open-sse/services/capacityAdapter.js";

const VISION = new Set(["vision"]);
const TARGET = ["cmc/deepseek/deepseek-v4-pro"]; // no vision

describe("capacity adapter combo pools", () => {
  it("expands a combo pool entry to its members", () => {
    const settings = { capacityAdapter: { vision: { enabled: true, models: ["my-pool"] } } };
    const combos = [{ name: "my-pool", models: ["cmc/moonshotai/Kimi-K3"] }];
    expect(getCapacityAdapterModels(settings, combos)).toEqual(["cmc/moonshotai/Kimi-K3"]);
    expect(augmentModelsWithCapacityAdapter(TARGET, VISION, settings, combos)).toEqual([
      "cmc/moonshotai/Kimi-K3",
      "cmc/deepseek/deepseek-v4-pro",
    ]);
  });

  it("drops combo names when no combo data is passed (legacy behavior)", () => {
    const settings = { capacityAdapter: { vision: { enabled: true, models: ["my-pool"] } } };
    expect(augmentModelsWithCapacityAdapter(TARGET, VISION, settings)).toEqual(TARGET);
  });

  it("filters out combo members that lack the capability", () => {
    const settings = { capacityAdapter: { vision: { enabled: true, models: ["mixed-combo"] } } };
    const combos = [{ name: "mixed-combo", models: ["cmc/deepseek/deepseek-v4-pro"] }];
    expect(augmentModelsWithCapacityAdapter(TARGET, VISION, settings, combos)).toEqual(TARGET);
  });

  it("dedupes expanded members already in the target list", () => {
    const settings = {
      capacityAdapter: { vision: { enabled: true, models: ["dup-combo", "cmc/moonshotai/Kimi-K3"] } },
    };
    const combos = [{ name: "dup-combo", models: ["cmc/moonshotai/Kimi-K3"] }];
    expect(getCapacityAdapterModels(settings, combos)).toEqual(["cmc/moonshotai/Kimi-K3"]);
  });
});
