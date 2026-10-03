// F12-API RED: global quota sort must precede pagination in GET /api/providers/client.
// 2+ providers, reset timestamps interleaved across providers, pageSize < set size.
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

import { getProviderConnections } from "../../src/lib/localDb.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";

function conn(id, provider, priority, name, isActive = true) {
  return {
    id,
    provider,
    authType: "oauth",
    name,
    email: `${id}@example.com`,
    priority,
    isActive,
    accessToken: `tok-${id}`,
  };
}

const FIXTURES = [
  conn("a1", "codex", 1, "Codex One"),
  conn("a2", "claude", 2, "Claude One"),
  conn("a3", "codex", 3, "Codex Two"),
  conn("a4", "claude", 4, "Claude Two"),
  conn("a5", "codex", 5, "Codex Zero", false),
];

// Resets interleaved across providers: a5(00h, inactive) < a2(01h) < a3(02h) < a1(05h); a4 invalid → last.
function usageFor(id) {
  const table = {
    a1: { quotas: { session: { used: 10, total: 100, remaining: 90, resetAt: "2030-01-01T05:00:00.000Z" } } },
    a2: { quotas: { "session (5h)": { used: 90, total: 100, remaining: 10, remainingPercentage: 10, resetAt: "2030-01-01T01:00:00.000Z" } } },
    a3: { quotas: { session: { used: 50, total: 100, remaining: 50, resetAt: "2030-01-01T02:00:00.000Z" } } },
    a4: { quotas: { "session (5h)": { used: 20, total: 100, remaining: 80, remainingPercentage: 80, resetAt: "not-a-date" } } },
    a5: { quotas: { session: { used: 99, total: 100, remaining: 1, resetAt: "2030-01-01T00:00:00.000Z" } } },
  };
  return table[id];
}

function get(path) {
  return new Request(`http://localhost${path}`);
}

beforeEach(async () => {
  vi.clearAllMocks();
  getProviderConnections.mockResolvedValue(FIXTURES);
  getUsageForProvider.mockImplementation(async (connection) => usageFor(connection.id));
  const quotaSort = await import("../../src/app/api/providers/client/quotaSort.js").catch(() => null);
  quotaSort?.clearQuotaSnapshotCache?.();
});

afterEach(() => {
  vi.resetModules();
});

describe("GET /api/providers/client global quota sort (F12-API)", () => {
  it("sort=expiring orders the COMPLETE set by reset, then paginates (page 1)", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?sort=expiring&page=1&pageSize=2"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.connections.map((c) => c.id)).toEqual(["a5", "a2"]);
    expect(body.pagination.total).toBe(5);
    expect(body.pagination.totalPages).toBe(3);
  });

  it("sort=expiring orders the COMPLETE set by reset, then paginates (page 2, invalid reset last)", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?sort=expiring&page=2&pageSize=2"));
    const body = await res.json();
    expect(body.connections.map((c) => c.id)).toEqual(["a3", "a1"]);
    const res3 = await GET(get("/api/providers/client?sort=expiring&page=3&pageSize=2"));
    const body3 = await res3.json();
    expect(body3.connections.map((c) => c.id)).toEqual(["a4"]);
  });

  it("sort=expiring applies provider + accountStatus filters FIRST", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?sort=expiring&provider=codex&accountStatus=active&page=1&pageSize=10"));
    const body = await res.json();
    expect(body.connections.map((c) => c.id)).toEqual(["a3", "a1"]);
    expect(body.pagination.total).toBe(2);
  });

  it("tie-break is stable: provider, then label, then id", async () => {
    getProviderConnections.mockResolvedValue([
      conn("z1", "codex", 1, "Zeta"),
      conn("a0", "codex", 2, "Alpha"),
      conn("m1", "claude", 3, "Mid"),
    ]);
    getUsageForProvider.mockImplementation(async () => ({
      quotas: { session: { used: 10, total: 100, resetAt: "2030-06-01T00:00:00.000Z" } },
    }));
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?sort=expiring&page=1&pageSize=10"));
    const body = await res.json();
    // claude < codex; within codex Alpha < Zeta.
    expect(body.connections.map((c) => c.id)).toEqual(["m1", "a0", "z1"]);
  });

  it("sort=remaining-desc sorts the COMPLETE set pre-pagination", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?sort=remaining-desc&page=1&pageSize=2"));
    const body = await res.json();
    // remaining%: a1=90, a4=80, a3=50, a2=10, a5=1.
    expect(body.connections.map((c) => c.id)).toEqual(["a1", "a4"]);
    expect(body.pagination.total).toBe(5);
  });

  it("default (no sort) behavior is unchanged and fetches no quota", async () => {
    const { GET } = await import("../../src/app/api/providers/client/route.js");
    const res = await GET(get("/api/providers/client?page=1&pageSize=2"));
    const body = await res.json();
    expect(body.connections.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(body.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(getUsageForProvider).not.toHaveBeenCalled();
  });
});
