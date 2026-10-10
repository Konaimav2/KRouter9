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

function req(qs) {
  return { url: `https://x/api/providers/suggested-models?${qs}` };
}

const QS = "type=opencode-free&provider=opencode";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hasValidDashboardSession).mockResolvedValue(true);
  vi.mocked(getProviderConnections).mockResolvedValue([]);
  global.fetch = vi.fn();
});

describe("G4H RED: catalog 401/redirect paths free the body + timer", () => {
  it("upstream 401 cancels the response body instead of leaving it open", async () => {
    let bodyCancelled = false;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 401,
      headers: { get: () => null },
      body: { cancel: async () => { bodyCancelled = true; } },
      json: async () => ({}),
    });

    const res = await GET(req(QS));
    expect(await res.json()).toEqual({ data: [] });
    expect(bodyCancelled).toBe(true);
  });

  it("redirect response cancels the body before the fail-open []", async () => {
    let bodyCancelled = false;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 302,
      headers: { get: (n) => (String(n).toLowerCase() === "location" ? "https://evil.example/x" : null) },
      body: { cancel: async () => { bodyCancelled = true; } },
      json: async () => ({}),
    });

    const res = await GET(req(QS));
    expect(await res.json()).toEqual({ data: [] });
    expect(bodyCancelled).toBe(true);
  });

  it("stalled 401 body cannot outlive the fetch timeout (signal aborts)", async () => {
    vi.useFakeTimers();
    try {
      let seenSignal;
      vi.mocked(global.fetch).mockImplementation(async (u, opts) => {
        seenSignal = opts?.signal;
        return {
          ok: false,
          status: 401,
          headers: { get: () => null },
          // Hanging body: cancel() only resolves once the abort fires.
          body: {
            cancel: () =>
              new Promise((resolve, reject) => {
                if (seenSignal?.aborted) return resolve();
                seenSignal?.addEventListener("abort", () => resolve(), { once: true });
                setTimeout(() => reject(new Error("cancel stalled")), 30_000);
              }),
          },
          json: async () => ({}),
        };
      });

      const pending = GET(req(QS));
      await vi.advanceTimersByTimeAsync(11_000);
      const res = await pending;
      expect(await res.json()).toEqual({ data: [] });
      expect(seenSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 8000);
});
