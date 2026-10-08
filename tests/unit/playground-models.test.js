import { describe, it, expect } from "vitest";
import { AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers";
import {
  requestPrefixFor,
  getProviderGroupLabel,
  normalizeStaticModel,
  dedupeModels,
} from "../../src/shared/utils/playgroundModels.js";

const nativeConn = { provider: "codex", name: "Codex" };
const compatConn = {
  provider: "openai-compatible-uuid-1",
  name: "FakeUp",
  providerSpecificData: { prefix: "fake" },
};

describe("playground model normalization", () => {
  it("static models are fully qualified", () => {
    const alias = getProviderAlias("openai");
    const m = normalizeStaticModel({ id: "gpt-4o", name: "GPT-4o" }, { provider: "openai", name: "OpenAI" });
    expect(m.requestModel).toBe(`${alias}/gpt-4o`);
  });

  it("dedupes duplicate static rows after normalization", () => {
    const a = normalizeStaticModel({ id: "gpt-4o" }, { provider: "openai", name: "o" });
    const b = normalizeStaticModel({ id: "gpt-4o" }, { provider: "openai", name: "o" });
    expect(dedupeModels([a, b])).toEqual([a]);
  });

  it("returns null on empty static ids", () => {
    expect(normalizeStaticModel({}, nativeConn)).toBeNull();
  });
});

describe("playground group labels are per-provider, never per-key (U1)", () => {
  it("compatible group shows the node name, not the key name", () => {
    const conn = {
      provider: "openai-compatible-uuid-1",
      name: "My Secret Key Name",
      providerSpecificData: { prefix: "fake", nodeName: "FakeUp Node" },
    };
    expect(getProviderGroupLabel(conn, conn.provider)).toBe("FakeUp Node");
  });
  it("compatible group falls back to prefix when node name absent", () => {
    expect(getProviderGroupLabel(compatConn, compatConn.provider)).toBe("fake");
  });
  it("built-in group shows the registry display name, not the key name", () => {
    const conn = { provider: "openai", name: "Prod Key 1" };
    expect(getProviderGroupLabel(conn, "openai")).toBe(AI_PROVIDERS.openai.name);
    expect(getProviderGroupLabel(conn, "openai")).not.toContain("Prod Key");
  });
});
