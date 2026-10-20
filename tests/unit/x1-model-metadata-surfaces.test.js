import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ db: null, connections: [], combos: [], liveModels: [], disabled: {}, nextAdapterGate: null, afterModelRead: null }));
const ID = "x1-opaque-context-probe";
const PROVIDER_A = "openai-compatible-chat-x1-a";
const PROVIDER_B = "openai-compatible-chat-x1-b";
const ALIAS_A = "x1a";
const ALIAS_B = "x1b";

vi.mock("@/lib/db/driver.js", () => ({
  getAdapter: async () => {
    const gate = fixture.nextAdapterGate;
    if (gate) {
      fixture.nextAdapterGate = null;
      gate.enter();
      await gate.promise;
    }
    return fixture.db;
  },
}));
vi.mock("@/models", async () => {
  const repo = await import("@/lib/db/repos/aliasRepo.js");
  return repo;
});
vi.mock("@/lib/localDb", async () => {
  const repo = await import("@/lib/db/repos/aliasRepo.js");
  return {
    getProviderConnections: async () => fixture.connections,
    getCombos: async () => fixture.combos,
    getCustomModels: repo.getCustomModels,
    getModelAliases: repo.getModelAliases,
  };
});
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => fixture.disabled }));
vi.mock("open-sse/services/kiroModels.js", () => ({
  resolveKiroModels: async () => ({ models: fixture.liveModels }),
}));
vi.mock("@/lib/codexModels.js", () => ({ resolveCodexCatalog: async () => fixture.liveModels }));

const repo = await import("@/lib/db/repos/aliasRepo.js");
const { POST, GET: customGET } = await import("@/app/api/models/custom/route.js");
const { GET: dashboardGET } = await import("@/app/api/models/route.js");
const { GET: v1GET, buildModelsList } = await import("@/app/api/v1/models/route.js");
const { getDeclaredModelCaps, invalidateDeclaredModelCaps } = await import("open-sse/providers/declaredCaps.js");
const { getCapabilitiesForModel } = await import("open-sse/providers/capabilities.js");
const { PROVIDER_MODELS } = await import("@/shared/constants/models");

function holdNextNodeRead() {
  let resume;
  let enter;
  const gate = {
    promise: new Promise((resolve) => { resume = resolve; }),
    reached: new Promise((resolve) => { enter = resolve; }),
    enter: () => enter(),
    resume: () => resume(),
    rows: null,
  };
  fixture.afterModelRead = (rows) => {
    gate.rows = rows.map((row) => JSON.parse(row.value));
    fixture.nextAdapterGate = gate;
  };
  return gate;
}

function connection(provider, prefix) {
  return { id: `${prefix}-fixture`, provider, isActive: true, providerSpecificData: { prefix } };
}

async function post(providerAlias, fields = {}) {
  return POST(new Request("http://x1.invalid/api/models/custom", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerAlias, id: ID, ...fields }),
  }));
}

async function v1Models() {
  const response = await v1GET();
  expect(response.status).toBe(200);
  return (await response.json()).data;
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE kv (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY(scope, key))");
  sqlite.exec("CREATE TABLE providerNodes (id TEXT PRIMARY KEY, type TEXT, name TEXT, data TEXT, createdAt TEXT, updatedAt TEXT)");
  fixture.db = {
    get: (sql, params = []) => sqlite.prepare(sql).get(...params),
    all: (sql, params = []) => {
      const rows = sqlite.prepare(sql).all(...params);
      if (params[0] === "customModels" && fixture.afterModelRead) {
        const afterRead = fixture.afterModelRead;
        fixture.afterModelRead = null;
        afterRead(rows);
      }
      return rows;
    },
    run: (sql, params = []) => sqlite.prepare(sql).run(...params),
    transaction: (fn) => {
      sqlite.exec("BEGIN");
      try { fn(); sqlite.exec("COMMIT"); }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
    close: () => sqlite.close(),
  };
  fixture.connections = [connection(PROVIDER_A, ALIAS_A), connection(PROVIDER_B, ALIAS_B)];
  fixture.combos = [];
  fixture.liveModels = [];
  fixture.disabled = {};
  fixture.nextAdapterGate = null;
  fixture.afterModelRead = null;
  invalidateDeclaredModelCaps();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("X1 tests forbid network access"); }));
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  invalidateDeclaredModelCaps();
  fixture.db.close();
  fixture.db = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("X1 actual-handler metadata surfaces", () => {
  it("preserves per-provider declarations across custom GET, dashboard, and v1 GET", async () => {
    await post(ALIAS_A, { contextWindow: 480000, caps: { vision: true } });
    await post(ALIAS_B, { contextWindow: 320000, caps: { vision: false } });
    const custom = (await (await customGET()).json()).models;
    expect(custom).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerAlias: ALIAS_A, contextWindow: 480000 }),
      expect.objectContaining({ providerAlias: ALIAS_B, contextWindow: 320000 }),
    ]));
    const dashboard = (await (await dashboardGET()).json()).models;
    for (const [alias, context, vision] of [[ALIAS_A, 480000, true], [ALIAS_B, 320000, false]]) {
      expect(dashboard.find((m) => m.routedModel === `${alias}/${ID}`)?.caps).toMatchObject({ contextWindow: context, vision });
      expect((await v1Models()).find((m) => m.id === `${alias}/${ID}`)).toMatchObject({
        context_length: context, capabilities: { contextWindow: context, vision },
      });
    }
  });

  it("publishes the minimum declared context across nested combo seats", async () => {
    await post(ALIAS_A, { contextWindow: 480000 });
    await post(ALIAS_B, { contextWindow: 320000 });
    fixture.combos = [
      { name: "x1-inner", models: [`${ALIAS_A}/${ID}`, `${ALIAS_B}/${ID}`] },
      { name: "x1-outer", models: ["x1-inner", `${ALIAS_A}/gpt-6.1-sol`] },
    ];
    const list = await v1Models();
    expect(list.find((m) => m.id === "x1-inner").context_length).toBe(320000);
    expect(list.find((m) => m.id === "x1-outer").context_length).toBe(320000);
  });

  it.each([
    { label: "LLM then TTS", order: ["llm", "tts"] },
    { label: "TTS then LLM", order: ["tts", "llm"] },
  ])("S1 R4 preserves typed LLM metadata in no-active publication: $label", async ({ order }) => {
    for (const type of order) {
      expect((await post(ALIAS_A, { type, contextWindow: type === "llm" ? 480000 : 160000 })).status).toBe(200);
    }
    expect((await post(ALIAS_B, { contextWindow: 320000 })).status).toBe(200);
    const stored = (await (await customGET()).json()).models;
    expect(stored.filter((model) => model.providerAlias === ALIAS_A)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "llm", contextWindow: 480000 }),
      expect.objectContaining({ type: "tts", contextWindow: 160000 }),
    ]));
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 480000 });
    expect(await getDeclaredModelCaps(ALIAS_B, ID)).toMatchObject({ contextWindow: 320000 });
    const dashboard = (await (await dashboardGET()).json()).models;
    expect(dashboard.filter((model) => model.routedModel === `${ALIAS_A}/${ID}`)).toHaveLength(1);
    expect(dashboard.find((model) => model.routedModel === `${ALIAS_A}/${ID}`).caps.contextWindow).toBe(480000);
    fixture.connections = [];
    fixture.combos = [
      { name: "x1-r4-primary", models: [`${ALIAS_A}/${ID}`] },
      { name: "x1-r4-mixed", models: [`${ALIAS_A}/${ID}`, `${ALIAS_B}/${ID}`] },
    ];
    const models = await v1Models();
    expect(models.find((model) => model.id === `${ALIAS_A}/${ID}`).context_length).toBe(480000);
    expect(models.find((model) => model.id === "x1-r4-primary").context_length).toBe(480000);
    expect(models.find((model) => model.id === "x1-r4-mixed").context_length).toBe(320000);
    expect(models.find((model) => model.id === `${ALIAS_B}/${ID}`).context_length).toBe(320000);
  });

  it("S1 R4 retains typed TTS declarations in their active kind-specific catalog and combo", async () => {
    await post(ALIAS_A, { type: "tts", contextWindow: 160000 });
    await post(ALIAS_A, { type: "llm", contextWindow: 480000 });
    fixture.connections = [connection("openai", ALIAS_A)];
    fixture.combos = [
      { name: "x1-r4-llm", models: [`${ALIAS_A}/${ID}`] },
      { name: "x1-r4-tts", kind: "tts", models: [`${ALIAS_A}/${ID}`] },
    ];
    const models = await buildModelsList(["tts"]);
    const typed = models.find((model) => model.id === `${ALIAS_A}/${ID}`);
    expect(typed.capabilities.contextWindow).toBe(160000);
    expect(models.find((model) => model.id === "x1-r4-tts").context_length).toBe(160000);
    expect(models.some((model) => model.id === "x1-r4-llm")).toBe(false);
    const llm = await v1Models();
    expect(llm.find((model) => model.id === `${ALIAS_A}/${ID}`).context_length).toBe(480000);
    expect(llm.find((model) => model.id === "x1-r4-llm").context_length).toBe(480000);
  });

  it("keeps unknown combo seats at their existing floor", async () => {
    await post(ALIAS_A, { contextWindow: 480000 });
    fixture.combos = [{ name: "x1-mixed", models: [`${ALIAS_A}/${ID}`, `${ALIAS_B}/x1-undeclared`] }];
    expect((await v1Models()).find((m) => m.id === "x1-mixed").context_length).toBe(200000);
  });

  it("emits supplied context with no active connections but leaves legacy entries unchanged", async () => {
    await post(ALIAS_A, { contextWindow: 480000 });
    await post(ALIAS_B);
    fixture.connections = fixture.connections.map((c) => ({ ...c, isActive: false }));
    const list = await v1Models();
    expect(list.find((m) => m.id === `${ALIAS_A}/${ID}`)).toMatchObject({
      context_length: 480000, capabilities: { contextWindow: 480000 },
    });
    expect(list.find((m) => m.id === `${ALIAS_B}/${ID}`)).toEqual({
      id: `${ALIAS_B}/${ID}`, object: "model", owned_by: ALIAS_B,
    });
  });

  it("keeps legacy context_length metadata consistent on dashboard and v1", async () => {
    fixture.db.run("INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)", [
      `${ALIAS_A}|${ID}|llm`,
      JSON.stringify({ providerAlias: ALIAS_A, id: ID, type: "llm", context_length: 360000 }),
    ]);
    const dashboard = (await (await dashboardGET()).json()).models;
    expect(dashboard.find((m) => m.routedModel === `${ALIAS_A}/${ID}`)?.caps.contextWindow).toBe(360000);
    expect((await v1Models()).find((m) => m.id === `${ALIAS_A}/${ID}`).context_length).toBe(360000);
  });

  it("fills a partial live record from declarations while preserving explicit live limits", async () => {
    fixture.connections = [connection("kiro", "kr")];
    await post("kr", { contextWindow: 480000 });
    fixture.liveModels = [{ id: ID, capabilities: { tools: false } }];
    expect((await v1Models()).find((m) => m.id === `kr/${ID}`)).toMatchObject({
      context_length: 480000, capabilities: { tools: false, contextWindow: 480000 },
    });
    fixture.liveModels = [{ id: ID, capabilities: { tools: false, contextWindow: 260000, maxOutput: 12000 } }];
    expect((await v1Models()).find((m) => m.id === `kr/${ID}`)).toMatchObject({
      context_length: 260000, max_completion_tokens: 12000, capabilities: { tools: false, contextWindow: 260000 },
    });
  });

  it("uses effective live limits in combo minimum publication", async () => {
    fixture.connections = [connection("kiro", "kr")];
    await post("kr", { contextWindow: 480000 });
    fixture.liveModels = [{ id: ID, capabilities: { contextWindow: 260000, maxOutput: 12000 } }];
    fixture.combos = [{ name: "x1-live-combo", models: [`kr/${ID}`, "x1a/gpt-6.1-sol"] }];
    expect((await v1Models()).find((m) => m.id === "x1-live-combo").context_length).toBe(260000);
  });

  it("retains canonical features and maxOutput under partial live metadata", async () => {
    fixture.connections = [connection("kiro", "kr")];
    await post("kr", { id: "gpt-6.1-sol", contextWindow: 480000 });
    fixture.liveModels = [{ id: "gpt-6.1-sol", capabilities: { tools: false } }];
    expect((await v1Models()).find((m) => m.id === "kr/gpt-6.1-sol")).toMatchObject({
      context_length: 480000, max_completion_tokens: 128000,
      capabilities: { vision: true, reasoning: true, search: true, tools: false },
    });
  });

  it("does not let the no-active static entry shadow configured canonical metadata", async () => {
    await post("kiro", { id: "gpt-6.1-sol", contextWindow: 480000 });
    fixture.connections = [];
    const models = (await v1Models()).filter((m) => m.id === "kiro/gpt-6.1-sol");
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ context_length: 480000, capabilities: { contextWindow: 480000, maxOutput: 128000 } });
  });

  it("S1 R2 overlays a numeric declaration on an actual no-active registered static ID", async () => {
    const id = "claude-sonnet-4-6";
    expect(PROVIDER_MODELS.ag.some((model) => model.id === id)).toBe(true);
    expect((await post("ag", { id, contextWindow: 480000, caps: { vision: false } })).status).toBe(200);
    fixture.connections = [];
    const rows = (await v1Models()).filter((model) => model.id === `ag/${id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      context_length: 480000,
      capabilities: { ...getCapabilitiesForModel("antigravity", id), contextWindow: 480000, vision: false },
    });
    expect((await repo.getCustomModels())[0]).toMatchObject({ contextWindow: 480000, caps: { vision: false } });
  });

  it("S1 R2 keeps undeclared and boolean-only registered static rows minimal", async () => {
    const id = "claude-sonnet-4-6";
    fixture.connections = [];
    const minimal = { id: `ag/${id}`, object: "model", owned_by: "ag" };
    expect((await v1Models()).find((model) => model.id === minimal.id)).toEqual(minimal);
    await post("ag", { id, caps: { vision: false } });
    expect((await v1Models()).find((model) => model.id === minimal.id)).toEqual(minimal);
  });

  it("S1 R2 does not resurrect disabled or Codex no-active declarations", async () => {
    const id = "claude-sonnet-4-6";
    await post("ag", { id, contextWindow: 480000 });
    await post("cx", { id: "gpt-6.1-sol", contextWindow: 480000 });
    fixture.connections = [];
    fixture.disabled = { ag: [id] };
    const list = await v1Models();
    expect(list.some((model) => model.id === `ag/${id}`)).toBe(false);
    expect(list.some((model) => model.owned_by === "cx" || model.owned_by === "codex")).toBe(false);
    expect(new Set(list.map((model) => model.id)).size).toBe(list.length);
  });

  it("S1 R2 preserves the active Codex catalog boundary and its explicit live limits", async () => {
    fixture.connections = [connection("codex", "cx")];
    await post("cx", { id: "x1-live-only", contextWindow: 480000 });
    await post("cx", { id: "x1-retired", contextWindow: 480000 });
    fixture.liveModels = [{ id: "x1-live-only", capabilities: { contextWindow: 260000, maxOutput: 12000 } }];
    const list = await v1Models();
    expect(list.map((model) => model.id)).toEqual(["cx/x1-live-only"]);
    expect(list[0]).toMatchObject({ context_length: 260000, max_completion_tokens: 12000 });
    fixture.liveModels = [];
    expect(await v1Models()).toEqual([]);
  });

  it("S1 R1 cannot publish an old SQL snapshot after POST invalidates during node loading", async () => {
    await post(ALIAS_A, { contextWindow: 480000, caps: { vision: true } });
    const gate = holdNextNodeRead();
    const oldLoad = getDeclaredModelCaps(ALIAS_A, ID);
    await gate.reached;
    try {
      expect(gate.rows[0]).toMatchObject({ contextWindow: 480000, caps: { vision: true } });
      expect((await post(ALIAS_A, { contextWindow: 320000, caps: { vision: false } })).status).toBe(200);
      expect((await repo.getCustomModels())[0]).toMatchObject({ contextWindow: 320000, caps: { vision: false } });
    } finally {
      gate.resume();
      await oldLoad;
    }
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 320000, vision: false });
  });

  it("S1 R1 detaches invalidated loads and old completion cannot clear a newer collapsed miss", async () => {
    await post(ALIAS_A, { contextWindow: 480000, caps: { vision: true } });
    const oldGate = holdNextNodeRead();
    const oldLoad = getDeclaredModelCaps(ALIAS_A, ID);
    await oldGate.reached;
    await post(ALIAS_A, { contextWindow: 320000, caps: { vision: false } });
    const newGate = holdNextNodeRead();
    const reads = vi.spyOn(fixture.db, "all");
    const freshLoad = getDeclaredModelCaps(ALIAS_A, ID);
    const pending = [oldLoad, freshLoad];
    try {
      await vi.waitFor(() => expect(newGate.rows).not.toBeNull(), { timeout: 1000, interval: 10 });
      await newGate.reached;
      expect(newGate.rows[0]).toMatchObject({ contextWindow: 320000, caps: { vision: false } });
      oldGate.resume();
      await oldLoad;
      const collapsedLoad = getDeclaredModelCaps(ALIAS_A, ID);
      pending.push(collapsedLoad);
      newGate.resume();
      expect(await freshLoad).toMatchObject({ contextWindow: 320000, vision: false });
      expect(await collapsedLoad).toMatchObject({ contextWindow: 320000, vision: false });
      expect(reads.mock.calls.filter(([, params]) => params?.[0] === "customModels")).toHaveLength(1);
      expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 320000, vision: false });
    } finally {
      oldGate.resume();
      newGate.resume();
      await Promise.allSettled(pending);
      fixture.nextAdapterGate = null;
      fixture.afterModelRead = null;
    }
  });

  it("S1 R1 preserves fail-open SQL reads and permits a later successful cache miss", async () => {
    await post(ALIAS_A, { contextWindow: 320000, caps: { vision: false } });
    const reads = vi.spyOn(fixture.db, "all").mockImplementationOnce(() => { throw new Error("synthetic read failure"); });
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toBeUndefined();
    expect(reads).toHaveBeenCalledTimes(1);
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 320000, vision: false });
  });

  it("S1 R1 falls back without retrying when invalidation occurs on every load", async () => {
    await post(ALIAS_A, { contextWindow: 320000, caps: { vision: false } });
    const all = fixture.db.all;
    const reads = vi.spyOn(fixture.db, "all").mockImplementation((sql, params = []) => {
      const rows = all(sql, params);
      if (params[0] === "customModels") invalidateDeclaredModelCaps();
      return rows;
    });
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toBeUndefined();
    expect(reads.mock.calls.filter(([, params]) => params?.[0] === "customModels")).toHaveLength(1);
    reads.mockRestore();
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 320000, vision: false });
  });

  it("S1 R1 keeps alias-scoped declarations available if provider-node SQL fails", async () => {
    await post(ALIAS_A, { contextWindow: 320000, caps: { vision: false } });
    const all = fixture.db.all;
    vi.spyOn(fixture.db, "all").mockImplementation((sql, params = []) => {
      if (sql.includes("FROM providerNodes")) throw new Error("synthetic node read failure");
      return all(sql, params);
    });
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 320000, vision: false });
    expect(await getDeclaredModelCaps(PROVIDER_A, ID)).toBeUndefined();
  });

  it("isolates actual runtime declarations for providers sharing one ID", async () => {
    await post(ALIAS_A, { caps: { vision: true } });
    await post(ALIAS_B, { caps: { vision: false } });
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ vision: true });
    expect(await getDeclaredModelCaps(ALIAS_B, ID)).toMatchObject({ vision: false });
    expect(await getDeclaredModelCaps("x1-undeclared-provider", ID)).toBeUndefined();
  });

  it("resolves a custom-node runtime id through its registered prefix without cross-talk", async () => {
    fixture.db.run("INSERT INTO providerNodes(id, type, data) VALUES(?, ?, ?)", [
      PROVIDER_A, "openai-compatible", JSON.stringify({ prefix: ALIAS_A }),
    ]);
    await post(ALIAS_A, { contextWindow: 480000, caps: { vision: true } });
    await post(ALIAS_B, { contextWindow: 320000, caps: { vision: false } });
    expect(await getDeclaredModelCaps(PROVIDER_A, ID)).toMatchObject({ contextWindow: 480000, vision: true });
    expect(await getDeclaredModelCaps(PROVIDER_B, ID)).toBeUndefined();
  });

  it("preserves exact nested runtime IDs and invalidates cached updates", async () => {
    await post(ALIAS_A, { id: `vendor/${ID}`, contextWindow: 480000, caps: { vision: true } });
    await post(ALIAS_A, { contextWindow: 320000, caps: { vision: false } });
    expect(await getDeclaredModelCaps(ALIAS_A, `vendor/${ID}`)).toMatchObject({ contextWindow: 480000, vision: true });
    expect(await getDeclaredModelCaps(ALIAS_A, `${ALIAS_A}/vendor/${ID}`)).toMatchObject({ contextWindow: 480000, vision: true });
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 320000, vision: false });
    await post(ALIAS_A, { contextWindow: 360000 });
    expect(await getDeclaredModelCaps(ALIAS_A, ID)).toMatchObject({ contextWindow: 360000, vision: false });
  });

  it("retains no-active legacy boolean-only entries without numeric opt-in", async () => {
    await post(ALIAS_A, { caps: { vision: true } });
    fixture.connections = [];
    expect((await v1Models()).find((m) => m.id === `${ALIAS_A}/${ID}`)).toEqual({
      id: `${ALIAS_A}/${ID}`, object: "model", owned_by: ALIAS_A,
    });
  });

  it("ignores a nonnumeric stored boolean context instead of manufacturing a one-token limit", async () => {
    fixture.db.run("INSERT INTO kv(scope, key, value) VALUES('customModels', ?, ?)", [
      `${ALIAS_A}|${ID}|llm`,
      JSON.stringify({ providerAlias: ALIAS_A, id: ID, type: "llm", contextWindow: true }),
    ]);
    expect((await v1Models()).find((m) => m.id === `${ALIAS_A}/${ID}`).context_length).toBe(200000);
  });

  it("overlays metadata for a custom declaration matching an existing dashboard canonical row", async () => {
    await post("cx", { id: "gpt-6.1-sol", contextWindow: 480000, caps: { vision: false } });
    const dashboard = (await (await dashboardGET()).json()).models;
    const canonical = dashboard.filter((m) => m.routedModel === "cx/gpt-6.1-sol");
    expect(canonical).toHaveLength(1);
    expect(canonical[0].caps).toMatchObject({ contextWindow: 480000, maxOutput: 128000, vision: false, reasoning: true });
  });

  it.each([
    [{ providerAlias: {} }], [{ providerAlias: 42 }], [{ providerAlias: " " }],
    [{ id: {} }], [{ id: 42 }], [{ id: " " }],
  ])("rejects invalid required string fields %j without mutation", async (fields) => {
    await post(ALIAS_A, { contextWindow: 480000 });
    const before = await repo.getCustomModels();
    expect((await post(ALIAS_A, fields)).status).toBe(400);
    expect(await repo.getCustomModels()).toEqual(before);
  });

  it.each(["{", "null", "[]", "42"])("rejects malformed/invalid body %s without mutation", async (body) => {
    await post(ALIAS_A, { contextWindow: 480000 });
    const before = await repo.getCustomModels();
    vi.spyOn(console, "log").mockImplementation(() => {});
    const response = await POST(new Request("http://x1.invalid/api/models/custom", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    }));
    expect(response.status).toBe(400);
    expect(await repo.getCustomModels()).toEqual(before);
  });
});
