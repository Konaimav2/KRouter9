import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";
import { AI_PROVIDERS, getProvidersByKind } from "@/shared/constants/providers.js";

describe("Jina Reader Free no-auth web-fetch provider", () => {
  const entry = REGISTRY.find((e) => e.id === "jina-reader-free");

  it("resolves in the registry index as a no-auth webFetch entry", () => {
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      category: "freeTier",
      authType: "none",
      noAuth: true,
      serviceKinds: ["webFetch"],
    });
    expect(entry.alias).toBe("jina-reader-free");
    expect(entry.fetchConfig).toMatchObject({
      baseUrl: "https://r.jina.ai",
      method: "GET",
      authType: "none",
      authHeader: "none",
      costPerQuery: 0,
      formats: ["markdown", "text", "html"],
    });
  });

  it("carries no models list (provider IS the model, like searxng/jina-reader)", () => {
    expect(entry).not.toHaveProperty("models");
    for (const id of ["searxng", "jina-reader", "exa", "tavily"]) {
      expect(REGISTRY.find((e) => e.id === id), `sibling ${id} gained models?`).not.toHaveProperty("models");
    }
  });

  it("builds into PROVIDER_MEDIA and the UI layer with the no-auth flag intact", () => {
    expect(PROVIDER_MEDIA["jina-reader-free"]?.fetchConfig?.baseUrl).toBe("https://r.jina.ai");
    expect(AI_PROVIDERS["jina-reader-free"]?.fetchConfig).toEqual(entry.fetchConfig);
    expect(AI_PROVIDERS["jina-reader-free"]?.noAuth).toBe(true);
    expect(getProvidersByKind("webFetch").map((p) => p.id)).toContain("jina-reader-free");
  });

  it("introduces no id/alias collisions (node-prefix safe)", () => {
    const rest = new Set();
    for (const e of REGISTRY) {
      if (e.id === "jina-reader-free") continue;
      for (const k of [e.id, e.alias, ...(e.aliases || [])].filter(Boolean)) rest.add(k);
    }
    for (const k of [entry.id, entry.alias, ...(entry.aliases || [])].filter(Boolean)) {
      expect(rest.has(k), `new token "${k}" collides with an existing entry`).toBe(false);
    }
    const ids = REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
