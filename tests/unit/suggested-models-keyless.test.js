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

const CATALOG = {
  data: [{ id: "a-free" }, { id: "b-paid" }, { id: "big-pickle" }],
};

function req(url) {
  return { url };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hasValidDashboardSession).mockResolvedValue(true);
  global.fetch = vi.fn();
});

describe("suggested-models keyless fallback", () => {
  it("provider param with NO apikey still fetches unauthenticated and returns filtered data", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => CATALOG,
    });

    const res = await GET(
      req("https://x/api/providers/suggested-models?url=https://zen/models&type=opencode-free&provider=opencode")
    );
    const body = await res.json();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    expect(opts?.headers?.Authorization ?? opts?.headers?.authorization).toBeUndefined();
    expect(body.data.map((m) => m.id).sort()).toEqual(["a-free", "big-pickle"]);
  });

  it("keyed path unchanged: apikey attached as Authorization header", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([{ apiKey: "k123" }]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => CATALOG,
    });

    const res = await GET(
      req("https://x/api/providers/suggested-models?url=https://zen/models&type=opencode-free&provider=keyed")
    );
    const body = await res.json();

    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    expect(opts?.headers?.Authorization).toBe("Bearer k123");
    expect(body.data.map((m) => m.id).sort()).toEqual(["a-free", "big-pickle"]);
  });

  it("upstream 401 yields []", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 401 });

    const res = await GET(
      req("https://x/api/providers/suggested-models?url=https://zen/models&type=opencode-free&provider=opencode")
    );
    expect(await res.json()).toEqual({ data: [] });
  });

  it("upstream 500 yields []", async () => {
    vi.mocked(getProviderConnections).mockResolvedValue([]);
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 500 });

    const res = await GET(
      req("https://x/api/providers/suggested-models?url=https://zen/models&type=opencode-free&provider=opencode")
    );
    expect(await res.json()).toEqual({ data: [] });
  });
});
