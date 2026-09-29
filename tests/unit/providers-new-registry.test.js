import { describe, expect, it } from "vitest";

import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDERS, PROVIDER_MODELS } from "../../open-sse/providers/index.js";

const EXPECTED = [
  { id: "agentrouter", alias: "agentrouter", urlFrag: "agentrouter.org/v1" },
  { id: "bai-api", alias: "bai-api", urlFrag: "api.b.ai/v1" },
  { id: "tokenharbor", alias: "tokenharbor", urlFrag: "tokenharbor.ai/v1" },
];

describe("new providers registry wiring (agentrouter/bai-api/tokenharbor)", () => {
  it("resolves all three ids in the registry index", () => {
    for (const { id } of EXPECTED) {
      expect(REGISTRY.find((e) => e.id === id), `missing registry id ${id}`).toBeDefined();
    }
  });

  it("exposes id/alias/transport for each new provider", () => {
    for (const { id, alias, urlFrag } of EXPECTED) {
      const entry = REGISTRY.find((e) => e.id === id);
      expect(entry.alias).toBe(alias);
      expect(entry.transport.baseUrl).toContain(urlFrag);
      expect(entry.transport.validateUrl).toContain(urlFrag);
    }
  });

  it("builds into runtime PROVIDERS with openai format default", () => {
    for (const { id, urlFrag } of EXPECTED) {
      expect(PROVIDERS[id], `missing PROVIDERS[${id}]`).toBeDefined();
      expect(PROVIDERS[id].baseUrl).toContain(urlFrag);
      expect(PROVIDERS[id].format).toBe("openai");
    }
  });

  it("exposes passthrough providerModels entries (dynamic/live catalog path)", () => {
    for (const { alias } of EXPECTED) {
      expect(PROVIDER_MODELS[alias]).toBeDefined();
      expect(Array.isArray(PROVIDER_MODELS[alias])).toBe(true);
    }
  });

  it("new entries introduce no id/alias/aliases collisions", () => {
    // Scoped to the 3 new entries: pre-existing registry collisions (if any)
    // are upstream drift, not this change — assert OUR tokens are unique.
    const rest = new Set();
    for (const e of REGISTRY) {
      if (EXPECTED.some((x) => x.id === e.id)) continue;
      for (const k of [e.id, e.alias, ...(e.aliases || [])].filter(Boolean)) rest.add(k);
    }
    for (const { id } of EXPECTED) {
      const entry = REGISTRY.find((e) => e.id === id);
      for (const k of [...new Set([entry.id, entry.alias, ...(entry.aliases || [])].filter(Boolean))]) {
        expect(rest.has(k), `new token "${k}" collides with an existing entry`).toBe(false);
      }
    }
  });

  it("keeps index length consistent (119 baseline + 3 new = 122)", () => {
    expect(REGISTRY.length).toBe(122);
  });
});
