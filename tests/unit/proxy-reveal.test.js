import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// Isolate the audit-log file target before any src module evaluates DATA_DIR.
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
const ORIGINAL_PEER_TOKEN = process.env.NINEROUTER_PEER_TOKEN;
const TMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kr9-proxy-reveal-"));
process.env.DATA_DIR = TMP_DATA_DIR;

const PEER_TOKEN = "proxy-reveal-test-peer-token";
const CLI_TOKEN = "proxy-reveal-cli-token-fixture";

const mocks = vi.hoisted(() => ({
  verifyDashboardAuthToken: vi.fn(),
  getConsistentMachineId: vi.fn(),
}));

// Route-import precedent: tests/unit/provider-test-models-routing.test.js and
// tests/unit/compatible-provider-connections.test.js mock next/server so route
// modules load without a Next server. @/models + provider constants are mocked
// so no DB is touched; only the pure normalizeProxyConfig export is used.
vi.mock("next/server", () => ({
  NextResponse: {
    json(body, init = {}) {
      return new Response(JSON.stringify(body), {
        status: init.status || 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  },
}));

vi.mock("@/lib/auth/dashboardSession.js", () => ({
  verifyDashboardAuthToken: mocks.verifyDashboardAuthToken,
}));

vi.mock("@/shared/utils/machineId.js", () => ({
  getConsistentMachineId: mocks.getConsistentMachineId,
}));

vi.mock("@/models", () => ({
  getProviderConnectionById: vi.fn(),
  getProxyPoolById: vi.fn(),
  updateProviderConnection: vi.fn(),
  deleteProviderConnection: vi.fn(),
}));

vi.mock("@/shared/constants/providers", () => ({
  isOpenAICompatibleProvider: () => false,
  isAnthropicCompatibleProvider: () => false,
  isCustomEmbeddingProvider: () => false,
}));

// Pure-helper imports only: guard (auth deps mocked above), rate limiter,
// mask, audit shapes, and the pure normalizeProxyConfig from the [id] route.
const { authorizeProxyReveal, REVEAL_NO_STORE_HEADERS } = await import(
  "../../src/lib/proxyRevealGuard.js"
);
const {
  checkRevealRateLimit,
  resetRevealRateLimits,
  REVEAL_RATE_LIMIT,
  REVEAL_RATE_WINDOW_MS,
} = await import("../../src/lib/revealRateLimit.js");
const { maskProxyUrl, sanitizeConnectionForBrowser } = await import(
  "../../src/lib/proxyMask.js"
);
const { appendAuditEvent, getRecentAuditEvents, resetAuditEvents } = await import(
  "../../src/lib/auditLog.js"
);
const { normalizeProxyConfig } = await import(
  "../../src/app/api/providers/[id]/route.js"
);

function revealRequest({ confirm = true, cookie = null, cliToken = null, ip = null } = {}) {
  const url = confirm
    ? "http://localhost/api/providers/conn-1/reveal?confirm=true"
    : "http://localhost/api/providers/conn-1/reveal";
  const headers = {};
  if (cookie) headers.cookie = `auth_token=${encodeURIComponent(cookie)}`;
  if (cliToken) headers["x-9r-cli-token"] = cliToken;
  if (ip) {
    headers["x-9r-peer-token"] = PEER_TOKEN;
    headers["x-9r-real-ip"] = ip;
  }
  return new Request(url, { headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRevealRateLimits();
  process.env.NINEROUTER_PEER_TOKEN = PEER_TOKEN;
  mocks.getConsistentMachineId.mockResolvedValue(CLI_TOKEN);
  mocks.verifyDashboardAuthToken.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("authorizeProxyReveal guard (route dependency)", () => {
  it("rejects missing confirm with 400 even when authed", async () => {
    mocks.verifyDashboardAuthToken.mockResolvedValue(true);
    const res = await authorizeProxyReveal(
      revealRequest({ confirm: false, cookie: "session-jwt" })
    );
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/confirm/);
  });

  it("rejects non-true confirm values with 400", async () => {
    mocks.verifyDashboardAuthToken.mockResolvedValue(true);
    const req = new Request(
      "http://localhost/api/providers/conn-1/reveal?confirm=1",
      { headers: { cookie: "auth_token=session-jwt" } }
    );
    const res = await authorizeProxyReveal(req);
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated reveal with 401", async () => {
    const res = await authorizeProxyReveal(revealRequest());
    expect(res.status).toBe(401);
    expect(res.error).toBe("Unauthorized");
  });

  it("rejects a wrong CLI token with 401", async () => {
    const res = await authorizeProxyReveal(revealRequest({ cliToken: "wrong" }));
    expect(res.status).toBe(401);
  });

  it("accepts a valid dashboard session", async () => {
    mocks.verifyDashboardAuthToken.mockResolvedValue(true);
    const res = await authorizeProxyReveal(revealRequest({ cookie: "session-jwt" }));
    expect(res.error).toBeUndefined();
    expect(res.ip).toBe("unknown");
    expect(mocks.verifyDashboardAuthToken).toHaveBeenCalledWith("session-jwt");
  });

  it("accepts a valid CLI token", async () => {
    const res = await authorizeProxyReveal(revealRequest({ cliToken: CLI_TOKEN }));
    expect(res.error).toBeUndefined();
    expect(res.ip).toBeDefined();
  });

  it("rate-limits a burst with 429 + numeric retryAfter", async () => {
    mocks.verifyDashboardAuthToken.mockResolvedValue(true);
    const ip = "10.9.9.1";
    for (let i = 0; i < REVEAL_RATE_LIMIT; i++) {
      const res = await authorizeProxyReveal(
        revealRequest({ cookie: "session-jwt", ip })
      );
      expect(res.error).toBeUndefined();
    }
    const blocked = await authorizeProxyReveal(
      revealRequest({ cookie: "session-jwt", ip })
    );
    expect(blocked.status).toBe(429);
    expect(typeof blocked.retryAfter).toBe("number");
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.ip).toBe(ip);
  });

  it("exposes a no-store header constant for reveal responses", () => {
    expect(REVEAL_NO_STORE_HEADERS).toEqual({ "Cache-Control": "no-store" });
  });
});

describe("checkRevealRateLimit", () => {
  it("exposes positive limit + window constants", () => {
    expect(Number.isInteger(REVEAL_RATE_LIMIT)).toBe(true);
    expect(REVEAL_RATE_LIMIT).toBeGreaterThan(0);
    expect(REVEAL_RATE_WINDOW_MS).toBeGreaterThan(0);
  });

  it("allows a burst of LIMIT then blocks with retryAfterSec", () => {
    const key = "burst-probe";
    for (let i = 0; i < REVEAL_RATE_LIMIT; i++) {
      expect(checkRevealRateLimit(key)).toEqual({ ok: true });
    }
    const blocked = checkRevealRateLimit(key);
    expect(blocked.ok).toBe(false);
    expect(blocked.limit).toBe(REVEAL_RATE_LIMIT);
    expect(typeof blocked.retryAfterSec).toBe("number");
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("re-allows after resetRevealRateLimits", () => {
    const key = "reset-probe";
    for (let i = 0; i <= REVEAL_RATE_LIMIT; i++) checkRevealRateLimit(key);
    expect(checkRevealRateLimit(key).ok).toBe(false);
    resetRevealRateLimits();
    expect(checkRevealRateLimit(key)).toEqual({ ok: true });
  });

  it("re-allows after the window elapses (fake timers)", () => {
    vi.useFakeTimers();
    try {
      const key = "window-probe";
      for (let i = 0; i < REVEAL_RATE_LIMIT; i++) {
        expect(checkRevealRateLimit(key).ok).toBe(true);
      }
      expect(checkRevealRateLimit(key).ok).toBe(false);
      vi.advanceTimersByTime(REVEAL_RATE_WINDOW_MS + 1000);
      expect(checkRevealRateLimit(key)).toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("buckets a missing key as unknown", () => {
    expect(checkRevealRateLimit().ok).toBe(true);
    expect(checkRevealRateLimit("").ok).toBe(true);
  });
});

describe("proxyMask never emits raw credentials", () => {
  const cases = [
    { raw: "http://proxyuser:s3cret-pw@proxy.example:8080", user: "proxyuser", pass: "s3cret-pw", host: "proxy.example:8080" },
    { raw: "socks5://sockuser:sockpass123@10.0.0.5:1080", user: "sockuser", pass: "sockpass123", host: "10.0.0.5:1080" },
    { raw: "https://admin9:topsecret-admin@corp-proxy:3128/path", user: "admin9", pass: "topsecret-admin", host: "corp-proxy:3128/path" },
  ];

  it("masked output contains no credential substring but keeps host", () => {
    for (const { raw, user, pass, host } of cases) {
      const masked = maskProxyUrl(raw);
      expect(masked).not.toContain(user);
      expect(masked).not.toContain(pass);
      expect(masked).toContain(host);
      expect(masked).toContain("***");
    }
  });

  it("sanitized connection JSON contains no password", () => {
    const raw = "http://proxyuser:s3cret-pw@proxy.example:8080";
    const out = sanitizeConnectionForBrowser({
      id: "c1",
      apiKey: "sk-live",
      providerSpecificData: { prefix: "p", connectionProxyUrl: raw },
    });
    expect(out.providerSpecificData.connectionProxyUrl).toBeUndefined();
    expect(out.providerSpecificData.connectionProxyUrlMasked).toContain("proxy.example:8080");
    const json = JSON.stringify(out);
    expect(json).not.toContain("s3cret-pw");
    expect(json).not.toContain("proxyuser");
    expect(json).not.toContain("sk-live");
  });
});

describe("MaskedProxyValue auto-hide", () => {
  // The component is a "use client" JSX module with no JSX pipeline in the
  // node test env, so the export + wiring are asserted from source text.
  const compPath = fileURLToPath(
    new URL("../../src/shared/components/MaskedProxyValue.js", import.meta.url)
  );
  const src = fs.readFileSync(compPath, "utf8");

  it("exports a positive auto-hide constant", () => {
    const m = src.match(/export const PROXY_REVEAL_AUTO_HIDE_MS\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThan(0);
  });

  it("wires the constant into the hide timer", () => {
    expect(src).toMatch(/autoHideMs\s*=\s*PROXY_REVEAL_AUTO_HIDE_MS/);
    expect(src).toMatch(/setTimeout\([\s\S]*?autoHideMs/);
  });
});

describe("audit event shapes", () => {
  beforeEach(() => {
    resetAuditEvents();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appendAuditEvent returns a timestamped entry visible in the ring", async () => {
    const entry = await appendAuditEvent("proxy.reveal", {
      target: "connection",
      id: "c1",
      result: "ok",
      ip: "10.1.2.3",
    });
    expect(entry.type).toBe("proxy.reveal");
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.id).toBe("c1");
    const recent = getRecentAuditEvents();
    expect(recent.at(-1)).toMatchObject({ type: "proxy.reveal", id: "c1", result: "ok" });
  });

  it("persists metadata-only JSON lines to audit.log", async () => {
    await appendAuditEvent("proxy.reveal", {
      target: "proxy-pool",
      id: "p1",
      result: "ok",
      ip: "10.1.2.3",
    });
    const lines = fs.readFileSync(path.join(TMP_DATA_DIR, "audit.log"), "utf8").trim().split("\n");
    const last = JSON.parse(lines.at(-1));
    expect(last).toMatchObject({ type: "proxy.reveal", id: "p1" });
    expect("proxyUrl" in last).toBe(false);
  });

  it("resetAuditEvents clears the ring", async () => {
    await appendAuditEvent("proxy.reveal", { id: "c9" });
    expect(getRecentAuditEvents()).toHaveLength(1);
    resetAuditEvents();
    expect(getRecentAuditEvents()).toHaveLength(0);
  });
});

describe("normalizeProxyConfig blank-keeps-value (from [id] route)", () => {
  it("reports no proxy field when the body has none", () => {
    expect(normalizeProxyConfig({}, "")).toEqual({ hasAnyProxyField: false });
  });

  it("blank URL on edit keeps the stored secret (null, no error)", () => {
    const res = normalizeProxyConfig(
      { connectionProxyEnabled: true, connectionProxyUrl: "" },
      "http://u:p@host:8080"
    );
    expect(res.hasAnyProxyField).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.connectionProxyUrl).toBeNull();
  });

  it("masked-form value is treated as blank and never persisted", () => {
    const res = normalizeProxyConfig(
      { connectionProxyEnabled: true, connectionProxyUrl: "http://***@host:8080" },
      "http://u:p@host:8080"
    );
    expect(res.error).toBeUndefined();
    expect(res.connectionProxyUrl).toBeNull();
  });

  it("enabled + blank + no stored secret is a 400-style error", () => {
    const res = normalizeProxyConfig(
      { connectionProxyEnabled: true, connectionProxyUrl: "  " },
      ""
    );
    expect(res.hasAnyProxyField).toBe(true);
    expect(typeof res.error).toBe("string");
    expect(res.error).toMatch(/required/i);
  });

  it("disabled + blank + no stored secret is not an error", () => {
    const res = normalizeProxyConfig(
      { connectionProxyEnabled: false, connectionProxyUrl: "" },
      ""
    );
    expect(res.error).toBeUndefined();
    expect(res.connectionProxyUrl).toBeNull();
  });

  it("returns a fresh URL trimmed", () => {
    const res = normalizeProxyConfig(
      { connectionProxyEnabled: true, connectionProxyUrl: "  http://u:p2@host:9090  " },
      "http://u:p@host:8080"
    );
    expect(res.error).toBeUndefined();
    expect(res.connectionProxyUrl).toBe("http://u:p2@host:9090");
  });
});

afterAll(() => {
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  if (ORIGINAL_PEER_TOKEN === undefined) delete process.env.NINEROUTER_PEER_TOKEN;
  else process.env.NINEROUTER_PEER_TOKEN = ORIGINAL_PEER_TOKEN;
  fs.rmSync(TMP_DATA_DIR, { recursive: true, force: true });
});
