// U1d: sticky fallback TTL (default 5 min, fallback + round-robin).
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveStickyFallbackTtlMs,
  DEFAULT_STICKY_FALLBACK_TTL_MS,
} from "../../src/sse/services/auth.js";

const mocks = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getSettings: vi.fn(),
  updateProviderConnection: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: mocks.getProviderConnections,
  getSettings: mocks.getSettings,
  getProxyPools: vi.fn(),
  validateApiKey: vi.fn(),
  updateProviderConnection: mocks.updateProviderConnection,
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig,
  pickProxyPoolId: vi.fn(),
}));
vi.mock("@/shared/constants/providers.js", () => ({
  FREE_PROVIDERS: {},
  resolveProviderId: (provider) => provider,
}));
vi.mock("@/sse/utils/logger.js", () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn() }));

const { getProviderCredentials } = await import("@/sse/services/auth.js");

const T0 = new Date("2026-09-21T00:00:00.000Z").getTime();

function conn(id, extra = {}) {
  return {
    id, provider: "openai", authType: "apikey", name: id,
    apiKey: "sk-x", priority: id === "c1" ? 1 : 2, isActive: true, ...extra,
  };
}

describe("resolveStickyFallbackTtlMs", () => {
  it("defaults to 5 minutes", () => {
    expect(DEFAULT_STICKY_FALLBACK_TTL_MS).toBe(5 * 60 * 1000);
    expect(resolveStickyFallbackTtlMs({}, {})).toBe(5 * 60 * 1000);
  });
  it("global then override win; 0 disables; junk falls back", () => {
    expect(resolveStickyFallbackTtlMs({}, { stickyFallbackTtlMs: 60000 })).toBe(60000);
    expect(resolveStickyFallbackTtlMs({ stickyFallbackTtlMs: 1000 }, { stickyFallbackTtlMs: 60000 })).toBe(1000);
    expect(resolveStickyFallbackTtlMs({}, { stickyFallbackTtlMs: 0 })).toBe(0);
    expect(resolveStickyFallbackTtlMs({}, { stickyFallbackTtlMs: "nope" })).toBe(5 * 60 * 1000);
    expect(resolveStickyFallbackTtlMs({}, { stickyFallbackTtlMs: -5 })).toBe(5 * 60 * 1000);
  });
});

describe("sticky failover pin (fill-first)", () => {
  let store;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    store = { c1: conn("c1"), c2: conn("c2") };
    mocks.getSettings.mockResolvedValue({});
    mocks.resolveConnectionProxyConfig.mockResolvedValue({});
    mocks.getProviderConnections.mockImplementation(async () => Object.values(store));
    mocks.updateProviderConnection.mockImplementation(async (id, patch) => {
      store[id] = { ...store[id], ...patch };
      return store[id];
    });
  });

  it("failover pick stamps TTL; fresh request pins; expiry returns to priority", async () => {
    // c1 failed → failover to c2, stamp written
    const r1 = await getProviderCredentials("openai", new Set(["c1"]), null);
    expect(r1.connectionId).toBe("c2");
    expect(Date.parse(store.c2.failoverStickyUntil)).toBe(T0 + 5 * 60 * 1000);
    // Fresh request pins c2 (not priority-first c1)
    const r2 = await getProviderCredentials("openai", null, null);
    expect(r2.connectionId).toBe("c2");
    // After TTL expiry → back to priority c1
    vi.setSystemTime(T0 + 5 * 60 * 1000 + 1);
    const r3 = await getProviderCredentials("openai", null, null);
    expect(r3.connectionId).toBe("c1");
    vi.useRealTimers();
  });

  it("0 disables stickiness entirely", async () => {
    mocks.getSettings.mockResolvedValue({ stickyFallbackTtlMs: 0 });
    const r1 = await getProviderCredentials("openai", new Set(["c1"]), null);
    expect(r1.connectionId).toBe("c2");
    expect(store.c2.failoverStickyUntil).toBeUndefined();
    const r2 = await getProviderCredentials("openai", null, null);
    expect(r2.connectionId).toBe("c1");
    vi.useRealTimers();
  });

  it("per-provider override wins; newer failover supersedes", async () => {
    mocks.getSettings.mockResolvedValue({
      providerStrategies: { openai: { stickyFallbackTtlMs: 60000 } },
    });
    await getProviderCredentials("openai", new Set(["c1"]), null);
    expect(Date.parse(store.c2.failoverStickyUntil)).toBe(T0 + 60000);
    // c2 now fails → c1 stamped newer, wins the pin
    vi.setSystemTime(T0 + 10000);
    await getProviderCredentials("openai", new Set(["c2"]), null);
    expect(Date.parse(store.c1.failoverStickyUntil)).toBe(T0 + 70000);
    const r = await getProviderCredentials("openai", null, null);
    expect(r.connectionId).toBe("c1");
    vi.useRealTimers();
  });

  it("invalid stamp dates are ignored", async () => {
    store.c2.failoverStickyUntil = "not-a-date";
    const r = await getProviderCredentials("openai", null, null);
    expect(r.connectionId).toBe("c1");
    vi.useRealTimers();
  });
});
