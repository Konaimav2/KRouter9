// Account rotation must skip accounts that cannot serve the model: a model-scoped
// 4xx ("not supported when using Codex with a ChatGPT account") is per-account,
// so the next account (different plan) may succeed. Papi: 8 codex accounts, first
// hit ChatGPT-plan -> immediate 400, no rotation.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MODEL_SCOPED_LOCK_MS } from "../../open-sse/services/accountFallback.js";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
  updateProviderConnection: mocks.updateProviderConnection,
  getCombos: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => ({})),
  getCustomModels: vi.fn(async () => []),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const { markAccountUnavailable } = await import("@/sse/services/auth.js");

const CODEX_MSG =
  "[400]: {\"detail\":\"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account.\"}";

function codexConn(id) {
  return { id, provider: "codex", authType: "apikey", name: id, apiKey: "sk-x", isActive: true };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProviderConnections.mockResolvedValue([codexConn("c1"), codexConn("c2")]);
  mocks.updateProviderConnection.mockResolvedValue({});
});

describe("markAccountUnavailable — model-scoped 4xx rotates accounts", () => {
  it("falls back + model-locks the account on entitlement 400", async () => {
    const res = await markAccountUnavailable("c1", 400, CODEX_MSG, "codex", "gpt-5.6-sol");
    expect(res.shouldFallback).toBe(true);
    // Entitlement errors are permanent for the account: hold the model for a day, because
    // a 5-minute cooldown just makes the next request pay the same rejected round trip.
    expect(res.cooldownMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    const write = mocks.updateProviderConnection.mock.calls[0][1];
    expect(write["modelLock_gpt-5.6-sol"]).toBeDefined();
    expect(new Date(write["modelLock_gpt-5.6-sol"]).getTime()).toBeGreaterThan(Date.now());
  });

  it("still returns no-fallback for genuine request faults", async () => {
    const res = await markAccountUnavailable("c1", 400, "maximum context length exceeded", "codex", "gpt-5.6-sol");
    expect(res.shouldFallback).toBe(false);
    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
  });

  it("does not lock on scoped phrasing that names no model (request-controlled 400)", async () => {
    const res = await markAccountUnavailable("c1", 400, "tool web_search is not supported when using streaming", "codex", "gpt-5.6-sol");
    expect(res.shouldFallback).toBe(false);
    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
  });
});

// Production shape: the upstream names the model FAMILY, not the exact id.
// Asking Codex for `gpt-6.1-sol` on an unentitled ChatGPT plan answers
// `The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.`
// An exact-id anchor missed that, the 400 was read as a client fault, no other
// account was tried, and one wrong-plan credential failed the whole provider —
// which is what broke subagent dispatch through the gateway.
const FAMILY_MSG =
  "[400]: {\"detail\":\"The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.\",\"status\":400}";

describe("model-scoped anchor accepts the family name", () => {
  it("rotates for gpt-6.1-sol when the text says gpt-6-sol", async () => {
    const res = await markAccountUnavailable("c1", 400, FAMILY_MSG, "codex", "gpt-6.1-sol");
    expect(res.shouldFallback).toBe(true);
    expect(res.cooldownMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    const write = mocks.updateProviderConnection.mock.calls[0][1];
    expect(write["modelLock_gpt-6.1-sol"]).toBeDefined();
  });

  it("still locks the requested model id, not the family name from the text", async () => {
    await markAccountUnavailable("c1", 400, FAMILY_MSG, "codex", "gpt-6.1-sol[1m]");
    const write = mocks.updateProviderConnection.mock.calls[0][1];
    expect(Object.keys(write).some((k) => k.startsWith("modelLock_"))).toBe(true);
    expect(write["modelLock_gpt-6-sol"]).toBeUndefined();
  });

  it("still refuses request-shaped text that names no model", async () => {
    const res = await markAccountUnavailable(
      "c1", 400, "tool web_search is not supported when using streaming", "codex", "gpt-6.1-sol"
    );
    expect(res.shouldFallback).toBe(false);
    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
  });

  it("still refuses an unrelated model family", async () => {
    const res = await markAccountUnavailable(
      "c1", 400, "The 'claude-opus-5' model is not supported when using this endpoint.", "codex", "gpt-6.1-sol"
    );
    expect(res.shouldFallback).toBe(false);
  });
});
