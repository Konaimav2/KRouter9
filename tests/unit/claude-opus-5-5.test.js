import { expect, it } from "vitest";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import "../translator/registerAll.js";
it("registers Opus 5.5", () => expect(getModelsByProviderId("claude").map(m => m.id)).toContain("claude-opus-5-5"));
it.each(["", "-high", "-medium", "-low", "-thinking"])("has always-on capabilities and prices %s", suffix => {
  const model = `claude-opus-5-5${suffix}`;
  expect(getCapabilitiesForModel("claude", model)).toMatchObject({ reasoning: true, thinkingFormat: "claude-adaptive", thinkingCanDisable: false, forcedToolChoice: false, contextWindow: 1000000, maxOutput: 128000 });
  expect(getThinkingLevels("claude", model)).not.toContain("none");
  expect(getPricingForModel("claude", model)).toEqual({ input: 4, output: 20, cached: 0.2, reasoning: 20, cache_creation: 5 });
});
it("clamps none to low without a thinking switch", () => {
  const body = applyThinking("claude", "claude-opus-5-5", { reasoning_effort: "none" }, "claude");
  expect(body.thinking).toBeUndefined();
  expect(body.output_config).toEqual({ effort: "low" });
});
it("preserves local implicit-auto semantics", () => {
  const body = applyThinking("claude", "claude-opus-5-5", { thinking: { type: "adaptive" } }, "claude");
  expect(body.thinking).toBeUndefined();
  expect(body.output_config).toBeUndefined();
});
it("normalizes OpenAI end-to-end", () => {
  const out = translateRequest(FORMATS.OPENAI, FORMATS.CLAUDE, "claude-opus-5-5", { model: "claude-opus-5-5", reasoning_effort: "none", tool_choice: "required", tools: [{ type: "function", function: { name: "run", parameters: { type: "object", properties: {} } } }], messages: [{ role: "user", content: "hi" }] }, true, null, "claude");
  expect(out.thinking).toBeUndefined();
  expect(out.output_config).toEqual({ effort: "low" });
  expect(out.tool_choice.type).toBe("auto");
});
