import codex from "../../open-sse/providers/registry/codex.js";

const ids = () => codex.models.map((m) => m.id);
const byId = (id) => codex.models.find((m) => m.id === id);

describe("codex GPT-6 family catalog", () => {
  it("exposes CLI version 0.159.2", () => {
    expect(codex.transport.cliVersion).toBe("0.159.2");
    expect(codex.transport.headers["User-Agent"]).toContain("0.159.2");
  });

  it.each([
    ["gpt-6.1-sol", "GPT 6.1 Sol", "gpt-6.1-sol"],
    ["gpt-6.1-sol-review", "GPT 6.1 Sol Review", "gpt-6.1-sol"],
    ["gpt-6-sol", "GPT 6 Sol", "gpt-6-sol"],
    ["gpt-6-sol-review", "GPT 6 Sol Review", "gpt-6-sol"],
    ["gpt-6-luna", "GPT 6 Luna", "gpt-6-luna"],
    ["gpt-6-luna-review", "GPT 6 Luna Review", "gpt-6-luna"],
  ])("presents %s", (id, name, upstream) => {
    expect(ids()).toContain(id);
    expect(byId(id).name).toBe(name);
    if (id.endsWith("-review")) {
      expect(byId(id).upstreamModelId).toBe(upstream);
      expect(byId(id).quotaFamily).toBe("review");
    }
  });

  it.each(["gpt-5.4", "gpt-5.4-review", "gpt-5.4-mini", "gpt-5.4-mini-review"])(
    "retires %s from Codex",
    (id) => {
      expect(ids()).not.toContain(id);
    }
  );
});
