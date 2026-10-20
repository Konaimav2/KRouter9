import { expect, it } from "vitest";
import { getModelsByProviderId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getPricingForModel } from "../../open-sse/providers/pricing.js";
import { prepareClaudeRequest } from "../../open-sse/translator/formats/claude.js";
import { translateRequest } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";
import "../translator/registerAll.js";
it("registers adaptive 1M/128k Sonnet", () => {
  expect(getModelsByProviderId("claude").map(m => m.id)).toContain("claude-sonnet-5-5");
  expect(getCapabilitiesForModel("claude", "claude-sonnet-5-5")).toMatchObject({ reasoning: true, thinkingFormat: "claude-adaptive", contextWindow: 1000000, maxOutput: 128000 });
});
it.each(["claude-sonnet-5-5", "claude-sonnet-5"])("prices %s", model => {
  expect(getPricingForModel("claude", model)).toEqual({ input: 2, output: 10, cached: 0.2, reasoning: 10, cache_creation: 2.5 });
});
it.each(["max", "xhigh"])("replaces disabled and clamps %s", effort => {
  const out = prepareClaudeRequest({ model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hi" }], thinking: { type: "disabled" }, output_config: { effort }, tool_choice: { type: "tool", name: "run", disable_parallel_tool_use: true } }, "claude");
  expect(out.thinking).toEqual({ type: "between_tools" });
  expect(out.output_config.effort).toBe("high");
  expect(out.tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true });
});
it("preserves older Sonnet and all 5.5 tier prices", () => {
  const out = prepareClaudeRequest({ model: "claude-sonnet-5", thinking: { type: "disabled" }, tool_choice: { type: "any" } }, "claude");
  expect(out.thinking).toEqual({ type: "disabled" });
  expect(out.tool_choice).toEqual({ type: "any" });
  for (const suffix of ["-high", "-medium", "-low", "-thinking"]) {
    expect(getPricingForModel("ag", `claude-sonnet-5-5${suffix}`)).toEqual({ input: 2, output: 10, cached: 0.2, reasoning: 10, cache_creation: 2.5 });
    expect(getCapabilitiesForModel("ag", `claude-sonnet-5-5${suffix}`)).toMatchObject({ thinkingFormat: "claude-adaptive", thinkingOffType: "between_tools", forcedToolChoice: false });
  }
});
it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("normalizes end-to-end from %s", format => {
  const body = format === FORMATS.OPENAI ? { reasoning_effort: "none", tool_choice: "required", tools: [{ type: "function", function: { name: "run", parameters: { type: "object", properties: {} } } }] } : { thinking: { type: "disabled" }, tool_choice: { type: "any" }, tools: [{ name: "run", input_schema: { type: "object", properties: {} } }] };
  const out = translateRequest(format, FORMATS.CLAUDE, "claude-sonnet-5-5", { model: "claude-sonnet-5-5", max_tokens: 1024, messages: [{ role: "user", content: "hi" }], ...body }, true, null, "claude");
  expect(out.thinking).toEqual({ type: "between_tools" });
  expect(out.tool_choice).toEqual({ type: "auto" });
});
