import { describe, it, expect } from "vitest";
import {
  selectConnectionCuratedIds,
  normalizeCuratedModel,
  isComboShadowed,
} from "../../src/shared/utils/playgroundModels.js";

// F04: picker must render the same per-connection curated source /v1/models
// uses (custom store + legacy aliases, triple-alias predicate), minus
// combo-shadowed ids that can never route to the provider.

const conn = {
  provider: "openai-compatible-chat-5339f391-012d-4853-ac16-44c3c335b83e",
  name: "1",
  providerSpecificData: {
    baseUrl: "https://griphubrouter.web.id/v1",
    prefix: "grip",
    nodeName: "GripHub",
  },
};

describe("isComboShadowed (F04)", () => {
  const names = new Set(["gpt-5.6-sol", "deepseek-v4-flash"]);
  it("flags bare combo ids", () => {
    expect(isComboShadowed("gpt-5.6-sol", names)).toBe(true);
  });
  it("flags prefixed combo tails", () => {
    expect(isComboShadowed("grip/gpt-5.6-sol", names)).toBe(true);
  });
  it("passes legit ids", () => {
    expect(isComboShadowed("grip/deepseek-v4-pro", names)).toBe(false);
  });
  it("passes everything when no combos", () => {
    expect(isComboShadowed("grip/gpt-5.6-sol", new Set())).toBe(false);
  });
});

describe("selectConnectionCuratedIds (F04 single-source)", () => {
  it("matches prefix-keyed and node-id-keyed customs plus grip aliases", () => {
    const { ids, outputAlias } = selectConnectionCuratedIds(
      [
        { providerAlias: "grip", id: "deepseek-v4-pro", type: "llm" },
        { providerAlias: conn.provider, id: "node-keyed", type: "llm" },
        { providerAlias: "other", id: "nope", type: "llm" },
        { providerAlias: "grip", id: "img-x", type: "image" },
      ],
      { "my-alias": "grip/aliased-model", elsewhere: "or/other" },
      conn
    );
    expect(outputAlias).toBe("grip");
    expect(ids.map((e) => e.id).sort()).toEqual([
      "aliased-model",
      "deepseek-v4-pro",
      "node-keyed",
    ]);
  });
});

describe("normalizeCuratedModel (F04)", () => {
  it("emits fully-qualified grip ids", () => {
    const m = normalizeCuratedModel(
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", source: "custom" },
      conn,
      "grip"
    );
    expect(m.id).toBe("grip/deepseek-v4-pro");
    expect(m.requestModel).toBe("grip/deepseek-v4-pro");
    expect(m.providerId).toBe(conn.provider);
    expect(m.source).toBe("custom");
  });
});
