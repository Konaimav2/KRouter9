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
    expect(res.cooldownMs).toBe(MODEL_SCOPED_LOCK_MS);
    const write = mocks.updateProviderConnection.mock.calls[0][1];
    expect(write["modelLock_gpt-5.6-sol"]).toBeDefined();
    expect(new Date(write["modelLock_gpt-5.6-sol"]).getTime()).toBeGreaterThan(Date.now());
  });

  it("still returns no-fallback for genuine request faults", async () => {
    const res = await markAccountUnavailable("c1", 400, "maximum context length exceeded", "codex", "gpt-5.6-sol");
    expect(res.shouldFallback).toBe(false);
    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
  });
});
