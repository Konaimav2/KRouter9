import { describe, it, expect, vi } from "vitest";
import { handleComboChat } from "../../open-sse/services/combo.js";

const log = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} };

// Wave C: a combo swap must be announced (warn) and the terminal error must
// name every tried model — never a silent stop or an empty message.
describe("combo swap announce + tried-models error", () => {
  it("names every tried model in the terminal error", async () => {
    const warnings = [];
    const spyLog = { ...log, warn: (...a) => warnings.push(a.join(" ")) };
    const handleSingleModel = vi.fn(async (b, m) =>
      new Response(JSON.stringify({ error: { message: `${m} is down` } }), { status: 500 })
    );
    const res = await handleComboChat({
      body: { messages: [] },
      models: ["prov/a", "prov/b"],
      handleSingleModel,
      log: spyLog,
      comboName: "test-combo",
      comboStrategy: "fallback",
    });
    expect(res.ok).toBe(false);
    const body = await res.json();
    expect(body.error.message).toContain("prov/a");
    expect(body.error.message).toContain("prov/b");
    expect(body.error.message).toContain("tried:");
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(handleSingleModel).toHaveBeenCalledTimes(2);
  });

  it("warns on each swap with the combo name", async () => {
    const warnings = [];
    const spyLog = { ...log, warn: (...a) => warnings.push(a.join(" ")) };
    const handleSingleModel = vi.fn(async (b, m) => {
      if (m === "prov/a") {
        return new Response(JSON.stringify({ error: { message: "a is down" } }), { status: 500 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
    });
    const res = await handleComboChat({
      body: { messages: [] },
      models: ["prov/a", "prov/b"],
      handleSingleModel,
      log: spyLog,
      comboName: "test-combo",
      comboStrategy: "fallback",
    });
    expect(res.ok).toBe(true);
    expect(warnings.some((w) => w.includes("test-combo") && w.includes("switching"))).toBe(true);
  });
});
