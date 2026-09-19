import { describe, it, expect } from "vitest";
import {
  clampThinkingLevel,
  isKnownThinkingLevel,
  validateThinkingRequest,
} from "../../open-sse/translator/concerns/thinkingUnified.js";

describe("clampThinkingLevel nearest-match", () => {
  it("passes through exact hits", () => {
    expect(clampThinkingLevel("high", ["none", "low", "medium", "high"])).toBe("high");
    expect(clampThinkingLevel("xhigh", ["none", "minimal", "low", "medium", "high", "xhigh"])).toBe("xhigh");
    expect(clampThinkingLevel("max", ["none", "high", "max"])).toBe("max");
  });

  it("steps above-max down to the model max", () => {
    expect(clampThinkingLevel("max", ["none", "low", "medium", "high"])).toBe("high");
    expect(clampThinkingLevel("xhigh", ["none", "high", "max"])).toBe("high");
  });

  it("steps below-min up to the model min", () => {
    expect(clampThinkingLevel("low", ["default", "medium", "high"])).toBe("medium");
    expect(clampThinkingLevel("minimal", ["none", "low", "medium", "high", "max"])).toBe("low");
  });

  it("keeps none/off/minimal distinct", () => {
    expect(clampThinkingLevel("none", ["none", "low", "medium", "high"])).toBe("none");
    expect(clampThinkingLevel("off", ["none", "low", "medium", "high"])).toBe("none"); // equivalent disable spelling
    expect(clampThinkingLevel("minimal", ["none", "minimal", "low", "high"])).toBe("minimal");
  });

  it("maps ultra to max", () => {
    expect(clampThinkingLevel("ultra", ["none", "low", "medium", "high", "max"])).toBe("max");
  });

  it("throws invalid reasoning level for unknown strings", () => {
    expect(() => clampThinkingLevel("turbo", ["low", "medium", "high"])).toThrow(/invalid reasoning level/);
    expect(() => clampThinkingLevel("bogus", [])).toThrow(/invalid reasoning level/);
  });

  it("isKnownThinkingLevel accepts ladder + ultra only", () => {
    for (const l of ["off", "none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]) {
      expect(isKnownThinkingLevel(l)).toBe(true);
    }
    expect(isKnownThinkingLevel("auto")).toBe(false);
    expect(isKnownThinkingLevel("default")).toBe(false);
    expect(isKnownThinkingLevel("turbo")).toBe(false);
    expect(isKnownThinkingLevel("")).toBe(false);
    expect(isKnownThinkingLevel(null)).toBe(false);
  });
});

describe("validateThinkingRequest", () => {
  it("accepts clean bodies", () => {
    expect(validateThinkingRequest({ model: "x", messages: [] }, "prov/m")).toBeNull();
    expect(validateThinkingRequest({ reasoning_effort: "high" }, "prov/m")).toBeNull();
    expect(validateThinkingRequest({ reasoning_effort: "auto" }, "prov/m")).toBeNull();
    expect(validateThinkingRequest({ reasoning: { effort: "xhigh" } }, "prov/m")).toBeNull();
    expect(validateThinkingRequest(null, "prov/m")).toBeNull();
  });

  it("rejects unknown level fields with invalid reasoning level", () => {
    expect(validateThinkingRequest({ reasoning_effort: "turbo" }, "prov/m")).toMatch(/invalid reasoning level/);
    expect(validateThinkingRequest({ reasoning: { effort: "warp9" } }, "prov/m")).toMatch(/invalid reasoning level/);
    expect(validateThinkingRequest({ output_config: { effort: "plz" } }, "prov/m")).toMatch(/invalid reasoning level/);
    expect(validateThinkingRequest({ thinkingConfig: { thinkingLevel: "ultra-hd" } }, "prov/m")).toMatch(/invalid reasoning level/);
  });

  it("rejects unknown model suffix levels", () => {
    expect(validateThinkingRequest({}, "prov/model(turbo)")).toMatch(/invalid reasoning level/);
    expect(validateThinkingRequest({}, "prov/model(high)")).toBeNull();
    expect(validateThinkingRequest({}, "prov/model(auto)")).toBeNull();
    expect(validateThinkingRequest({}, "prov/model(8192)")).toBeNull();
  });
});
