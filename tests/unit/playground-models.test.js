import { describe, it, expect } from "vitest";
import { AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers";
import {
  requestPrefixFor,
  getProviderGroupLabel,
  normalizeStaticModel,
  normalizeLiveModel,
  dedupeModels,
} from "../../src/shared/utils/playgroundModels.js";

const nativeConn = { provider: "codex", name: "Codex" };
const compatConn = {
  provider: "openai-compatible-uuid-1",
  name: "FakeUp",
  providerSpecificData: { prefix: "fake" },
};

describe("playground model normalization", () => {
  it("prefixes native models with the alias", () => {
    const alias = getProviderAlias("codex");
    expect(requestPrefixFor(nativeConn)).toBe(alias);
    const m = normalizeLiveModel("gpt-5-codex", nativeConn);
    expect(m.requestModel).toBe(`${alias}/gpt-5-codex`);
  });

  it("prefixes compatible models with the node prefix", () => {
    expect(requestPrefixFor(compatConn)).toBe("fake");
    const m = normalizeLiveModel("glm-4.7", compatConn);
    expect(m.requestModel).toBe("fake/glm-4.7");
  });

  it("re-roots foreign-prefixed ids at this connection", () => {
    const alias = getProviderAlias("openrouter");
    const m = normalizeLiveModel("openai/gpt-4o", { provider: "openrouter", name: "OR" });
    expect(m.requestModel).toBe(`${alias}/gpt-4o`);
  });

  it("keeps canonical alias-prefixed ids", () => {
    const alias = getProviderAlias("codex");
    const m = normalizeLiveModel(`${alias}/gpt-5-codex`, nativeConn);
    expect(m.requestModel).toBe(`${alias}/gpt-5-codex`);
  });

  it("re-roots id-prefixed ids at the alias", () => {
    const alias = getProviderAlias("codex");
    const m = normalizeLiveModel("codex/gpt-5-codex", nativeConn);
    expect(m.requestModel).toBe(`${alias}/gpt-5-codex`);
  });

  it("static models are fully qualified", () => {
    const alias = getProviderAlias("openai");
    const m = normalizeStaticModel({ id: "gpt-4o", name: "GPT-4o" }, { provider: "openai", name: "OpenAI" });
    expect(m.requestModel).toBe(`${alias}/gpt-4o`);
  });

  it("dedupes static/live duplicates after normalization", () => {
    const a = normalizeStaticModel({ id: "gpt-4o" }, { provider: "openai", name: "o" });
    const b = normalizeLiveModel("gpt-4o", { provider: "openai", name: "o" });
    expect(dedupeModels([a, b]).length).toBe(1);
  });

  it("returns null on empty ids", () => {
    expect(normalizeLiveModel("", nativeConn)).toBeNull();
    expect(normalizeLiveModel({}, nativeConn)).toBeNull();
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
