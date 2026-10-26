import { describe, it, expect, beforeEach, vi } from "vitest";

// Provider cards render `connection.lastError` verbatim. When a handler passed an
// empty/non-string error, auth.js wrote the literal "Provider error", so almost every
// failing provider showed the same contentless message and the real cause was lost.

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getSettings: vi.fn(),
  getProxyPools: vi.fn(),
  updateProviderConnection: vi.fn(),
  validateApiKey: vi.fn(),
  getDisabledByProvider: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getSettings: mocks.getSettings,
  getProxyPools: mocks.getProxyPools,
  updateProviderConnection: mocks.updateProviderConnection,
  validateApiKey: mocks.validateApiKey,
}));

vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledByProvider: mocks.getDisabledByProvider,
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: vi.fn().mockResolvedValue({
    connectionProxyEnabled: false,
    connectionProxyUrl: "",
    connectionNoProxy: "",
    proxyPoolId: null,
    vercelRelayUrl: "",
    source: "none",
  }),
  pickProxyPoolId: vi.fn(),
}));

const { markAccountUnavailable } = await import("@/sse/services/auth.js");

const CONNECTION = { id: "conn-1", provider: "codex", name: "one", backoffLevel: 0 };

function writtenReason() {
  const call = mocks.updateProviderConnection.mock.calls.at(-1);
  return call?.[1]?.lastError;
}

describe("connection lock reason is always informative", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderConnections.mockResolvedValue([{ ...CONNECTION }]);
    mocks.getSettings.mockResolvedValue({});
    mocks.getProxyPools.mockResolvedValue([]);
    mocks.getDisabledByProvider.mockResolvedValue([]);
  });

  it("never writes the contentless 'Provider error'", async () => {
    await markAccountUnavailable("conn-1", 500, undefined, "codex", "gpt-6.1-sol");
    expect(writtenReason()).toBe("Upstream error 500");
    expect(writtenReason()).not.toBe("Provider error");
  });

  it("keeps the status when the error text is blank", async () => {
    await markAccountUnavailable("conn-1", 429, "   ", "codex", "gpt-6.1-sol");
    expect(writtenReason()).toBe("Upstream error 429");
  });

  it("prefers the message on an error-like object", async () => {
    await markAccountUnavailable("conn-1", 502, { message: "quota exceeded" }, "codex", "gpt-6.1-sol");
    expect(writtenReason()).toBe("quota exceeded");
  });

  it("keeps a real upstream message and bounds it", async () => {
    const long = "x".repeat(300);
    await markAccountUnavailable("conn-1", 500, long, "codex", "gpt-6.1-sol");
    expect(writtenReason()).toHaveLength(100);
    expect(writtenReason()).toBe("x".repeat(100));
  });

  it("holds an entitlement error for a day instead of five minutes", async () => {
    // Real production body: this account can never serve the model, so a short cooldown
    // guarantees the next request pays the same rejected round trip.
    const entitlement = JSON.stringify({
      detail: "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.",
      error: { type: "invalid_request_error", code: "model_not_found", message: "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account." },
    });

    const before = Date.now();
    await markAccountUnavailable("conn-1", 400, entitlement, "codex", "gpt-6.1-sol");

    const patch = mocks.updateProviderConnection.mock.calls.at(-1)?.[1] || {};
    const lock = patch["modelLock_gpt-6.1-sol"];
    expect(lock).toBeTruthy();
    expect(new Date(lock).getTime() - before).toBeGreaterThan(23 * 60 * 60 * 1000);
  });
});

describe("card display of legacy lock reasons", () => {
  it("replaces the stored placeholder with the status", async () => {
    const { displayConnectionError } = await import("@/shared/utils/errorClass.js");
    expect(displayConnectionError({ lastError: "Provider error", errorCode: 429 })).toBe("Upstream error 429");
  });

  it("leaves real messages untouched", async () => {
    const { displayConnectionError } = await import("@/shared/utils/errorClass.js");
    expect(displayConnectionError({ lastError: "quota exceeded", errorCode: 429 })).toBe("quota exceeded");
  });

  it("is empty when there is nothing to show", async () => {
    const { displayConnectionError } = await import("@/shared/utils/errorClass.js");
    expect(displayConnectionError({})).toBe("");
  });
});
