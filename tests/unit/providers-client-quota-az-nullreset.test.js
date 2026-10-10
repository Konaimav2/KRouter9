// Wave C-api RED: quota default sort A-Z + null-reset rule (server + client).
// Must FAIL on pre-wave code (default=priority, nulls undifferentiated).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.setConfig({ testTimeout: 60000 });

vi.mock("../../src/lib/localDb.js", () => ({
  getProviderConnections: vi.fn(),
}));
vi.mock("../../src/lib/oauth/providers/index.js", () => ({
  backfillCodexEmails: vi.fn(async () => {}),
}));
vi.mock("../../src/lib/network/connectionProxy.js", () => ({
  resolveConnectionProxyConfig: vi.fn(async () => ({})),
}));
vi.mock("../../open-sse/services/usage.js", () => ({
  getUsageForProvider: vi.fn(),
}));
vi.mock("open-sse/config/providerModels.js", () => ({
  getModelsByProviderId: () => [],
}));

import { getProviderConnections } from "../../src/lib/localDb.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";
import { sortVisibleConnections } from "../../src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

function conn(id, provider, priority, name) {
  return {
    id,
    provider,
    authType: "oauth",
    name,
    email: `${id}@example.com`,
    priority,
    isActive: true,
    accessToken: `tok-${id}`,
  };
}

function get(path) {
  return new Request(`http://localhost${path}`);
}

beforeEach(async () => {
  vi.clearAllMocks();
  const quotaSort = await import("../../src/app/api/providers/client/quotaSort.js").catch(() => null);
  quotaSort?.clearQuotaSnapshotCache?.();
});

afterEach(() => {
  vi.resetModules();
});

describe("C-api server: default + name sort is A-Z (global, pre-pagination)", () => {
  const AZ = [
    conn("c1", "codex", 1, "Zulu"),
    conn("c2", "claude", 2, "Alpha"),
    conn("c3", "codex", 3, "Mike"),
  ];
  beforeEach(() => {
    getProviderConnections.mockResolvedValue(AZ);
  });

  it("default (no sort param) orders A-Z by account label", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?page=1&pageSize=10"));
    const body = await res.json();
    expect(body.connections.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("sort=name orders A-Z pre-pagination and is stable across pages", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const p1 = await (await GET(get("/api/providers/client?sort=name&page=1&pageSize=2"))).json();
    expect(p1.connections.map((c) => c.id)).toEqual(["c2", "c3"]);
    const p2 = await (await GET(get("/api/providers/client?sort=name&page=2&pageSize=2"))).json();
    expect(p2.connections.map((c) => c.id)).toEqual(["c1"]);
    expect(p1.pagination.total).toBe(3);
  });

  it("sort=name fetches no quota (non-quota sort, cache behavior unchanged)", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    await GET(get("/api/providers/client?sort=name&page=1&pageSize=10"));
    expect(getUsageForProvider).not.toHaveBeenCalled();
  });
});

describe("C-api server: expiring null-reset rule (valid -> null+remaining -> null-zero)", () => {
  const ROWS = [
    conn("v1", "codex", 1, "Valid Early"),
    conn("z1", "codex", 2, "Zed Remaining"),
    conn("b0", "codex", 3, "Beta NoQuota"),
    conn("a0", "codex", 4, "Alpha Zero"),
    conn("m9", "codex", 5, "Mid Invalid"),
  ];
  // Labels deliberately pit tie-break (Alpha first) against the rule (Alpha Zero last).
  function usageFor(id) {
    const table = {
      v1: { quotas: { session: { used: 90, total: 100, remaining: 10, resetAt: "2030-01-01T01:00:00.000Z" } } },
      z1: { quotas: { session: { used: 50, total: 100, remaining: 50, resetAt: null } } },
      b0: { quotas: { session: { used: 0, total: 0, remaining: 0, resetAt: null } } },
      a0: { quotas: { session: { used: 100, total: 100, remaining: 0, resetAt: null } } },
      m9: { quotas: { session: { used: 10, total: 100, remaining: 90, resetAt: "not-a-date" } } },
    };
    return table[id];
  }
  beforeEach(() => {
    getProviderConnections.mockResolvedValue(ROWS);
    getUsageForProvider.mockImplementation(async (c) => usageFor(c.id));
  });

  it("sort=expiring: valid-by-time, then null-with-remaining (total:0 = no quota), null-zero last", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const body = await (await GET(get("/api/providers/client?sort=expiring&page=1&pageSize=10"))).json();
    expect(body.connections.map((c) => c.id)).toEqual(["v1", "b0", "m9", "z1", "a0"]);
  });
});

describe("C-api server: expiring remains opt-in (guard, green pre/post)", () => {
  it("sort=expiring still orders valid resets by time", async () => {
    getProviderConnections.mockResolvedValue([
      conn("s1", "codex", 1, "Slow"),
      conn("f1", "codex", 2, "Fast"),
    ]);
    getUsageForProvider.mockImplementation(async (c) => (c.id === "f1"
      ? { quotas: { session: { used: 1, total: 10, remaining: 9, resetAt: "2030-01-01T01:00:00.000Z" } } }
      : { quotas: { session: { used: 1, total: 10, remaining: 9, resetAt: "2030-01-01T05:00:00.000Z" } } }));
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const body = await (await GET(get("/api/providers/client?sort=expiring&page=1&pageSize=10"))).json();
    expect(body.connections.map((c) => c.id)).toEqual(["f1", "s1"]);
  });
});

describe("C-api client: sortVisibleConnections mirrors A-Z default + null-reset rule", () => {
  const C = (id, provider, name) => ({ id, provider, name });

  it("default (expiringFirst=false) orders A-Z by label", () => {
    const conns = [C("c1", "codex", "Zulu"), C("c2", "claude", "Alpha"), C("c3", "codex", "Mike")];
    const out = sortVisibleConnections(conns, {}, false, "all", "default");
    expect(out.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("expiring: valid -> null-with-remaining (total:0 = no quota) -> null-zero last", () => {
    const conns = [C("a", "codex", "Alpha"), C("b", "codex", "Beta"), C("z", "codex", "Zed"), C("v", "codex", "Valid")];
    const quotaData = {
      v: { quotas: [{ used: 90, total: 100, remaining: 10, resetAt: "2030-01-01T01:00:00.000Z" }] },
      z: { quotas: [{ used: 50, total: 100, remaining: 50, resetAt: null }] },
      b: { quotas: [{ used: 0, total: 0, remaining: 0, resetAt: null }] },
      a: { quotas: [{ used: 100, total: 100, remaining: 0, resetAt: null }] },
    };
    const out = sortVisibleConnections(conns, quotaData, true, "all", "default");
    expect(out.map((c) => c.id)).toEqual(["v", "b", "z", "a"]);
  });
});
