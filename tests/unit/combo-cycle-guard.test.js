import { describe, it, expect, vi } from "vitest";

// Cycle-guard + log-throttle live in different layers; test both at the unit
// level. The guard itself (visited-set over comboName chain) is exercised via
// getComboModels tail-resolution + a simulated chain walk.
import { getComboModelsFromData } from "../../open-sse/services/combo.js";

const silentLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function chainHasCycle(chain, comboKey) {
  const visited = new Set(
    String(chain || "").split(">").map((s) => s.trim()).filter(Boolean)
  );
  return visited.has(comboKey);
}

describe("combo cycle guard", () => {
  it("tail-resolution exposes the self-reference (papi gpt-5.6-sol case)", () => {
    const combos = [{
      name: "gpt-5.6-sol",
      models: ["cx/gpt-5.6-sol", "ohh/gpt-5.6-sol"],
    }];
    // Member tail resolves back to the combo itself.
    expect(getComboModelsFromData("cx/gpt-5.6-sol", combos)).toBeNull(); // has slash → not a combo
    expect(getComboModelsFromData("gpt-5.6-sol", combos)).toEqual(["cx/gpt-5.6-sol", "ohh/gpt-5.6-sol"]);
    // And the tail of the member re-resolves to the same combo → the cycle.
    const tail = "cx/gpt-5.6-sol".split("/").pop();
    expect(getComboModelsFromData(tail, combos)).not.toBeNull();
  });

  it("chain walk detects revisit", () => {
    expect(chainHasCycle("gpt-5.6-sol", "gpt-5.6-sol")).toBe(true);
    expect(chainHasCycle("outer > gpt-5.6-sol", "gpt-5.6-sol")).toBe(true);
    expect(chainHasCycle("outer", "gpt-5.6-sol")).toBe(false);
    expect(chainHasCycle(null, "gpt-5.6-sol")).toBe(false);
  });

  it("distinguishes qualified vs bare names", () => {
    // Chain stores bare tails; a different combo with similar name must not trip.
    expect(chainHasCycle("gpt-5.6-solx", "gpt-5.6-sol")).toBe(false);
    expect(chainHasCycle("gpt-5.6-sol", "gpt-5.6-solx")).toBe(false);
  });
});

describe("combo attempt log throttle", () => {
  it("caps identical per-model lines at 3 + 1 mute notice", async () => {
    const { handleComboChat } = await import("../../open-sse/services/combo.js");
    const log = { info: vi.fn(), warn: vi.fn() };
    const fail = (status = 502) => new Response(JSON.stringify({ error: { message: "down" } }), { status });
    await handleComboChat({
      body: { model: "x", messages: [] },
      models: ["a/m1", "a/m2", "a/m3", "a/m4", "a/m5"],
      handleSingleModel: async () => fail(),
      log,
      comboName: "throttle-test",
      comboStrategy: "fallback",
      autoSwitch: false,
    });
    const trying = log.info.mock.calls.filter((c) => String(c[1]).startsWith("Trying model"));
    expect(trying.length).toBe(3);
    expect(log.info.mock.calls.some((c) => String(c[1]).includes("muted"))).toBe(true);
    expect(silentLog).toBeDefined();
  });
});
