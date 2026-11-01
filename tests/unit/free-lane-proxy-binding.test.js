import { describe, it, expect, beforeEach, vi } from "vitest";

// Q3 / FR-3 — the OpenCode free lane must egress through its bound proxy pool or not at
// all. A silent direct fallback would expose the server's own IP, so every failure path
// has to be a refusal that names the pool and the members tried.

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getProxyPools: vi.fn(),
  getProviderConnections: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
  pickProxyPoolId: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getSettings: mocks.getSettings,
  getProxyPools: mocks.getProxyPools,
  updateProviderConnection: vi.fn(),
  validateApiKey: vi.fn(),
}));

vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledByProvider: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig,
  pickProxyPoolId: mocks.pickProxyPoolId,
}));

const { getProviderCredentials } = await import("@/sse/services/auth.js");

const FREE_LANE = "opencode";
const POOL = { id: "pool-1", name: "Relay A", proxyUrl: "http://10.0.0.5:8080", isActive: true };

const DIRECT = {
  source: "none",
  connectionProxyEnabled: false,
  connectionProxyUrl: "",
  connectionNoProxy: "",
  proxyPoolId: null,
  vercelRelayUrl: "",
};

const VIA_POOL = {
  source: "pool",
  connectionProxyEnabled: true,
  connectionProxyUrl: "http://10.0.0.5:8080",
  connectionNoProxy: "",
  proxyPoolId: "pool-1",
  vercelRelayUrl: "",
};

describe("free lane proxy binding (Q3 / FR-3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProviderConnections.mockResolvedValue([]);
    mocks.getProxyPools.mockResolvedValue([POOL]);
    mocks.pickProxyPoolId.mockReturnValue("pool-1");
    mocks.resolveConnectionProxyConfig.mockResolvedValue(VIA_POOL);
  });

  it("egresses through the bound pool", async () => {
    mocks.getSettings.mockResolvedValue({
      providerStrategies: { [FREE_LANE]: { proxyPoolId: "pool-1" } },
    });

    const credentials = await getProviderCredentials(FREE_LANE, null, "any-model");

    expect(credentials.allRateLimited).toBeUndefined();
    expect(credentials.providerSpecificData.connectionProxyUrl).toBe("http://10.0.0.5:8080");
    expect(mocks.resolveConnectionProxyConfig).toHaveBeenCalledWith({ proxyPoolId: "pool-1" });
  });

  it("refuses direct egress when the bound pool cannot be resolved", async () => {
    mocks.getSettings.mockResolvedValue({
      providerStrategies: { [FREE_LANE]: { proxyPoolId: "pool-gone" } },
    });
    mocks.resolveConnectionProxyConfig.mockResolvedValue(DIRECT);

    const credentials = await getProviderCredentials(FREE_LANE, null, "any-model");

    expect(credentials.allRateLimited).toBe(true);
    expect(credentials.lastError).toContain("Refusing direct egress");
    expect(credentials.lastError).toContain("tried:");
    expect(credentials.lastError).toContain("pool-gone");
    // The refusal must not hand back a usable direct connection.
    expect(credentials.providerSpecificData.connectionProxyUrl).toBeUndefined();
  });

  it("refuses when rotation is enabled but no pool is usable", async () => {
    mocks.getSettings.mockResolvedValue({
      providerStrategies: { [FREE_LANE]: { rotateStrategy: "round-robin" } },
    });
    mocks.getProxyPools.mockResolvedValue([]);
    mocks.pickProxyPoolId.mockReturnValue(null);

    const credentials = await getProviderCredentials(FREE_LANE, null, "any-model");

    expect(credentials.allRateLimited).toBe(true);
    expect(credentials.lastError).toContain("no usable member is available");
    expect(credentials.lastError).toContain("Refusing direct egress");
  });

  it("names every member tried when the pool list is exhausted", async () => {
    mocks.getSettings.mockResolvedValue({
      providerStrategies: { [FREE_LANE]: { rotateStrategy: "random" } },
    });
    mocks.getProxyPools.mockResolvedValue([
      { id: "pool-a", name: "Relay A", proxyUrl: "", isActive: true },
      { id: "pool-b", name: "Relay B", proxyUrl: "", isActive: true },
    ]);
    mocks.pickProxyPoolId.mockReturnValue(null);

    const credentials = await getProviderCredentials(FREE_LANE, null, "any-model");

    expect(credentials.lastError).toContain("Relay A → Relay B");
  });

  it("allows direct egress only when the operator chose None (direct)", async () => {
    mocks.getSettings.mockResolvedValue({ providerStrategies: {} });
    mocks.resolveConnectionProxyConfig.mockResolvedValue(DIRECT);

    const credentials = await getProviderCredentials(FREE_LANE, null, "any-model");

    expect(credentials.allRateLimited).toBeUndefined();
    expect(credentials.accessToken).toBe("public");
    expect(credentials.providerSpecificData.connectionProxyUrl).toBe("");
    expect(mocks.resolveConnectionProxyConfig).toHaveBeenCalledWith({ proxyPoolId: "" });
  });
});
