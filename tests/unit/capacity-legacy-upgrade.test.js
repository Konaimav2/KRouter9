import { describe, it, expect } from "vitest";
import { getCapacityAdapterConfig } from "../../open-sse/services/capacityAdapter.js";

describe("capacity adapter legacy mimo upgrade (upstream 1a027131)", () => {
  it("upgrades oc/mimo-v2.5-free to v2.6-flash-free in pools", () => {
    const settings = {
      capacityAdapter: { vision: { enabled: true, models: ["oc/mimo-v2.5-free", "mmf/mimo-auto"] } },
    };
    const cfg = getCapacityAdapterConfig("vision", settings);
    expect(cfg.models).toContain("oc/mimo-v2.6-flash-free");
    expect(cfg.models).not.toContain("oc/mimo-v2.5-free");
    expect(cfg.models).toContain("mmf/mimo-auto");
  });

  it("falls back to v2.6-flash-free on empty pools", () => {
    const cfg = getCapacityAdapterConfig("vision", { capacityAdapter: { vision: { enabled: true, models: [] } } });
    expect(cfg.models).toEqual(["oc/mimo-v2.6-flash-free"]);
  });
});
