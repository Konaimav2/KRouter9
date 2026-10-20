import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  keys: new Map(), settings: {}, lookupFails: false, executions: 0, providerReads: 0,
}));
vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/db/driver.js", () => ({ getAdapter: async () => ({
  get: (sql, params = []) => {
    if (!sql.includes("FROM apiKeys WHERE key = ?")) throw new Error("Unexpected synthetic SQL");
    if (fixture.lookupFails) throw new Error("Synthetic credential lookup unavailable");
    return fixture.keys.get(params[0]) || null;
  },
}) }));
vi.mock("@/lib/localDb", async () => {
  const keys = await import("@/lib/db/repos/apiKeysRepo.js");
  return {
    getApiKeyByKey: keys.getApiKeyByKey, validateApiKey: keys.validateApiKey,
    getCachedSettings: async () => fixture.settings, getSettings: async () => fixture.settings,
    getCombos: async () => [], getComboByName: async () => null,
    getModelAliases: async () => ({}), getProviderNodes: async () => [], getProxyPools: async () => [],
    updateProviderConnection: async () => {},
    getProviderConnections: async () => {
      fixture.providerReads += 1;
      return [{ id: "x2-upstream-fixture", provider: "openai", isActive: true, testStatus: "active", providerSpecificData: {} }];
    },
  };
});
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}), pickProxyPoolId: () => null }));
vi.mock("@/sse/services/antigravityQuota.js", () => ({
  getAntigravityQuotaCache: () => null, handleAntigravityQuotaError: async () => null, clearAntigravityStrikes: () => {},
}));
vi.mock("@/sse/utils/logger.js", () => ({
  maskKey: () => "masked", debug: () => {}, warn: () => {}, info: () => {}, error: () => {},
}));
vi.mock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: async () => {
  fixture.executions += 1;
  return { success: true, response: Response.json({ id: "x2-upstream-positive-control", choices: [] }) };
} }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({
  updateProviderCredentials: async () => {}, checkAndRefreshToken: async (_provider, credentials) => credentials,
}));
vi.mock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: async () => null }));
vi.mock("open-sse/handlers/chatCore/requestDetail.js", () => ({ saveRequestError: () => {} }));
vi.mock("@/lib/db/repos/responseCacheRepo.js", () => ({ getResponseCacheEntry: async () => null, setResponseCacheEntry: async () => {} }));
vi.mock("@/lib/budget.js", () => ({ reserveBudget: async () => { throw new Error("Budget disabled in fixture"); } }));
vi.mock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://x2.invalid" }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent: () => {} }));

const { handleChat } = await import("@/sse/handlers/chat.js");
const { extractApiKey } = await import("@/sse/services/auth.js");
const { isModelAllowedForKey } = await import("@/lib/apiKeyPolicy.js");
const rateLimits = await import("@/lib/rateLimit.js");

const TOKEN = "x2-private-inference-key";
const UNKNOWN = "x2-private-unrecognized-key";
const ALLOWED = "openai/x2-allowed";
const FORBIDDEN = "openai/x2-forbidden";

function request(model = FORBIDDEN, token = TOKEN, transport = "bearer", headers = {}) {
  const url = new URL("http://x2.invalid/api/v1/chat/completions");
  const values = new Headers({ "Content-Type": "application/json", ...headers });
  if (token != null) {
    if (transport === "query") url.searchParams.set("key", token);
    else values.set(transport === "bearer" ? "Authorization" : transport, transport === "bearer" ? `Bearer ${token}` : token);
  }
  return new Request(url, { method: "POST", headers: values, body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: "synthetic policy control" }] }) });
}

beforeEach(() => {
  fixture.keys = new Map([[TOKEN, { id: "x2-inference-key", isActive: true, expiresAt: null, modelPolicy: "whitelist", allowedModels: JSON.stringify([ALLOWED]) }]]);
  fixture.settings = { requireApiKey: false, responseCacheEnabled: false, guardrailsEnabled: false };
  fixture.lookupFails = false;
  fixture.executions = 0;
  fixture.providerReads = 0;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("X2 chat fixture forbids network"); }));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("X2 actual chat native policy boundary", () => {
  it.each([false, true])("forbidden chat is 403 before provider/execution with requireApiKey=%s", async (required) => {
    fixture.settings.requireApiKey = required;
    expect(isModelAllowedForKey(fixture.keys.get(TOKEN), FORBIDDEN)).toBe(false);
    const response = await handleChat(request());
    expect(response.status).toBe(403);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
    expect(JSON.stringify(await response.json()).includes(TOKEN)).toBe(false);
  });
  it.each(["bearer", "x-api-key"])("blacklist denial via %s has zero upstream execution", async (transport) => {
    fixture.keys.get(TOKEN).modelPolicy = "blacklist";
    fixture.keys.get(TOKEN).blockedModels = JSON.stringify([FORBIDDEN]);
    const response = await handleChat(request(FORBIDDEN, TOKEN, transport));
    expect(response.status).toBe(403);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
  });
  it.each([false, true])("allowed positive control reaches one execution with requireApiKey=%s", async (required) => {
    fixture.settings.requireApiKey = required;
    const response = await handleChat(request(ALLOWED));
    expect(response.status).toBe(200);
    expect(fixture.executions).toBe(1);
  });
  it.each(["x2-forbidden-combo", "legacy/x2-forbidden-combo"])("denies the requested combo name %s before resolution", async (model) => {
    const response = await handleChat(request(model));
    expect(response.status).toBe(403);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
  });
  it("retains native same-tail behavior and Bearer precedence over conflicting headers", async () => {
    expect(isModelAllowedForKey(fixture.keys.get(TOKEN), "other/x2-allowed")).toBe(true);
    const req = request(FORBIDDEN, TOKEN, "bearer", { "x-api-key": UNKNOWN, "x-goog-api-key": UNKNOWN });
    expect(extractApiKey(req) === TOKEN).toBe(true);
    expect((await handleChat(req)).status).toBe(403);
    expect(fixture.executions).toBe(0);
  });
  it.each([
    { label: "unknown", unknown: true },
    { label: "inactive", patch: { isActive: false } },
    { label: "expired", patch: { expiresAt: "2000-01-01T00:00:00Z" } },
  ])("requireApiKey=true rejects $label before execution", async ({ unknown, patch }) => {
    fixture.settings.requireApiKey = true;
    if (patch) Object.assign(fixture.keys.get(TOKEN), patch);
    expect((await handleChat(request(ALLOWED, unknown ? UNKNOWN : TOKEN))).status).toBe(401);
    expect(fixture.executions).toBe(0);
  });
});

describe("approved shared credential authority controls", () => {
  const sources = ["bearer", "x-api-key", "x-goog-api-key", "query"];
  it.each(sources.flatMap((transport) => [false, true].map((required) => ({ transport, required }))))(
    "shared authority: $transport enforces forbidden policy with required=$required", async ({ transport, required }) => {
      fixture.settings.requireApiKey = required;
      const response = await handleChat(request(FORBIDDEN, TOKEN, transport));
      expect({ status: response.status, providerReads: fixture.providerReads, executions: fixture.executions }).toEqual({ status: 403, providerReads: 0, executions: 0 });
    },
  );
  it.each(sources.flatMap((transport) => [false, true].map((required) => ({ transport, required }))))(
    "shared authority: $transport allowed positive control with required=$required", async ({ transport, required }) => {
      fixture.settings.requireApiKey = required;
      expect((await handleChat(request(ALLOWED, TOKEN, transport))).status).toBe(200);
      expect(fixture.executions).toBe(1);
    },
  );
  it.each([false, true])("shared authority: malformed expiry fails closed with required=%s", async (required) => {
    fixture.settings.requireApiKey = required;
    fixture.keys.get(TOKEN).expiresAt = "not-a-date";
    expect((await handleChat(request(ALLOWED))).status).toBe(401);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
  });
  it.each([false, true])("shared authority: lookup failure is generic503 before dispatch with required=%s", async (required) => {
    fixture.settings.requireApiKey = required;
    fixture.lookupFails = true;
    const response = await handleChat(request(ALLOWED));
    expect(response.status).toBe(503);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
    const text = JSON.stringify(await response.json());
    expect(text.includes(TOKEN)).toBe(false);
    expect(text.includes("Synthetic credential lookup unavailable")).toBe(false);
  });
  it.each([
    { label: "native scheme-only Bearer", headers: { Authorization: "Bearer " } },
    { label: "malformed Authorization", headers: { Authorization: "Basic fixture" } },
    { label: "empty x-api-key", headers: { "x-api-key": "" } },
    { label: "empty Google key", headers: { "x-goog-api-key": "" } },
    { label: "empty query key", query: true },
  ])("shared authority: explicit empty/malformed $label is not genuine no-key", async ({ headers, query }) => {
    const req = request(ALLOWED, null, "bearer", headers);
    const incoming = query ? new Request(`${req.url}?key=`, req) : req;
    expect((await handleChat(incoming)).status).toBe(401);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
  });
  it.each([false, true])("shared authority: invalid key never bypasses internal dashboard mode (%s)", async (internal) => {
    const response = await handleChat(request(ALLOWED, UNKNOWN), null, { internal });
    expect(response.status).toBe(401);
    expect(fixture.executions).toBe(0);
  });
  it("shared authority: genuine no-key optional mode and internal exemption remain compatible", async () => {
    expect((await handleChat(request(ALLOWED, null))).status).toBe(200);
    fixture.settings.requireApiKey = true;
    expect((await handleChat(request(ALLOWED, null))).status).toBe(401);
    expect((await handleChat(request(ALLOWED, null), null, { internal: true })).status).toBe(200);
    expect(fixture.executions).toBe(2);
  });
  it.each([
    { label: "policy off", fields: { modelPolicy: "off" } },
    { label: "empty whitelist", fields: { allowedModels: "[]" } },
  ])("shared authority: recognized $label retains native allow-all semantics", async ({ fields }) => {
    Object.assign(fixture.keys.get(TOKEN), fields);
    expect((await handleChat(request(FORBIDDEN))).status).toBe(200);
    expect(fixture.executions).toBe(1);
  });
  it("shared authority: limiter failure never clears a known budget authority and dispatches", async () => {
    fixture.keys.get(TOKEN).creditLimit = 1;
    vi.spyOn(rateLimits, "checkRateLimit").mockImplementation(() => { throw new Error("Synthetic limiter fault"); });
    expect((await handleChat(request(ALLOWED))).status).toBe(503);
    expect(fixture.providerReads).toBe(0);
    expect(fixture.executions).toBe(0);
  });
});

// The original six ordinary RED safety cases remain unchanged. Approved repair
// must make them pass rather than skip or weaken their authority contract.
describe("X2 adjacent inference credential safety (scope diagnosis)", () => {
  it.each(["x-goog-api-key", "query"])("credential safety: %s must enforce known-key forbidden policy", async (transport) => {
    const response = await handleChat(request(FORBIDDEN, TOKEN, transport));
    expect({ status: response.status, upstreamExecutions: fixture.executions }).toEqual({ status: 403, upstreamExecutions: 0 });
  });
  it.each([
    { label: "unknown", unknown: true },
    { label: "inactive", patch: { isActive: false } },
    { label: "expired", patch: { expiresAt: "2000-01-01T00:00:00Z" } },
    { label: "lookup failure", lookupFails: true },
  ])("credential safety: explicit $label key must not bypass when requireApiKey=false", async ({ unknown, patch, lookupFails }) => {
    if (patch) Object.assign(fixture.keys.get(TOKEN), patch);
    fixture.lookupFails = lookupFails === true;
    const response = await handleChat(request(ALLOWED, unknown ? UNKNOWN : TOKEN));
    expect({ denied: response.status >= 400, upstreamExecutions: fixture.executions }).toEqual({ denied: true, upstreamExecutions: 0 });
  });
});
