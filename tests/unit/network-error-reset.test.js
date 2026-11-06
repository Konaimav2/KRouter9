// Upstream socket-reset classification — the single shared answer to
// "did the upstream socket die (vs. a client/deadline abort or a pure timeout)".
// Reused by BaseExecutor (no same-URL retry on reset), streamHandler (graceful
// close) and chatCore (pre-header reset ledger). String checks for this
// condition must live here only, not inline again.
import { describe, it, expect } from "vitest";
import { getUpstreamResetCode, maskUrlSecrets } from "../../open-sse/utils/networkError.js";

const withCode = (message, code) => Object.assign(new Error(message), { code });
const undiciReset = (causeCode = "UND_ERR_SOCKET", causeMsg = "read ECONNRESET") => {
  const outer = new TypeError("fetch failed");
  outer.cause = withCode(causeMsg, causeCode);
  return outer;
};

describe("getUpstreamResetCode — upstream socket reset detection", () => {
  it("detects a top-level ECONNRESET", () => {
    expect(getUpstreamResetCode(withCode("read ECONNRESET", "ECONNRESET"))).toBe("ECONNRESET");
  });

  it("detects the undici shape: TypeError('fetch failed') with cause.code UND_ERR_SOCKET", () => {
    expect(getUpstreamResetCode(undiciReset())).toBe("UND_ERR_SOCKET");
  });

  it("walks a deeper cause chain (cause.cause.code = ECONNRESET)", () => {
    const outer = new TypeError("fetch failed");
    outer.cause = new Error("socket terminated");
    outer.cause.cause = withCode("reset", "ECONNRESET");
    expect(getUpstreamResetCode(outer)).toBe("ECONNRESET");
  });

  it("detects EPIPE", () => {
    expect(getUpstreamResetCode(withCode("write EPIPE", "EPIPE"))).toBe("EPIPE");
  });

  it("detects 'socket hang up' by message (legacy node-http shape, no code)", () => {
    expect(getUpstreamResetCode(new Error("socket hang up"))).toBe("SOCKET_HANG_UP");
  });

  it("detects ECONNRESET from message text (raw http client shape)", () => {
    expect(getUpstreamResetCode(new Error("read ECONNRESET"))).toBe("ECONNRESET");
  });

  it("returns null for an explicit client AbortError", () => {
    expect(getUpstreamResetCode(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }))).toBeNull();
  });

  it("returns null when the abort is nested in the fetch failure (deadline abort)", () => {
    const outer = new TypeError("fetch failed");
    outer.cause = Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    expect(getUpstreamResetCode(outer)).toBeNull();
  });

  it("returns null for plain AbortError and TimeoutError names", () => {
    expect(getUpstreamResetCode(Object.assign(new Error("signal timed out"), { name: "TimeoutError" }))).toBeNull();
    expect(getUpstreamResetCode(Object.assign(new Error("aborted by client"), { name: "AbortError" }))).toBeNull();
  });

  it("returns null for DNS errors (not a socket reset)", () => {
    expect(getUpstreamResetCode(withCode("getaddrinfo ENOTFOUND river.example.com", "ENOTFOUND"))).toBeNull();
  });

  it("returns null for ETIMEDOUT (connect/read timeouts keep their own policy)", () => {
    expect(getUpstreamResetCode(withCode("connect ETIMEDOUT 203.0.113.7:443", "ETIMEDOUT"))).toBeNull();
  });

  it("returns null for TLS/other transport errors without a reset code", () => {
    expect(getUpstreamResetCode(withCode("unexpected end of SSL data", "EPROTO"))).toBeNull();
    expect(getUpstreamResetCode(new Error("boom"))).toBeNull();
    expect(getUpstreamResetCode(null)).toBeNull();
    expect(getUpstreamResetCode("not an object")).toBeNull();
  });
});

describe("maskUrlSecrets — URL credentials never reach logs", () => {
  it("strips userinfo and query, keeps host and path", () => {
    expect(maskUrlSecrets("https://user:secret@river-host:8443/v1/chat/completions?api_key=tok"))
      .toBe("https://river-host:8443/v1/chat/completions");
  });

  it("leaves clean URLs unchanged", () => {
    expect(maskUrlSecrets("https://api.deepseek.com/chat/completions")).toBe("https://api.deepseek.com/chat/completions");
  });

  it("masks userinfo in URLs the URL parser rejects", () => {
    const masked = maskUrlSecrets("scheme one://u:secret@host/x?k=v");
    expect(masked).not.toContain("secret");
  });

  it("passes non-strings through untouched", () => {
    expect(maskUrlSecrets(null)).toBeNull();
    expect(maskUrlSecrets(undefined)).toBeUndefined();
  });
});
