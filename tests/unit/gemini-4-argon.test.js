import { expect, it } from "vitest";
import { getModelsByProviderId, getModelUpstreamId } from "../../open-sse/config/providerModels.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";
import { getThinkingLevels } from "../../open-sse/providers/thinkingLevels.js";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";

it.each(["gemini", "vertex", "antigravity"])("registers Argon on %s", provider => {
  const model = provider === "antigravity" ? "gemini-4-argon-high" : "gemini-4-argon";
  expect(getModelsByProviderId(provider).map(m => m.id)).toContain(model);
  expect(getCapabilitiesForModel(provider, model)).toMatchObject({ reasoning: true, thinkingFormat: "gemini-level", thinkingCanDisable: false, contextWindow: 1048576, maxOutput: 65536 });
  expect(getThinkingLevels(provider, model)).toEqual(["low", "medium", "high"]);
});
it.each([[{ reasoning_effort: "none" }, "low"], [{ thinking: { type: "enabled", budget_tokens: 512 } }, "low"], [{ reasoning_effort: "high" }, "high"]])("clamps Argon thinking %j", (body, level) => {
  applyThinking("gemini", "gemini-4-argon", body, "vertex");
  expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: level, includeThoughts: true });
});
it("preserves Gemini 3 minimal and maps Argon tier", () => {
  const body = { reasoning_effort: "none" };
  applyThinking("gemini", "gemini-3.8-flash", body, "gemini");
  expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal", includeThoughts: false });
  expect(getModelUpstreamId("ag", "gemini-4-argon-high")).toBe("gemini-4-argon-high(high)");
});
it("preserves the high tier in the Antigravity wire envelope", () => {
  const upstream = getModelUpstreamId("ag", "gemini-4-argon-high");
  const body = { model: "gemini-4-argon-high", request: { contents: [{ role: "user", parts: [{ text: "hi" }] }], generationConfig: {} } };
  applyThinking("antigravity", upstream, body, "antigravity");
  const out = new AntigravityExecutor().transformRequest("gemini-4-argon-high", body, true, { projectId: "project", connectionId: "connection" });
  expect(out.model).toBe("gemini-4-argon-high");
  expect(out.request.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "high", includeThoughts: true });
});
