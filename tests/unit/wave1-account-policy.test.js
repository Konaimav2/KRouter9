import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkFallbackError, isClientFault, isModelScopedError } from "../../open-sse/services/accountFallback.js";
import { handleComboChat } from "../../open-sse/services/combo.js";

const state = vi.hoisted(() => ({ error: "", status: 403, updates: vi.fn(), failures: vi.fn(), executions: 0 }));
vi.mock("open-sse/index.js", () => ({}));
vi.mock("@/lib/localDb", () => ({
  getCachedSettings: async () => ({ requireApiKey: false }), getSettings: async () => ({}),
  getCombos: async () => [], getComboByName: async () => null, getModelAliases: async () => ({}),
  getProviderNodes: async () => [], getProxyPools: async () => [], getApiKeyByKey: async () => null,
  validateApiKey: async () => false, updateProviderConnection: state.updates,
  getProviderConnections: async () => [{ id: "wave1-account", provider: "openai", isActive: true, testStatus: "active", providerSpecificData: {} }],
}));
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: async () => [] }));
vi.mock("@/lib/network/connectionProxy", () => ({ resolveConnectionProxyConfig: async () => ({}), pickProxyPoolId: () => null }));
vi.mock("@/sse/services/antigravityQuota.js", () => ({ getAntigravityQuotaCache: () => null, handleAntigravityQuotaError: async () => null, clearAntigravityStrikes: () => {} }));
vi.mock("@/sse/utils/logger.js", () => ({ maskKey: () => "masked", debug() {}, warn() {}, info() {}, error() {} }));
vi.mock("open-sse/utils/circuitBreaker.js", () => ({ circuitBreaker: { recordFailure: state.failures, recordSuccess() {} } }));
vi.mock("open-sse/handlers/chatCore.js", () => ({ handleChatCore: async () => {
  state.executions++;
  return { success: false, status: state.status, error: state.error, resetsAtMs: Date.now() + 60000,
    response: Response.json({ error: { message: state.error } }, { status: state.status }) };
} }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ updateProviderCredentials: async () => {}, checkAndRefreshToken: async (_p, c) => c }));
vi.mock("open-sse/services/projectId.js", () => ({ getProjectIdForConnection: async () => null }));
vi.mock("open-sse/handlers/chatCore/requestDetail.js", () => ({ saveRequestError() {} }));
vi.mock("@/lib/db/repos/responseCacheRepo.js", () => ({ getResponseCacheEntry: async () => null, setResponseCacheEntry: async () => {} }));
vi.mock("@/lib/budget.js", () => ({ reserveBudget: async () => { throw new Error("Unexpected budget access"); } }));
vi.mock("@/lib/headroom/detect", () => ({ DEFAULT_HEADROOM_URL: "http://fixture.invalid" }));
vi.mock("@/lib/pxpipe/loader.js", () => ({ getTransform: async () => null }));
vi.mock("@/lib/pxpipe/events.js", () => ({ appendPxpipeEvent() {} }));
const { handleChat } = await import("@/sse/handlers/chat.js");
const { markAccountUnavailable } = await import("@/sse/services/auth.js");

beforeEach(() => { vi.clearAllMocks(); state.executions = 0; });
const signals = ["CYBER_POLICY", "Content_Policy_Violation", "CONTENT POLICY", "Blocked By Policy", "Safety Policy", "REFUSAL"];

describe("A request-scoped content policy", () => {
  it.each(signals)("does not rotate or cool down %s even on 5xx", (signal) => {
    expect(checkFallbackError(503, { error: { message: signal } })).toMatchObject({ shouldFallback: false, cooldownMs: 0 });
    expect(isClientFault(503, signal)).toBe(true);
    expect(isModelScopedError(400, `${signal}: model not found`)).toBe(false);
  });
  it.each(signals)("chat preserves %s without cooldown, breaker failure or retry (even with reset hints)", async (signal) => {
    state.error = signal; state.status = 403;
    const response = await handleChat(new Request("http://fixture.invalid/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/wave1-model", stream: false, messages: [{ role: "user", content: "fixture" }] }),
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toBe(signal);
    expect(state.executions).toBe(1);
    expect(state.updates).not.toHaveBeenCalled();
    expect(state.failures).not.toHaveBeenCalled();
  });
});

describe("B persistent refusals", () => {
  it("does not model-lock a 410 on the account path", async () => {
    expect(await markAccountUnavailable("wave1-account", 410, "model not found: wave1-model", "openai", "wave1-model")).toMatchObject({ shouldFallback: false, cooldownMs: 0 });
    expect(state.updates).not.toHaveBeenCalled();
  });
  it.each(["model not found", "quota exceeded", "timeout"])("410 %s never retries", async (message) => {
    expect(checkFallbackError(410, message)).toEqual({ shouldFallback: false, cooldownMs: 0 });
    const handleSingleModel = vi.fn(async () => Response.json({ error: { message } }, { status: 410 }));
    const response = await handleComboChat({ body: { stream: false }, models: ["openai/first", "openai/second"], handleSingleModel, log: { info() {}, warn() {} }, comboStrategy: "fallback" });
    expect(response.status).toBe(410);
    expect(handleSingleModel).toHaveBeenCalledTimes(1);
  });
  it.each(["Permission denied", "PERMISSION_DENIED", "Access denied by policy", "Policy denial"])("403 %s does not cool down", (message) => {
    expect(checkFallbackError(403, message)).toEqual({ shouldFallback: false, cooldownMs: 0 });
  });
  it.each([[410, "model not found"], [403, "Permission denied"]])("chat preserves persistent %s without cooldown or rotation", async (status, error) => {
    state.error = error; state.status = status;
    const response = await handleChat(new Request("http://fixture.invalid/v1/chat/completions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openai/wave1-model", stream: false, messages: [{ role: "user", content: "fixture" }] }),
    }));
    expect(response.status).toBe(status);
    expect(state.executions).toBe(1);
    expect(state.updates).not.toHaveBeenCalled();
    expect(state.failures).not.toHaveBeenCalled();
  });
  it.each(["quota exceeded", "insufficient quota", "billing required", "invalid api key", "not eligible", "validation_required", "permission denied: quota exceeded", "policy denial: insufficient balance", "permission denied: billing"])("403 %s retains account fallback", (message) => {
    expect(checkFallbackError(403, message).shouldFallback).toBe(true);
    expect(checkFallbackError(403, message).cooldownMs).toBeGreaterThan(0);
  });
});
