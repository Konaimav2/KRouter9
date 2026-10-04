import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProxyPools: vi.fn(),
  getProviderConnections: vi.fn(),
}));

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

vi.mock("@/models", () => ({
  createProxyPool: vi.fn(),
  getProxyPools: mocks.getProxyPools,
  getProviderConnections: mocks.getProviderConnections,
}));

const { GET } = await import("../../src/app/api/proxy-pools/route.js");

const pools = [
  {
    id: "pool-http",
    name: "private egress",
    proxyUrl: "http://user:pass@192.25.205.17:48173",
    noProxy: "localhost,metadata.private.internal,10.0.0.8",
    lastError: "dial http://admin:secret@proxy.private.internal:8080 via 10.0.0.8",
    lastTestedAt: "2026-10-03T10:00:00.000Z",
  },
  {
    id: "pool-relay",
    name: "relay",
    type: "vercel",
    proxyUrl: "https://vercel-relay-sensitive-id.vercel.app",
    noProxy: "relay.private.internal",
    lastError: "token=super-secret relay.private.internal unavailable",
    lastTestedAt: "2026-10-03T11:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProxyPools.mockResolvedValue(pools);
  mocks.getProviderConnections.mockResolvedValue(
    Array.from({ length: 16 }, (_, index) => ({
      id: `connection-${index}`,
      providerSpecificData: { proxyPoolId: "pool-relay" },
    }))
  );
});

describe("proxy-pool list masking", () => {
  it("never sends a proxy host, port, or relay hostname in list payloads", async () => {
    const response = await GET(new Request("http://localhost/api/proxy-pools"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(serialized).not.toContain("192.25.205.17");
    expect(serialized).not.toContain("48173");
    expect(serialized).not.toContain("vercel-relay-sensitive-id.vercel.app");
    expect(body.proxyPools.map((pool) => pool.proxyUrlMasked)).toEqual(["***", "***"]);
  });

  it("censors noProxy and sanitizes lastError in list payloads", async () => {
    const response = await GET(new Request("http://localhost/api/proxy-pools"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(body.proxyPools.map((pool) => pool.noProxy)).toEqual(["***", "***"]);
    expect(serialized).not.toContain("metadata.private.internal");
    expect(serialized).not.toContain("relay.private.internal");
    expect(serialized).not.toContain("10.0.0.8");
    expect(serialized).not.toContain("admin");
    expect(serialized).not.toContain("super-secret");
    expect(body.proxyPools[0].lastError).toContain("[REDACTED");
  });

  it("preserves non-sensitive bound counts and last-tested timestamps", async () => {
    const response = await GET(
      new Request("http://localhost/api/proxy-pools?includeUsage=true")
    );
    const body = await response.json();

    expect(body.proxyPools[0]).toMatchObject({
      boundConnectionCount: 0,
      lastTestedAt: "2026-10-03T10:00:00.000Z",
    });
    expect(body.proxyPools[1]).toMatchObject({
      boundConnectionCount: 16,
      lastTestedAt: "2026-10-03T11:00:00.000Z",
    });
  });

  it("renders the censored value through the guarded single-record reveal flow", () => {
    const pagePath = fileURLToPath(
      new URL("../../src/app/(dashboard)/dashboard/proxy-pools/page.js", import.meta.url)
    );
    const source = fs.readFileSync(pagePath, "utf8");

    expect(source).toContain("MaskedProxyValue");
    expect(source).toMatch(/revealUrl=\{`\/api\/proxy-pools\/\$\{pool\.id\}\/reveal`\}/);
    expect(source).not.toMatch(/>\{pool\.proxyUrlMasked\s*\|\|\s*""\}/);
    expect(source).not.toContain("`No proxy: ${pool.noProxy}`");
    expect(source).toContain('noProxy: isEdit ? "" : data.noProxy || ""');
  });
});
