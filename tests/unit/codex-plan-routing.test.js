// Codex plan routing.
//
// Production report: one codex provider carrying 6 free + 2 plus ChatGPT
// accounts. `gpt-6.1-sol` needs a paid plan, but account selection ignored
// `providerSpecificData.chatgptPlanType`, so the rotation kept handing the model
// to free accounts. They answered
//   400 {"detail":"The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account."}
// which cost a round trip per account and left a model lock on credentials that
// were never entitled to the model in the first place.
//
// Account selection now skips accounts whose plan cannot serve the model. The
// per-account rotation for that 400 already existed (P-SKIP in
// markAccountUnavailable) and is covered by account-modelscoped-skip.test.js.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCodexModelAllowedForPlan,
  isCodexPaidPlanModel,
} from "../../open-sse/config/codexPlans.js";
import { isClientFault, isModelScopedError } from "../../open-sse/services/accountFallback.js";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  updateProviderConnection: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getSettings: vi.fn(async () => ({})),
  getProxyPools: vi.fn(async () => []),
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
vi.mock("@/lib/disabledModelsDb", () => ({ getDisabledByProvider: vi.fn(async () => []) }));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
  pickProxyPoolId: vi.fn(() => null),
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const { getProviderCredentials } = await import("@/sse/services/auth.js");

const CODEX_ENTITLEMENT_400 =
  "[400]: {\"detail\":\"The 'gpt-6-sol' model is not supported when using Codex with a ChatGPT account.\",\"status\":400}";

function codexConn(id, plan, priority) {
  return {
    id,
    provider: "codex",
    authType: "oauth",
    name: id,
    isActive: true,
    priority,
    providerSpecificData: { chatgptPlanType: plan, chatgptAccountId: `acct-${id}` },
  };
}

// 6 free accounts sort ahead of the 2 paid ones — the exact production shape.
const FREE = [0, 1, 2, 3, 4, 5].map((i) => codexConn(`free-${i}`, "free", i + 1));
const PLUS = [6, 7].map((i) => codexConn(`plus-${i}`, "plus", i + 1));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProviderConnections.mockResolvedValue([...FREE, ...PLUS]);
  mocks.updateProviderConnection.mockResolvedValue({});
});

describe("codex plan → model eligibility", () => {
  it("blocks paid-plan models on a free plan", () => {
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", "free")).toBe(false);
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol[1m]", "free")).toBe(false);
    expect(isCodexModelAllowedForPlan("gpt-6-sol", "free")).toBe(false);
    expect(isCodexModelAllowedForPlan("gpt-6-astra", "free")).toBe(false);
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol-review", "free")).toBe(false);
  });

  it("allows the luna/terra families on a free plan", () => {
    expect(isCodexModelAllowedForPlan("gpt-6.1-luna", "free")).toBe(true);
    expect(isCodexModelAllowedForPlan("gpt-5.6-terra", "free")).toBe(true);
    expect(isCodexModelAllowedForPlan("gpt-5.6-terra[1m]", "free")).toBe(true);
  });

  it("allows paid-plan models on a paid plan", () => {
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", "plus")).toBe(true);
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", "PLUS")).toBe(true);
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", "pro")).toBe(true);
  });

  it("treats unknown plan metadata as allowed so imported accounts keep routing", () => {
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", null)).toBe(true);
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", undefined)).toBe(true);
    expect(isCodexModelAllowedForPlan("gpt-6.1-sol", "")).toBe(true);
  });

  it("flags paid-plan-only models for dashboard messaging", () => {
    expect(isCodexPaidPlanModel("gpt-6.1-sol")).toBe(true);
    expect(isCodexPaidPlanModel("gpt-6.1-luna")).toBe(false);
  });
});

describe("account selection honours the plan", () => {
  it("never picks a free account for a paid-plan model", async () => {
    const picked = await getProviderCredentials("codex", null, "gpt-6.1-sol");
    expect(picked).not.toBeNull();
    expect(picked.providerSpecificData.chatgptPlanType).toBe("plus");
    expect(picked.connectionId.startsWith("plus-")).toBe(true);
  });

  it("still uses free accounts for luna/terra models", async () => {
    const picked = await getProviderCredentials("codex", null, "gpt-6.1-luna");
    expect(picked).not.toBeNull();
    expect(picked.providerSpecificData.chatgptPlanType).toBe("free");
  });

  it("reports no eligible account when only free plans exist", async () => {
    mocks.getProviderConnections.mockResolvedValue(FREE);
    const picked = await getProviderCredentials("codex", null, "gpt-6.1-sol");
    expect(picked).toBeNull();
  });

  it("does not plan-filter providers other than codex", async () => {
    mocks.getProviderConnections.mockResolvedValue([
      { ...codexConn("grip-1", "free", 1), provider: "openai-compatible-chat-x", providerSpecificData: { prefix: "grip" } },
    ]);
    const picked = await getProviderCredentials("openai-compatible-chat-x", null, "gpt-6.1-sol");
    expect(picked).not.toBeNull();
    expect(picked.connectionId).toBe("grip-1");
  });
});

describe("the entitlement 400 keeps its existing account rotation path", () => {
  it("is still classified as a client fault at the classifier level, so only P-SKIP rotates it", () => {
    // The plan gate is the right fix; re-classifying this 400 globally would
    // also rotate on request-shaped text such as
    // "tool web_search is not supported when using streaming".
    expect(isClientFault(400, CODEX_ENTITLEMENT_400)).toBe(true);
    expect(isClientFault(400, "tool web_search is not supported when using streaming")).toBe(true);
  });

  it("is model-scoped, which is what drives the per-account lock and rotation", () => {
    expect(isModelScopedError(400, CODEX_ENTITLEMENT_400, "gpt-6-sol")).toBe(true);
  });
});
