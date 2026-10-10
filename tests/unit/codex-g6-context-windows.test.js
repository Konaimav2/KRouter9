import { describe, expect, it } from "vitest";
import {
  aggregateComboCapabilities,
  getCapabilitiesForModel,
} from "../../open-sse/providers/capabilities.js";

// Real upstream context windows for the GPT-6 family are 1.05M
// (web-verified: DevDay + llm-stats for 6.1-sol/Luna/Astra).
const REAL_WINDOW = 1050000;
const REAL_OUTPUT = 128000;

describe("GPT-6 family real context windows (1.05M)", () => {
  it.each(["gpt-6.1-sol", "gpt-6.1-sol-review"])(
    "reports codex %s with the real 1.05M window",
    (id) => {
      expect(getCapabilitiesForModel("codex", id)).toMatchObject({
        contextWindow: REAL_WINDOW,
        maxOutput: REAL_OUTPUT,
      });
    }
  );

  it.each([
    "gpt-6-sol",
    "gpt-6-sol-review",
    "gpt-6-luna",
    "gpt-6-luna-review",
    "gpt-6-astra",
  ])("reports codex %s with the real 1.05M window", (id) => {
    expect(getCapabilitiesForModel("codex", id)).toMatchObject({
      contextWindow: REAL_WINDOW,
      maxOutput: REAL_OUTPUT,
    });
  });

  it.each(["gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-6-astra"])(
    "resolves canonical bare id %s to 1.05M on custom-node seats",
    (id) => {
      for (const seat of ["grip", "cx", "ohh", "ag"]) {
        expect(getCapabilitiesForModel(seat, id).contextWindow).toBe(REAL_WINDOW);
      }
    }
  );

  it("keeps the generic *gpt-6* 272k floor for unknown members", () => {
    expect(getCapabilitiesForModel("grip", "gpt-6-unknown-xyz").contextWindow).toBe(272000);
  });

  it("combo-style MIN over [cx,ohh,ag,grip] seats of gpt-6.1-sol is >= 1000k", () => {
    const seats = ["cx/gpt-6.1-sol", "ohh/gpt-6.1-sol", "ag/gpt-6.1-sol", "grip/gpt-6.1-sol"];
    const agg = aggregateComboCapabilities(seats);
    expect(agg.contextWindow).toBeGreaterThanOrEqual(1000000);
  });
});
