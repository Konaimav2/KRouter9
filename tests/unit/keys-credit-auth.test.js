import { describe, it, expect, vi, beforeEach } from "vitest";

const state = {
  sessionOk: false,
  cliToken: null,
  machineId: "machine-id",
  rlOk: true,
  retryAfterSec: 30,
  db: null,
};

vi.mock("@/lib/db/driver.js", () => ({
  getAdapter: vi.fn(async () => state.db),
}));

vi.mock("@/lib/proxyRevealGuard.js", () => ({
  hasValidDashboardSession: vi.fn(async () => state.sessionOk),
  REVEAL_NO_STORE_HEADERS: { "Cache-Control": "no-store" },
}));

vi.mock("@/shared/utils/machineId", () => ({
  getConsistentMachineId: vi.fn(async () => state.machineId),
}));

vi.mock("@/lib/auth/loginLimiter.js", () => ({
  getClientIp: vi.fn(() => "1.2.3.4"),
}));

vi.mock("@/lib/revealRateLimit.js", () => ({
  checkRevealRateLimit: vi.fn(() => (state.rlOk ? { ok: true } : { ok: false, retryAfterSec: state.retryAfterSec })),
}));

function makeDb() {
  const row = { id: "k1", name: "k", creditLimit: 100, usageCost: 10, usageTokens: 5, quotaLimit: 1000, rateLimit: 60 };
  return {
    row,
    runCalls: [],
    get(sql, params) {
      if (String(sql).startsWith("SELECT *")) return { ...this.row };
      if (String(sql).startsWith("SELECT id")) return { ...this.row };
      return null;
    },
    run(sql, params) {
      this.runCalls.push([sql, params]);
      if (sql.includes("creditLimit = COALESCE")) this.row.creditLimit = (this.row.creditLimit || 0) + params[0];
      if (sql.includes("rateLimit = ?")) this.row.rateLimit = params[params.length - 2] ?? this.row.rateLimit;
      return {};
    },
  };
}

import { POST, GET } from "@/app/api/keys/[id]/credit/route.js";

function req(body, { cliToken = null } = {}) {
  return {
    json: async () => body,
    headers: { get: (k) => (String(k).toLowerCase() === "x-9r-cli-token" ? cliToken : null) },
    url: "http://localhost/api/keys/k1/credit",
  };
}
const ctx = () => ({ params: Promise.resolve({ id: "k1" }) });

describe("keys credit strict auth + validation + throttling", () => {
  beforeEach(() => {
    state.sessionOk = false;
    state.cliToken = null;
    state.rlOk = true;
    state.machineId = "machine-id";
    state.db = makeDb();
    vi.clearAllMocks();
  });

  it("RED regression: anonymous credit-zeroing is rejected (401)", async () => {
    const res = await POST(req({ amount: -100 }), ctx());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(state.db.runCalls).toHaveLength(0);
  });

  it("CLI token auth allows credit add (single atomic UPDATE)", async () => {
    const res = await POST(req({ amount: 25 }, { cliToken: "machine-id" }), ctx());
    expect(res.status).toBe(200);
    expect(state.db.runCalls).toHaveLength(1);
    const body = await res.json();
    expect(body.creditLimit).toBe(125);
  });

  it("dashboard session auth allows the mutation", async () => {
    state.sessionOk = true;
    const res = await POST(req({ amount: 5 }), ctx());
    expect(res.status).toBe(200);
    expect(state.db.runCalls).toHaveLength(1);
  });

  it("validation: non-numeric amount rejected (400, no write)", async () => {
    state.sessionOk = true;
    const res = await POST(req({ amount: "lots" }), ctx());
    expect(res.status).toBe(400);
    expect(state.db.runCalls).toHaveLength(0);
  });

  it("validation: negative rateLimit rejected (400, no write)", async () => {
    state.sessionOk = true;
    const res = await POST(req({ rateLimit: -1 }), ctx());
    expect(res.status).toBe(400);
    expect(state.db.runCalls).toHaveLength(0);
  });

  it("validation: bad allowedModels rejected (400, no write)", async () => {
    state.sessionOk = true;
    const res = await POST(req({ allowedModels: [123] }), ctx());
    expect(res.status).toBe(400);
    expect(state.db.runCalls).toHaveLength(0);
  });

  it("validation: empty body rejected (400, no write)", async () => {
    state.sessionOk = true;
    const res = await POST(req({}), ctx());
    expect(res.status).toBe(400);
    expect(state.db.runCalls).toHaveLength(0);
  });

  it("throttling: rate-limited authed caller gets 429 + Retry-After + no-store, no write", async () => {
    state.sessionOk = true;
    state.rlOk = false;
    const res = await POST(req({ amount: 1 }), ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(state.db.runCalls).toHaveLength(0);
  });

  it("denials carry no-store; GET stays a metadata balance read", async () => {
    const denied = await POST(req({ amount: -100 }), ctx());
    expect(denied.headers.get("Cache-Control")).toBe("no-store");
    const get = await GET(req({}), ctx());
    expect(get.status).toBe(200);
    const body = await get.json();
    expect(body.remaining).toBe(90);
  });
});
