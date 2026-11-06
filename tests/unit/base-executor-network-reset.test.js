// Regression (production 2026-11-07, River lane): an upstream socket reset
// (ECONNRESET/EPIPE/UND_ERR_SOCKET) was mapped to the 502 retry config and
// re-POSTed to the SAME endpoint 3× before ever trying the next base URL — with
// 4 accounts in rotation every request burned 3× the delay per account and the
// client's 8–25 s retry storm kept re-entering the combo at member 1.
//
// Contract after the fix:
//   - a classified upstream reset → at most ONE fetch per base URL, then the
//     next fallback URL, or a fast throw on a single URL (account/combo layer
//     handles it).
//   - HTTP 502/503/504 RESPONSES and NON-RESET thrown errors keep the
//     configured retry mapping untouched.
//   - client AbortError / deadline aborts are never resets: rethrown as-is.
//
// Tests use tiny retry delays so the stale (buggy) path completes quickly and
// fails a real assertion instead of hanging.
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { BaseExecutor } = await import("../../open-sse/executors/base.js");
const { getUpstreamResetCode } = await import("../../open-sse/utils/networkError.js");

function res(status) {
  return { status, headers: { get: () => "" } };
}

const creds = { apiKey: "k" };

// Fast 502 retry config: if the stale code applied it to a reset, the extra
// fetches happen immediately (1 ms apart) so the call-count assertion is clean.
const FAST_RETRY = { retry: { 502: { attempts: 3, delayMs: 1 }, 503: { attempts: 3, delayMs: 1 } } };

function undiciReset(causeCode = "UND_ERR_SOCKET", causeMsg = "read ECONNRESET") {
  const outer = new TypeError("fetch failed");
  outer.cause = Object.assign(new Error(causeMsg), { code: causeCode });
  return outer;
}

const logging = () => Object.fromEntries(["info", "warn", "debug", "line", "errorLine"].map((n) => [n, vi.fn()]));

beforeEach(() => fetchMock.mockReset());

describe("BaseExecutor.execute — upstream socket reset: one fetch per base URL", () => {
  it("single URL: exactly one fetch, fast throw, error annotated (no 502 retry config applied)", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api", ...FAST_RETRY });
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));

    let thrown = null;
    const t0 = Date.now();
    try {
      await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    } catch (e) { thrown = e; }

    expect(thrown).toBeTruthy();
    // The stale code retries the same URL up to `attempts` extra times (4 fetches).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(thrown.urlIndex).toBe(0);
    expect(thrown.networkResetCode).toBe("ECONNRESET");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("two URLs, all resetting: one fetch on the resetting URL, advances to the next base URL", async () => {
    const ex = new BaseExecutor("test", { baseUrls: ["https://a/api", "https://b/api"], ...FAST_RETRY });
    fetchMock
      .mockRejectedValueOnce(undiciReset())
      .mockResolvedValueOnce(res(200));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(200);
    // New behavior: url[0] resets once, then url[1] succeeds (the stale code would
    // have re-fetched url[0] and answered from it instead).
    expect(out.url).toBe("https://b/api");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies the nested undici shape (cause.code = UND_ERR_SOCKET) as a reset", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api", ...FAST_RETRY });
    fetchMock.mockRejectedValueOnce(undiciReset());
    let thrown = null;
    try {
      await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    } catch (e) { thrown = e; }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(thrown.networkResetCode).toBe("UND_ERR_SOCKET");
  });

  it("logs a structured NETWORK_RESET entry with code/urlIndex/attempt and no URL credentials", async () => {
    const exelog = logging();
    // openai-compatible connections carry the token in the URL userinfo.
    const riverUrl = "https://user:supersecret@river-host:8443/v1";
    const ex = new BaseExecutor("openai-compatible-river", { baseUrl: riverUrl, ...FAST_RETRY });
    const riverCreds = { apiKey: "k", providerSpecificData: { baseUrl: riverUrl } };
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));

    try {
      await ex.execute({ model: "deepseek-v4.1-flash", body: {}, stream: false, credentials: riverCreds, log: exelog });
    } catch { /* expected fast throw */ }

    const warnCalls = exelog.warn.mock.calls.filter(([tag]) => tag === "NETWORK_RESET");
    expect(warnCalls).toHaveLength(1);
    const payload = warnCalls[0][2];
    expect(payload).toMatchObject({
      provider: "openai-compatible-river",
      model: "deepseek-v4.1-flash",
      urlIndex: 0,
      attempt: 1,
      code: "ECONNRESET",
    });
    expect(payload.url).toContain("river-host");
    expect(payload.url).not.toContain("supersecret");
    expect(JSON.stringify(warnCalls[0])).not.toContain("supersecret");
  });

  it("two-URL reset on BOTH urls: one fetch each, then throws the last error annotated", async () => {
    const ex = new BaseExecutor("test", { baseUrls: ["https://a/api", "https://b/api"], ...FAST_RETRY });
    fetchMock
      .mockRejectedValueOnce(new Error("read ECONNRESET"))
      .mockRejectedValueOnce(new Error("socket hang up"));
    let thrown = null;
    try {
      await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    } catch (e) { thrown = e; }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(thrown.urlIndex).toBe(1);
    expect(thrown.networkResetCode).toBe("SOCKET_HANG_UP");
  });
});

describe("BaseExecutor.execute — behaviors that must NOT change", () => {
  it("a client AbortError is not a reset: rethrown, no fallback fetch", async () => {
    const ex = new BaseExecutor("test", { baseUrls: ["https://a/api", "https://b/api"], ...FAST_RETRY });
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
    let thrown = null;
    try {
      await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    } catch (e) { thrown = e; }
    expect(thrown?.name).toBe("AbortError");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getUpstreamResetCode(thrown)).toBeNull();
  });

  it("an HTTP 502 RESPONSE still follows the configured retry", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api", retry: { 502: { attempts: 1, delayMs: 0 } } });
    fetchMock.mockResolvedValueOnce(res(502)).mockResolvedValueOnce(res(200));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("an HTTP 503 RESPONSE still follows the configured retry", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api", retry: { 503: { attempts: 1, delayMs: 0 } } });
    fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a NON-RESET thrown error (ENOTFOUND) keeps the 502 retry mapping", async () => {
    const ex = new BaseExecutor("test", { baseUrl: "https://x/api", retry: { 502: { attempts: 1, delayMs: 0 } } });
    fetchMock
      .mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND river.example.com"))
      .mockResolvedValueOnce(res(200));
    const out = await ex.execute({ model: "m", body: {}, stream: false, credentials: creds });
    expect(out.response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
