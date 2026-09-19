import { describe, it, expect } from "vitest";
import { checkBodyLimit, MAX_BODY_BYTES } from "../../src/lib/bodyLimit.js";
import { RELAY_MAX_BODY_BYTES } from "../../open-sse/utils/proxyFetch.js";
import { checkFallbackError, isClientFault } from "../../open-sse/services/accountFallback.js";

describe("entry body limit", () => {
  it("rejects Content-Length over 25MB", () => {
    expect(checkBodyLimit(String(26 * 1024 * 1024)).ok).toBe(false);
    expect(checkBodyLimit(String(1024)).ok).toBe(true);
    expect(checkBodyLimit(null).ok).toBe(true);
    expect(MAX_BODY_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("relay egress cap", () => {
  it("is ~4MB, far below the entry limit", () => {
    expect(RELAY_MAX_BODY_BYTES).toBe(4 * 1024 * 1024);
    expect(RELAY_MAX_BODY_BYTES).toBeLessThan(MAX_BODY_BYTES);
  });
});

describe("413 exempt from account fallback", () => {
  it("isClientFault covers 413 and payload-too-large text", () => {
    expect(isClientFault(413, "Request body too large")).toBe(true);
    expect(isClientFault(200, "Request body too large for relay egress")).toBe(true);
    expect(isClientFault(413, "quota exceeded")).toBe(false);
  });

  it("checkFallbackError does not fall back on 413", () => {
    const r = checkFallbackError(413, "Request body too large: limit is 26214400 bytes");
    expect(r.shouldFallback).toBe(false);
    expect(r.cooldownMs).toBe(0);
  });

  it("still falls back on genuine provider faults", () => {
    expect(checkFallbackError(429, "rate limit").shouldFallback).toBe(true);
    expect(checkFallbackError(503, "overloaded").shouldFallback).toBe(true);
  });
});
