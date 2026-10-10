import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// Chunked-style body: no content-length, async-iterator stream of Uint8Arrays.
function chunkedBody(chunks, { onCancel, neverEnding = false, signalRef } = {}) {
  let i = 0;
  let cancelled = false;
  const reader = {
    async read() {
      if (neverEnding) {
        // Slow body: pend until the route's abort timer fires.
        await new Promise((_, rej) => {
          const sig = signalRef?.signal;
          if (sig?.aborted) rej(new DOMException("aborted", "AbortError"));
          else sig?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")), { once: true });
        });
      }
      if (i >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[i++] };
    },
    async cancel() {
      cancelled = true;
      onCancel?.();
    },
    releaseLock() {},
  };
  return {
    getReader: () => reader,
    isCancelled: () => cancelled,
  };
}

const enc = (s) => new TextEncoder().encode(s);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hasValidDashboardSession).mockResolvedValue(true);
  vi.mocked(getProviderConnections).mockResolvedValue([]);
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("suggested-models streaming byte cap + abort-through-body", () => {
  it("chunked response over the cap yields [] and cancels immediately (json never read)", async () => {
    const big = enc(JSON.stringify({ data: [{ id: "x" }] }));
    // 11 x 1MB chunks, no content-length -> must trip the streaming cap.
    const chunk = new Uint8Array(1024 * 1024).fill(65);
    const body = chunkedBody(Array.from({ length: 11 }, () => chunk));
    let jsonCalled = false;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body,
      json: async () => { jsonCalled = true; return { data: [] }; },
    });

    const res = await GET(req(QS));
    expect(await res.json()).toEqual({ data: [] });
    expect(body.isCancelled()).toBe(true);
    expect(jsonCalled).toBe(false);
    expect(big.length).toBeGreaterThan(0); // fixture sanity
  });

  it("chunked response under the cap still parses (no regression)", async () => {
    const payload = JSON.stringify({ data: [{ id: "a-free" }, { id: "b-free" }, { id: "c-free" }] });
    const mid = Math.floor(payload.length / 2);
    const body = chunkedBody([enc(payload.slice(0, mid)), enc(payload.slice(mid))]);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body,
      json: async () => { throw new Error("must use streaming path"); },
    });

    const res = await GET(req(QS));
    const out = await res.json();
    expect(out.data).toHaveLength(3);
    expect(body.isCancelled()).toBe(false);
  });

  it("slow body is cut by the abort timer (timer covers body consumption)", async () => {
    vi.useFakeTimers();
    const signalRef = {};
    vi.mocked(global.fetch).mockImplementation(async (u, opts) => {
      signalRef.signal = opts?.signal;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        body: chunkedBody([], { neverEnding: true, signalRef }),
        json: async () => { throw new Error("unreachable"); },
      };
    });

    const pending = GET(req(QS));
    await vi.advanceTimersByTimeAsync(11_000);
    const res = await pending;
    expect(await res.json()).toEqual({ data: [] });
    expect(signalRef.signal?.aborted).toBe(true);
  }, 8000);

  it("declared oversize content-length cancels the body instead of draining it", async () => {
    let cancelled = false;
    let jsonCalled = false;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (n) => (String(n).toLowerCase() === "content-length" ? String(50 * 1024 * 1024) : null) },
      body: { cancel: async () => { cancelled = true; } },
      json: async () => { jsonCalled = true; return { data: [{ id: "x" }] }; },
    });

    const res = await GET(req(QS));
    expect(await res.json()).toEqual({ data: [] });
    expect(cancelled).toBe(true);
    expect(jsonCalled).toBe(false);
  });
});
