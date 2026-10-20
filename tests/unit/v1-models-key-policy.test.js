import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isModelAllowedForKey } from "@/lib/apiKeyPolicy.js";
import { AI_PROVIDERS, getProviderAlias } from "@/shared/constants/providers.js";
import { PROVIDER_MODELS, getModelKind } from "@/shared/constants/models.js";

// PREPARED/NOT RUN: actual public handlers, buildModelsList and native policy are
// the subjects. Only storage, live catalogs and transport/session proof inputs
// are synthetic. No real keys, database driver, server or network are required.
const fixture = vi.hoisted(() => ({
  keys: new Map(), connections: [], combos: [], customModels: [], aliases: {},
  disabled: {}, liveModels: [], settings: {}, keyLookupFails: false, catalogFails: false,
  keyReads: 0, validations: 0, catalogReads: 0, liveReads: 0,
  peerProof: "x2-synthetic-peer-proof", cliProof: "x2-synthetic-cli-proof",
}));

vi.mock("@/lib/db/driver.js", () => ({
  getAdapter: async () => ({
    get: (sql, values = []) => {
      if (sql !== "SELECT * FROM apiKeys WHERE key = ?" && sql !== "SELECT isActive, expiresAt FROM apiKeys WHERE key = ?") {
        throw new Error("X2 fixture rejects unexpected database access");
      }
      fixture.keyReads += 1;
      if (sql.startsWith("SELECT isActive")) fixture.validations += 1;
      if (fixture.keyLookupFails) throw new Error("Synthetic key lookup unavailable");
      return fixture.keys.get(values[0]) || null;
    },
  }),
}));

vi.mock("@/lib/localDb", async () => {
  const keyRepo = await import("@/lib/db/repos/apiKeysRepo.js");
  return {
    getApiKeyByKey: keyRepo.getApiKeyByKey,
    validateApiKey: keyRepo.validateApiKey,
    getSettings: async () => fixture.settings,
    getCachedSettings: async () => fixture.settings,
    getProviderConnections: async () => {
      fixture.catalogReads += 1;
      if (fixture.catalogFails) throw new Error("Synthetic catalog unavailable");
      return fixture.connections;
    },
    getCombos: async () => { fixture.catalogReads += 1; return fixture.combos; },
    getComboByName: async (name) => { fixture.catalogReads += 1; return fixture.combos.find((combo) => combo.name === name) || null; },
    getCustomModels: async () => { fixture.catalogReads += 1; return fixture.customModels; },
    getModelAliases: async () => { fixture.catalogReads += 1; return fixture.aliases; },
  };
});
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledModels: async () => fixture.disabled }));
vi.mock("@/lib/codexModels.js", () => ({
  resolveCodexCatalog: async () => { fixture.liveReads += 1; return fixture.liveModels; },
}));
vi.mock("open-sse/services/kiroModels.js", () => ({
  resolveKiroModels: async () => { fixture.liveReads += 1; return { models: fixture.liveModels }; },
}));
vi.mock("@/shared/utils/machineId", () => ({ getConsistentMachineId: async () => fixture.cliProof }));
vi.mock("@/lib/auth/dashboardSession", () => ({ verifyDashboardAuthToken: async () => false }));
vi.mock("@/lib/auth/trustedPeer", () => ({
  hasTrustedPeerHeaders: (request) => request.headers.get("x-9r-peer-token") === fixture.peerProof,
}));

const root = await import("@/app/api/v1/models/route.js");
const sibling = await import("@/app/api/v1/models/[...model]/route.js");
const info = await import("@/app/api/v1/models/info/route.js");
const { proxy } = await import("@/dashboardGuard.js");

const PROVIDER_A = "openai-compatible-chat-x2-alpha";
const PROVIDER_B = "openai-compatible-chat-x2-beta";
const PREFIX_A = "x2alpha";
const PREFIX_B = "x2beta";
const MODEL_A = "x2-model-alpha";
const MODEL_B = "x2-model-beta";
const COMBO_A = "x2-route-alpha";
const COMBO_B = "x2-route-beta";
const MEDIA_KINDS = ["image", "tts", "stt", "embedding", "image-to-text"];
const KEY_A = "x2-private-key-alpha";
const KEY_B = "x2-private-key-beta";
const UNKNOWN_KEY = "x2-private-key-unrecognized";

function connection(provider, prefix, enabledModels = [MODEL_A, MODEL_B]) {
  return { id: `${prefix}-fixture`, provider, isActive: true, providerSpecificData: { prefix, enabledModels } };
}

function keyRow(fields = {}) {
  return { id: "x2-key-alpha", key: KEY_A, isActive: true, expiresAt: null, modelPolicy: "off", ...fields };
}

function useKey(fields = {}, key = KEY_A) {
  const row = keyRow(fields);
  fixture.keys.set(key, row);
  return row;
}

function request(path = "/api/v1/models", key = KEY_A, options = {}) {
  const url = new URL(path, "http://x2.invalid");
  const headers = new Headers(options.headers || {});
  if (key != null) {
    const transport = options.transport || "bearer";
    if (transport === "query") url.searchParams.set("key", key);
    else headers.set(transport === "bearer" ? "Authorization" : transport, transport === "bearer" ? `Bearer ${key}` : key);
  }
  return new NextRequest(url, { headers });
}

function localRequest(path = "/api/v1/models", key = null) {
  return request(path, key, { headers: {
    host: "localhost:20128", "x-9r-real-ip": "127.0.0.1", "x-9r-peer-token": fixture.peerProof,
  } });
}

function params(model) { return { params: Promise.resolve({ model }) }; }
function ids(models) { return models.map((model) => model.id).sort(); }

function privateNoStore(response) {
  const cache = response.headers.get("cache-control") || "";
  expect(cache.includes("private")).toBe(true);
  expect(cache.includes("no-store")).toBe(true);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
}

function noCredentialLeak(body) {
  const serialized = JSON.stringify(body);
  for (const value of [KEY_A, KEY_B, UNKNOWN_KEY]) expect(serialized.includes(value)).toBe(false);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      expect(["apiKey", "key", "accessToken", "refreshToken"].includes(name)).toBe(false);
      visit(child);
    }
  };
  visit(body);
}

async function rootList(key = KEY_A) {
  const response = await root.GET(request("/api/v1/models", key));
  expect(response.status).toBe(200);
  const body = await response.json();
  noCredentialLeak(body);
  return { response, models: body.data };
}

function staticMedia(kind) {
  const mappedKind = kind === "image-to-text" ? "imageToText" : kind;
  // No static registry rows currently have imageToText kind. Exercise that
  // actual handler branch through two synthetic custom rows, not an empty list.
  if (mappedKind === "imageToText") {
    const [provider] = Object.entries(AI_PROVIDERS).find(([, definition]) => (definition.serviceKinds || []).includes(mappedKind));
    return { provider, prefix: getProviderAlias(provider), candidates: [
      { id: "x2-vision-alpha", kind: mappedKind }, { id: "x2-vision-beta", kind: mappedKind },
    ] };
  }
  for (const [provider, definition] of Object.entries(AI_PROVIDERS)) {
    if (provider === "codex" || !(definition.serviceKinds || []).includes(mappedKind)) continue;
    const prefix = getProviderAlias(provider);
    const candidates = (PROVIDER_MODELS[prefix] || []).filter((model) => getModelKind(model, "llm") === mappedKind);
    if (candidates.length >= 2) return { provider, prefix, candidates: candidates.slice(0, 2) };
  }
  throw new Error("Synthetic media fixture needs two actual registry candidates");
}

beforeEach(() => {
  fixture.keys = new Map();
  fixture.connections = [connection(PROVIDER_A, PREFIX_A), connection(PROVIDER_B, PREFIX_B)];
  fixture.combos = [
    { name: COMBO_A, models: [`${PREFIX_A}/${MODEL_A}`] },
    { name: COMBO_B, models: [`${PREFIX_A}/${MODEL_B}`] },
  ];
  fixture.customModels = [];
  fixture.aliases = {};
  fixture.disabled = {};
  fixture.liveModels = [];
  fixture.settings = { requireApiKey: false, requireLogin: true };
  fixture.keyLookupFails = false;
  fixture.catalogFails = false;
  fixture.keyReads = 0;
  fixture.validations = 0;
  fixture.catalogReads = 0;
  fixture.liveReads = 0;
  useKey();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("X2 fixture forbids network access"); }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("X2 actual public model catalog policy", () => {
  it("ordinary RED: a known whitelist key cannot discover the forbidden model on root GET", async () => {
    const row = useKey({ modelPolicy: "whitelist", allowedModels: [`${PREFIX_A}/${MODEL_A}`] });
    const global = await root.buildModelsList(["llm"]);
    expect(ids(global)).toContain(`${PREFIX_A}/${MODEL_B}`);
    expect(isModelAllowedForKey(row, `${PREFIX_A}/${MODEL_B}`)).toBe(false);
    const { models } = await rootList();
    expect(ids(models)).toEqual(ids(global.filter((model) => isModelAllowedForKey(row, model.id))));
  });

  const policyCases = [
    { label: "whitelist array", modelPolicy: "whitelist", allowedModels: [MODEL_A] },
    { label: "whitelist JSON", modelPolicy: "whitelist", allowedModels: JSON.stringify([MODEL_A]) },
    { label: "whitelist CSV", modelPolicy: "whitelist", allowedModels: ` ${MODEL_A}, ${COMBO_A} ` },
    { label: "whitelist trimmed/provider-qualified", modelPolicy: "whitelist", allowedModels: [` ${PREFIX_A}/${MODEL_A} `] },
    { label: "malformed JSON falls back to CSV", modelPolicy: "whitelist", allowedModels: `[broken, ${MODEL_A}` },
    { label: "nonarray JSON falls back to CSV", modelPolicy: "whitelist", allowedModels: JSON.stringify({ value: MODEL_A }) },
    { label: "nonarray scalar JSON falls back to CSV", modelPolicy: "whitelist", allowedModels: "42" },
    { label: "empty whitelist array allows all", modelPolicy: "whitelist", allowedModels: [] },
    { label: "empty whitelist JSON allows all", modelPolicy: "whitelist", allowedModels: "[]" },
    { label: "null whitelist allows all", modelPolicy: "whitelist", allowedModels: null },
    { label: "object whitelist allows all", modelPolicy: "whitelist", allowedModels: { value: MODEL_A } },
    { label: "mixed whitelist keeps only native valid entries", modelPolicy: "whitelist", allowedModels: [null, 1, " ", MODEL_A] },
    { label: "blacklist array", modelPolicy: "blacklist", blockedModels: [MODEL_B] },
    { label: "blacklist JSON", modelPolicy: "blacklist", blockedModels: JSON.stringify([MODEL_B]) },
    { label: "blacklist CSV", modelPolicy: "blacklist", blockedModels: ` ${MODEL_B}, ${COMBO_B} ` },
    { label: "empty blacklist allows all", modelPolicy: "blacklist", blockedModels: [] },
    { label: "off", modelPolicy: "off", allowedModels: [MODEL_A], blockedModels: [MODEL_B] },
    { label: "absent/default", modelPolicy: undefined, allowedModels: [MODEL_A] },
    { label: "unknown preserves native allow-all", modelPolicy: "unrecognized", allowedModels: [MODEL_A] },
  ];
  it.each(policyCases)("matches the native policy contract: $label", async ({ label: _label, ...fields }) => {
    const row = useKey(fields);
    const global = await root.buildModelsList(["llm"]);
    const { models } = await rootList();
    expect(ids(models)).toEqual(ids(global.filter((model) => isModelAllowedForKey(row, model.id))));
  });

  it("preserves same-tail matching across provider-qualified IDs without new provider entitlement", async () => {
    const row = useKey({ modelPolicy: "whitelist", allowedModels: [`${PREFIX_A}/${MODEL_A}`] });
    expect(isModelAllowedForKey(row, `${PREFIX_B}/${MODEL_A}`)).toBe(true);
    expect(ids((await rootList()).models)).toEqual([`${PREFIX_A}/${MODEL_A}`, `${PREFIX_B}/${MODEL_A}`].sort());
  });

  it("uses advertised/requested alias IDs without inventing alias-target authorization", async () => {
    fixture.aliases = { "x2-friendly-name": `${PREFIX_A}/x2-alias-target` };
    const row = useKey({ modelPolicy: "whitelist", allowedModels: ["x2-friendly-name"] });
    expect(isModelAllowedForKey(row, `${PREFIX_A}/x2-alias-target`)).toBe(false);
    expect(ids((await rootList()).models)).toEqual([]);
    useKey({ modelPolicy: "whitelist", allowedModels: ["x2-alias-target"] });
    expect(ids((await rootList()).models)).toEqual([`${PREFIX_A}/x2-alias-target`]);
  });

  it("filters bare combo names, without authorizing a combo by allowed member IDs", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [COMBO_A] });
    expect(ids((await rootList()).models)).toEqual([COMBO_A]);
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    expect(ids((await rootList()).models)).not.toContain(COMBO_A);
  });

  it("never caches key A's filtered response for key B or an admitted no-key request", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    useKey({ id: "x2-key-beta", modelPolicy: "whitelist", allowedModels: [MODEL_B] }, KEY_B);
    const a = await rootList(KEY_A);
    const b = await rootList(KEY_B);
    expect(ids(a.models)).toEqual([`${PREFIX_A}/${MODEL_A}`, `${PREFIX_B}/${MODEL_A}`].sort());
    expect(ids(b.models)).toEqual([`${PREFIX_A}/${MODEL_B}`, `${PREFIX_B}/${MODEL_B}`].sort());
    expect(ids((await rootList(KEY_A)).models)).toEqual(ids(a.models));
    const publicResponse = await root.GET(localRequest());
    expect(publicResponse.status).toBe(200);
    expect(ids((await publicResponse.json()).data)).toEqual(ids(await root.buildModelsList(["llm"])));
    privateNoStore(a.response);
    privateNoStore(b.response);
  });

  it("publishes no credential fields and marks personalized success private/no-store", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    const { response, models } = await rootList();
    privateNoStore(response);
    noCredentialLeak(models);
  });

  it("keeps buildModelsList global and retains trusted internal GET-without-request compatibility", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    const global = await root.buildModelsList(["llm"]);
    const response = await root.GET();
    expect(response.status).toBe(200);
    expect(ids((await response.json()).data)).toEqual(ids(global));
    expect(fixture.keyReads).toBe(0);
  });

  it("applies disabled-model removal before native per-key filtering", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    fixture.disabled = { [PREFIX_A]: [MODEL_A] };
    expect(ids((await rootList()).models)).toEqual([`${PREFIX_B}/${MODEL_A}`]);
  });

  it("preserves authoritative active Codex catalogs while applying key policy", async () => {
    const prefix = getProviderAlias("codex");
    fixture.connections = [connection("codex", prefix, [])];
    fixture.combos = [];
    fixture.customModels = [{ providerAlias: prefix, id: "x2-retired", type: "llm" }];
    fixture.liveModels = [{ id: MODEL_A }, { id: MODEL_B }];
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A, "x2-retired"] });
    expect(ids((await rootList()).models)).toEqual([`${prefix}/${MODEL_A}`]);
  });
});

describe("X2 sibling catalog and legacy lookup boundaries", () => {
  it.each(MEDIA_KINDS)("filters the actual %s populated kind list by native key policy", async (kind) => {
    const { provider, prefix, candidates } = staticMedia(kind);
    fixture.connections = [connection(provider, prefix, candidates.map((model) => model.id))];
    fixture.combos = [];
    if (kind === "image-to-text") fixture.customModels = candidates.map((model) => ({ ...model, providerAlias: prefix }));
    const row = useKey({ modelPolicy: "whitelist", allowedModels: [candidates[0].id] });
    const global = await root.buildModelsList([kind === "image-to-text" ? "imageToText" : kind]);
    const response = await sibling.GET(request(`/api/v1/models/${kind}`), params([kind]));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(ids(body.data)).toEqual(ids(global.filter((model) => isModelAllowedForKey(row, model.id))));
    noCredentialLeak(body);
    privateNoStore(response);
  });

  it("filters virtual web search/fetch rows without bypassing policy", async () => {
    const [provider] = Object.entries(AI_PROVIDERS).find(([, definition]) => definition.searchConfig && definition.fetchConfig);
    const prefix = getProviderAlias(provider);
    fixture.connections = [connection(provider, prefix, [])];
    fixture.combos = [];
    const row = useKey({ modelPolicy: "whitelist", allowedModels: [`${prefix}/search`] });
    const global = await root.buildModelsList(["webSearch", "webFetch"]);
    const response = await sibling.GET(request("/api/v1/models/web"), params(["web"]));
    expect(response.status).toBe(200);
    expect(ids((await response.json()).data)).toEqual(ids(global.filter((model) => isModelAllowedForKey(row, model.id))));
    privateNoStore(response);
  });

  it.each([
    { label: "split path", path: [PREFIX_A, MODEL_B] },
    { label: "decoded slash", path: [`${PREFIX_A}/${MODEL_B}`] },
  ])("denies a forbidden single-model $label rather than disclosing metadata", async ({ path }) => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    const response = await sibling.GET(request(`/api/v1/models/${path.join("/")}`), params(path));
    expect(response.status === 403 || response.status === 404).toBe(true);
    const body = await response.json();
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("capabilities");
    noCredentialLeak(body);
    privateNoStore(response);
  });

  it("retains allowed single-model metadata as a positive control", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    const response = await sibling.GET(request(`/api/v1/models/${PREFIX_A}/${MODEL_A}`), params([PREFIX_A, MODEL_A]));
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(`${PREFIX_A}/${MODEL_A}`);
    privateNoStore(response);
  });

  it("checks policy on slash-qualified legacy combo fallback instead of reviving a forbidden bare combo", async () => {
    useKey({ modelPolicy: "whitelist", allowedModels: [COMBO_A] });
    const denied = await sibling.GET(request(`/api/v1/models/x2legacy/${COMBO_B}`), params(["x2legacy", COMBO_B]));
    expect(denied.status === 403 || denied.status === 404).toBe(true);
    privateNoStore(denied);
    const allowed = await sibling.GET(request(`/api/v1/models/x2legacy/${COMBO_A}`), params(["x2legacy", COMBO_A]));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).id).toBe(COMBO_A);
    privateNoStore(allowed);
  });

  it("checks the requested legacy kr alias with the same native tail policy", async () => {
    fixture.connections = [connection("kiro", getProviderAlias("kiro"), [])];
    fixture.combos = [];
    fixture.liveModels = [{ id: MODEL_A }, { id: MODEL_B }];
    useKey({ modelPolicy: "whitelist", allowedModels: [`kr/${MODEL_A}`] });
    const denied = await sibling.GET(request(`/api/v1/models/kr/${MODEL_B}`), params(["kr", MODEL_B]));
    expect(denied.status === 403 || denied.status === 404).toBe(true);
    const allowed = await sibling.GET(request(`/api/v1/models/kr/${MODEL_A}`), params(["kr", MODEL_A]));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).id).toBe(`${getProviderAlias("kiro")}/${MODEL_A}`);
    privateNoStore(denied);
    privateNoStore(allowed);
  });

  it("does not leak static info fallback metadata for a forbidden registered ID", async () => {
    const { provider, prefix, candidates } = staticMedia("image");
    fixture.connections = [connection(provider, prefix, candidates.map((model) => model.id))];
    const allowId = `${prefix}/${candidates[0].id}`;
    const denyId = `${prefix}/${candidates[1].id}`;
    useKey({ modelPolicy: "whitelist", allowedModels: [allowId] });
    const denied = await info.GET(request(`/api/v1/models/info?id=${encodeURIComponent(denyId)}`));
    expect(denied.status === 403 || denied.status === 404).toBe(true);
    const body = await denied.json();
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("params");
    noCredentialLeak(body);
    privateNoStore(denied);
    const allowed = await info.GET(request(`/api/v1/models/info?id=${encodeURIComponent(allowId)}`));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).id).toBe(allowId);
    privateNoStore(allowed);
  });

  it("does not leak forbidden Codex info across canonical or custom prefixes", async () => {
    fixture.connections = [connection("codex", "x2codex", [])];
    fixture.combos = [];
    fixture.liveModels = [{ id: MODEL_A }, { id: MODEL_B }];
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    for (const prefix of ["cx", "codex", "x2codex"]) {
      const response = await info.GET(request(`/api/v1/models/info?id=${prefix}/${MODEL_B}`));
      expect(response.status === 403 || response.status === 404).toBe(true);
      expect(await response.json()).not.toHaveProperty("id");
      privateNoStore(response);
    }
  });
});

describe("X2 credential failures and justified no-key catalog compatibility", () => {
  const surfaces = [
    { label: "root", call: (req) => root.GET(req), path: "/api/v1/models" },
    { label: "kind", call: (req) => sibling.GET(req, params(["image"])), path: "/api/v1/models/image" },
    { label: "single", call: (req) => sibling.GET(req, params([PREFIX_A, MODEL_A])), path: `/api/v1/models/${PREFIX_A}/${MODEL_A}` },
    { label: "info", call: (req) => info.GET(req), path: "/api/v1/models/info?id=openai/gpt-image-1" },
  ];
  const failures = [
    { label: "unrecognized", key: UNKNOWN_KEY },
    { label: "inactive", patch: { isActive: false } },
    { label: "expired", patch: { expiresAt: "2000-01-01T00:00:00.000Z" } },
    { label: "malformed stored expiry", patch: { expiresAt: "not-a-date" } },
    { label: "lookup failure", lookupFails: true },
  ];
  const failureCases = surfaces.flatMap((surface) => failures.map((failure) => ({
    surface, failure, label: `${surface.label}: ${failure.label}`,
  })));
  it.each(failureCases)("explicit credential must not fall back to a public catalog: $label", async ({ surface, failure }) => {
    useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A], ...failure.patch });
    fixture.keyLookupFails = failure.lookupFails === true;
    const response = await surface.call(request(surface.path, failure.key || KEY_A));
    expect([401, 403, 503].includes(response.status)).toBe(true);
    const body = await response.json();
    expect(body).not.toHaveProperty("data");
    expect(body).not.toHaveProperty("id");
    noCredentialLeak(body);
    expect(fixture.catalogReads).toBe(0);
    expect(fixture.liveReads).toBe(0);
    privateNoStore(response);
  });

  it("an explicit invalid credential remains denied even for an otherwise admitted local caller", async () => {
    const response = await root.GET(localRequest("/api/v1/models", UNKNOWN_KEY));
    expect([401, 403, 503].includes(response.status)).toBe(true);
    expect(fixture.catalogReads).toBe(0);
    privateNoStore(response);
  });

  it("matches middleware Bearer precedence when a lower-priority valid key conflicts", async () => {
    useKey({ modelPolicy: "off" }, KEY_B);
    const response = await root.GET(request("/api/v1/models", UNKNOWN_KEY, { headers: { "x-api-key": KEY_B } }));
    expect(response.status).toBe(401);
    expect(fixture.catalogReads).toBe(0);
    privateNoStore(response);
  });

  it("explicit empty Bearer credentials are denied instead of becoming local public mode", async () => {
    const req = localRequest();
    // Native Headers trim trailing whitespace; a raw headers adapter preserves
    // the exact middleware input contract for this internal synthetic request.
    const nativeHeaders = req.headers;
    const response = await root.GET({ url: req.url, headers: {
      get: (name) => name.toLowerCase() === "authorization" ? "Bearer " : nativeHeaders.get(name),
    } });
    expect(response.status).toBe(401);
    expect(fixture.catalogReads).toBe(0);
    privateNoStore(response);
  });

  it.each([
    { label: "native scheme-only Bearer", headers: { Authorization: "Bearer " } },
    { label: "malformed Authorization", headers: { Authorization: "Basic fixture" } },
    { label: "empty x-api-key", headers: { "x-api-key": "" } },
    { label: "empty Google key", headers: { "x-goog-api-key": "" } },
    { label: "empty query key", path: "/api/v1/models?key=" },
  ])("shared authority: explicit empty/malformed $label cannot become no-key catalog", async ({ headers, path }) => {
    const response = await root.GET(request(path || "/api/v1/models", null, { headers }));
    expect(response.status).toBe(401);
    expect(fixture.catalogReads).toBe(0);
    privateNoStore(response);
  });

  it("personalized info failures remain generic and private without raw storage errors", async () => {
    fixture.catalogFails = true;
    const response = await info.GET(request("/api/v1/models/info?id=openai/gpt-image-1"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body).includes("Synthetic catalog unavailable")).toBe(false);
    expect(body).not.toHaveProperty("id");
    privateNoStore(response);
    noCredentialLeak(body);
  });

  it.each(["bearer", "x-api-key", "x-goog-api-key", "query"])("filters a recognized %s key using the actual public handler", async (transport) => {
    const row = useKey({ modelPolicy: "whitelist", allowedModels: [MODEL_A] });
    const global = await root.buildModelsList(["llm"]);
    const response = await root.GET(request("/api/v1/models", KEY_A, { transport }));
    expect(response.status).toBe(200);
    expect(ids((await response.json()).data)).toEqual(ids(global.filter((model) => isModelAllowedForKey(row, model.id))));
    privateNoStore(response);
  });

  it("OPTIONS remains key/storage-free on root, catch-all and info", async () => {
    fixture.keyLookupFails = true;
    for (const handler of [root, sibling, info]) {
      const response = await handler.OPTIONS();
      expect(response.status >= 200 && response.status < 300).toBe(true);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
    expect(fixture.keyReads).toBe(0);
    expect(fixture.catalogReads).toBe(0);
  });

  it.each([false, true])("remote no-key access remains middleware-denied with requireApiKey=%s", async (required) => {
    fixture.settings.requireApiKey = required;
    const response = await proxy(request("/api/v1/models", null));
    expect(response.status).toBe(401);
    expect(fixture.catalogReads).toBe(0);
  });

  it("preserves middleware-admitted local no-key catalog discovery without widening remote access", async () => {
    const req = localRequest();
    const admitted = await proxy(req);
    expect(admitted.headers.get("x-middleware-next")).toBe("1");
    const response = await root.GET(req);
    expect(response.status).toBe(200);
    expect(ids((await response.json()).data)).toEqual(ids(await root.buildModelsList(["llm"])));
  });

  it("preserves middleware-admitted validated CLI no-key catalog discovery", async () => {
    const req = request("/api/v1/models", null, { headers: { "x-9r-cli-token": fixture.cliProof } });
    const admitted = await proxy(req);
    expect(admitted.headers.get("x-middleware-next")).toBe("1");
    const response = await root.GET(req);
    expect(response.status).toBe(200);
    expect(ids((await response.json()).data)).toEqual(ids(await root.buildModelsList(["llm"])));
  });
});
