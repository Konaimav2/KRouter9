import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getProviderConnections: vi.fn(),
}));

vi.mock("@/lib/proxyRevealGuard.js", () => ({
  hasValidDashboardSession: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body, init) => ({
      status: init?.status ?? 200,
      async json() {
        return body;
      },
    }),
  },
}));

import { GET } from "@/app/api/providers/suggested-models/route.js";
import { getProviderConnections } from "@/lib/localDb";
import { hasValidDashboardSession } from "@/lib/proxyRevealGuard.js";

const OC_REGISTRY_URL = "https://opencode.ai/zen/v1/models";

const ocCatalog = (n) => ({
  data: Array.from({ length: n }, (_, i) => ({ id: `m${i}-free` })),
});

function req(qs) {
  return { url: `https://x/api/providers/suggested-models?${qs}` };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hasValidDashboardSession).mockResolvedValue(true);
  global.fetch = vi.fn();
});

describe("suggested-models SSRF guard", () => {
  it("attacker-origin url param is ignored: fetch goes to the registry URL only", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([{ apiKey: "SECRET" }]);

    const res = await GET(
      req("url=https://evil.example/collect&type=opencode-free&provider=opencode")
    );
    expect(await res.json()).toEqual({ data: [] });
    // The caller-supplied url must never be fetched. A stored credential may
    // only ever be attached to the registry-bound destination, never to the
    // attacker origin.
    expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(0);
    for (const [u, opts] of vi.mocked(global.fetch).mock.calls) {
      expect(String(u)).toBe(OC_REGISTRY_URL);
      expect(String(u)).not.toContain("evil.example");
    }
  });

  it("loopback destination is blocked and never fetched", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);

    const res = await GET(
      req("url=http://127.0.0.1/admin&type=opencode-free&provider=opencode")
    );
    expect(await res.json()).toEqual({ data: [] });
    for (const [u] of vi.mocked(global.fetch).mock.calls) {
      expect(String(u)).not.toContain("127.0.0.1");
    }
  });

  it("unknown provider yields [] without any fetch", async () => {
    const res = await GET(
      req("url=https://opencode.ai/zen/v1/models&type=opencode-free&provider=nope")
    );
    expect(await res.json()).toEqual({ data: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("oversize catalog (content-length) yields []", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => String(50 * 1024 * 1024) },
      json: async () => ocCatalog(13),
    });

    const res = await GET(req("type=opencode-free&provider=opencode"));
    expect(await res.json()).toEqual({ data: [] });
  });

  it("registry URL that redirects (302) yields [] and is never followed", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 302,
      headers: { get: () => null },
    });

    const res = await GET(req("type=opencode-free&provider=opencode"));
    expect(await res.json()).toEqual({ data: [] });
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(global.fetch).mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("oc keyless 13-result catalog keeps working via the server-side registry URL", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ocCatalog(13),
    });

    const res = await GET(
      req("url=https://opencode.ai/zen/v1/models&type=opencode-free&provider=opencode")
    );
    const body = await res.json();

    expect(body.data).toHaveLength(13);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe(OC_REGISTRY_URL);
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    expect(opts?.headers?.Authorization ?? opts?.headers?.authorization).toBeUndefined();
  });
});
