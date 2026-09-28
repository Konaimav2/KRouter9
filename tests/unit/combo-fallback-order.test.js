import { describe, it, expect } from "vitest";
import { handleComboChat, resetComboRotation } from "open-sse/services/combo.js";

const log = { info() {}, warn() {} };
const err503 = () =>
  new Response(JSON.stringify({ error: { message: "overloaded" } }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
const ok = (model) =>
  new Response(JSON.stringify({ model, ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("combo fallback order (C2c)", () => {
  it("fallback strategy tries member[0] first on fresh state", async () => {
    resetComboRotation("c2c-order");
    const tried = [];
    const res = await handleComboChat({
      body: { messages: [] },
      models: ["cx/gpt-5.6-terra", "cca/gpt-5.6-terra", "ag/claude-sonnet-4-6"],
      handleSingleModel: async (b, m) => {
        tried.push(m);
        return ok(m);
      },
      log,
      comboName: "c2c-order",
      comboStrategy: "fallback",
    });
    expect(res.ok).toBe(true);
    expect(tried).toEqual(["cx/gpt-5.6-terra"]);
  });

  it("advances in dashboard order on fallback-eligible failure and names every tried model", async () => {
    resetComboRotation("c2c-advance");
    const tried = [];
    const res = await handleComboChat({
      body: { messages: [] },
      models: ["cx/gpt-5.6-terra", "cca/gpt-5.6-terra"],
      handleSingleModel: async (b, m) => {
        tried.push(m);
        return err503();
      },
      log,
      comboName: "c2c-advance",
      comboStrategy: "fallback",
    });
    expect(tried).toEqual(["cx/gpt-5.6-terra", "cca/gpt-5.6-terra"]);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.message).toContain("cx/gpt-5.6-terra");
    expect(body.error.message).toContain("cca/gpt-5.6-terra");
  });

  it("advances past a model-scoped 404 (retired model) to the next member", async () => {
    resetComboRotation("c2c-scoped");
    const tried = [];
    const res = await handleComboChat({
      body: { messages: [] },
      models: ["cx/retired-model", "cca/gpt-5.6-terra"],
      handleSingleModel: async (b, m) => {
        tried.push(m);
        if (m === "cx/retired-model") {
          return new Response(JSON.stringify({ error: { message: "model not found: retired-model" } }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        return ok(m);
      },
      log,
      comboName: "c2c-scoped",
      comboStrategy: "fallback",
    });
    expect(tried).toEqual(["cx/retired-model", "cca/gpt-5.6-terra"]);
    expect(res.ok).toBe(true);
  });
});
