import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ db: null }));
const PROVIDER = "openai-compatible-chat-x1-context";
const ALIAS = "x1p";
const MODEL_ID = "x1-opaque-context-probe";
const DECLARED_CONTEXT = 480000;

// Only the adapter boundary is replaced: the real repository SQL/JSON and both
// route handlers run against a disposable in-memory KV table, never a user DB.
vi.mock("@/lib/db/driver.js", () => ({
  getAdapter: async () => fixture.db,
}));
vi.mock("@/models", async () => {
  const repo = await import("@/lib/db/repos/aliasRepo.js");
  return {
    addCustomModel: repo.addCustomModel,
    getCustomModels: repo.getCustomModels,
    deleteCustomModel: repo.deleteCustomModel,
  };
});
vi.mock("@/lib/localDb", async () => {
  const repo = await import("@/lib/db/repos/aliasRepo.js");
  return {
    getProviderConnections: vi.fn(),
    getCombos: async () => [],
    getCustomModels: repo.getCustomModels,
    getModelAliases: async () => ({}),
  };
});
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: async () => ({}),
}));

const repo = await import("@/lib/db/repos/aliasRepo.js");
const { getProviderConnections } = await import("@/lib/localDb");
const { POST, GET: getCustomModelsResponse } = await import("@/app/api/models/custom/route.js");
const { GET: getModelsResponse } = await import("@/app/api/v1/models/route.js");
const { getCapabilitiesForModel } = await import("open-sse/providers/capabilities.js");

function requestFor(fields = {}) {
  return new Request("http://x1.invalid/api/models/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerAlias: ALIAS, id: MODEL_ID, ...fields }),
  });
}

async function publishedModel(id = MODEL_ID) {
  const response = await getModelsResponse();
  expect(response.status).toBe(200);
  return (await response.json()).data.find((model) => model.id === `${ALIAS}/${id}`);
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE kv (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY(scope, key))");
  fixture.db = {
    get: (sql, params = []) => sqlite.prepare(sql).get(...params),
    all: (sql, params = []) => sqlite.prepare(sql).all(...params),
    run: (sql, params = []) => sqlite.prepare(sql).run(...params),
    transaction: (fn) => {
      sqlite.exec("BEGIN");
      try {
        fn();
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
  getProviderConnections.mockResolvedValue([{
    id: "x1-synthetic-connection",
    provider: PROVIDER,
    isActive: true,
    providerSpecificData: { prefix: ALIAS },
  }]);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("X1 tests forbid network access"); }));
});

afterEach(() => {
  fixture.db.close();
  fixture.db = null;
  vi.unstubAllGlobals();
});

describe("X1 custom context publication", () => {
  it("publishes the configured 480000 context instead of the unknown-ID 200000 floor", async () => {
    expect(getCapabilitiesForModel(PROVIDER, MODEL_ID).contextWindow).toBe(200000);
    const response = await POST(requestFor({ contextWindow: DECLARED_CONTEXT }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, added: true });

    const model = await publishedModel();
    expect(model.context_length).toBe(DECLARED_CONTEXT);
    expect(model.capabilities.contextWindow).toBe(DECLARED_CONTEXT);
    const customResponse = await getCustomModelsResponse();
    expect((await customResponse.json()).models[0].contextWindow).toBe(DECLARED_CONTEXT);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("persists a numeric declaration in the real repository insert branch", async () => {
    expect(await repo.addCustomModel({ providerAlias: ALIAS, id: MODEL_ID, contextWindow: DECLARED_CONTEXT })).toBe(true);
    expect(await repo.getCustomModels()).toEqual([{
      providerAlias: ALIAS, id: MODEL_ID, type: "llm", name: MODEL_ID, contextWindow: DECLARED_CONTEXT,
    }]);
  });

  it("updates the same KV row and preserves context/name/caps when omitted", async () => {
    await repo.addCustomModel({ providerAlias: ALIAS, id: MODEL_ID, name: "Synthetic", caps: { vision: true }, contextWindow: 320000 });
    expect(await repo.addCustomModel({ providerAlias: ALIAS, id: MODEL_ID, contextWindow: DECLARED_CONTEXT })).toBe(false);
    await repo.addCustomModel({ providerAlias: ALIAS, id: MODEL_ID });
    expect(await repo.getCustomModels()).toEqual([{
      providerAlias: ALIAS, id: MODEL_ID, type: "llm", name: "Synthetic", caps: { vision: true }, contextWindow: DECLARED_CONTEXT,
    }]);
    expect((await publishedModel()).context_length).toBe(DECLARED_CONTEXT);
  });

  it.each([[0], [-1], [null], ["480000"], [""], [true], [[]], [{}]])("rejects invalid API context declaration %j without storing a model", async (contextWindow) => {
    const response = await POST(requestFor({ contextWindow }));
    expect(response.status).toBe(400);
    expect(await repo.getCustomModels()).toEqual([]);
  });

  it.each(["1e309", "-1e309"])("rejects nonfinite JSON number %s without storing a model", async (number) => {
    const request = new Request("http://x1.invalid/api/models/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"providerAlias":"${ALIAS}","id":"${MODEL_ID}","contextWindow":${number}}`,
    });
    expect((await POST(request)).status).toBe(400);
    expect(await repo.getCustomModels()).toEqual([]);
  });

  it.each([0, -1, NaN, Infinity, -Infinity, null, "480000"])("safely ignores invalid direct repository declaration %s", async (contextWindow) => {
    await repo.addCustomModel({ providerAlias: ALIAS, id: MODEL_ID, contextWindow });
    expect((await repo.getCustomModels())[0]).not.toHaveProperty("contextWindow");
    expect((await publishedModel()).context_length).toBe(200000);
  });

  it("retains legacy models and the allowed boolean caps whitelist", async () => {
    const response = await POST(requestFor({ caps: { vision: true, reasoning: false, tools: false, contextWindow: 999999, unknown: true } }));
    expect(response.status).toBe(200);
    expect((await repo.getCustomModels())[0]).toEqual({
      providerAlias: ALIAS, id: MODEL_ID, type: "llm", name: MODEL_ID,
      caps: { vision: true, reasoning: false },
    });
    expect(await publishedModel()).toMatchObject({
      context_length: 200000,
      max_completion_tokens: 64000,
      capabilities: { vision: true, reasoning: false, tools: true, contextWindow: 200000 },
    });
  });

  it("reuses existing canonical exact IDs without raising unknown GPT-6 variants", async () => {
    for (const id of ["gpt-6.1-sol", "gpt-6-unknown-xyz", MODEL_ID]) {
      expect((await POST(requestFor({ id }))).status).toBe(200);
    }
    expect((await publishedModel("gpt-6.1-sol")).context_length).toBe(1050000);
    expect((await publishedModel("gpt-6-unknown-xyz")).context_length).toBe(272000);
    expect((await publishedModel()).context_length).toBe(200000);
  });

  it("keeps existing stored context_length metadata readable", async () => {
    fixture.db.run("INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)", [
      `${ALIAS}|${MODEL_ID}|llm`,
      JSON.stringify({ providerAlias: ALIAS, id: MODEL_ID, type: "llm", context_length: 320000 }),
    ]);
    expect((await publishedModel()).context_length).toBe(320000);
  });

  it("retains resolved canonical features when a numeric context is configured", async () => {
    expect((await POST(requestFor({ id: "gpt-6.1-sol", contextWindow: DECLARED_CONTEXT }))).status).toBe(200);
    expect(await publishedModel("gpt-6.1-sol")).toMatchObject({
      context_length: DECLARED_CONTEXT,
      max_completion_tokens: 128000,
      capabilities: { contextWindow: DECLARED_CONTEXT, vision: true, reasoning: true, search: true },
    });
  });

  it("does not clear a stored declaration on invalid or omitted updates", async () => {
    await POST(requestFor({ contextWindow: DECLARED_CONTEXT }));
    expect((await POST(requestFor({ contextWindow: 0 }))).status).toBe(400);
    await repo.addCustomModel({ providerAlias: ALIAS, id: MODEL_ID, contextWindow: Infinity });
    expect((await POST(requestFor({ name: "Renamed", caps: { reasoning: true } }))).status).toBe(200);
    expect((await repo.getCustomModels())[0]).toMatchObject({
      name: "Renamed", caps: { reasoning: true }, contextWindow: DECLARED_CONTEXT,
    });
    expect((await publishedModel()).context_length).toBe(DECLARED_CONTEXT);
  });
});
