import { describe, expect, it } from "vitest";
import { OpenCodeExecutor } from "../../open-sse/executors/opencode.js";
import { OpenCodeZenExecutor } from "../../open-sse/executors/opencode-zen.js";
import { getExecutor } from "../../open-sse/executors/index.js";

describe("OpenCode free v2 tool choice and keyed isolation", () => {
  it("keeps the auto-only quirk for every rejected choice", () => {
    // The registry no longer pins any model to this quirk: the Muse Spark contributor
    // IDs were retired upstream (2026-10-25). Inject the allowlist so the gate itself
    // stays covered for a future model that needs it.
    const executor = new OpenCodeExecutor();
    executor.config = {
      ...executor.config,
      quirks: { forceAutoToolChoiceModels: ["muse-spark-1.3-contributor-free"] },
    };
    for (const tool_choice of ["none", "required", { type: "function", name: "read" }]) {
      const body = { input: "hello", tools: [{ type: "function", name: "read" }], tool_choice };
      const out = executor.transformRequest("muse-spark-1.3-contributor-free(high)", body, true, {});
      expect(out.tool_choice).toBe("auto");
      expect(out.tools.map((tool) => tool.name)).toEqual(["read_client", "read", "shell"]);
    }
  });

  it("does not default chat to none and marks injected tools as placeholders", () => {    const out = new OpenCodeExecutor().transformRequest("big-pickle", {
      messages: [{ role: "user", content: "hello" }],
    }, true, {});
    expect(out.tool_choice).toBeUndefined();
    expect(out.tools.map((tool) => tool.function.name)).toEqual(["read", "shell"]);
    expect(out.messages[0]).toMatchObject({ role: "system" });
    expect(out.messages[0].content).toContain("placeholders");
  });

  it("leaves keyed Zen and Go endpoints and authorization unchanged", () => {
    const zen = new OpenCodeZenExecutor();
    expect(zen.buildUrl("deepseek-v4-pro")).toBe("https://opencode.ai/zen/v1/chat/completions");
    expect(zen.buildUrl("muse-spark-1.3-contributor-free")).toBe("https://opencode.ai/zen/v1/responses");
    expect(zen.buildHeaders({ apiKey: "test-key" }, true, undefined, "deepseek-v4-pro").Authorization).toBe("Bearer test-key");
    const go = getExecutor("opencode-go");
    expect(go.buildUrl("glm-5", true, 0, {})).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(go.buildHeaders({ apiKey: "test-go" }, true).Authorization).toBe("Bearer test-go");
  });
});
