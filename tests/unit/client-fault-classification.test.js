import { describe, it, expect, vi } from "vitest";
import { isClientFault } from "../../open-sse/services/accountFallback.js";

// V6: client-fault classification must not shadow account/provider faults.
// A 400 whose body says quota/capacity is an ACCOUNT fault and must rotate.
describe("client-fault classification (V6)", () => {
  it("treats status-only 400/406/422 as client faults", () => {
    expect(isClientFault(400, "bad payload")).toBe(true);
    expect(isClientFault(406, "not acceptable")).toBe(true);
    expect(isClientFault(422, "unprocessable entity")).toBe(true);
  });

  it("treats validation/context-length text as client faults", () => {
    expect(isClientFault(500, "validation error: temperature")).toBe(true);
    expect(isClientFault(200, "maximum context length exceeded")).toBe(true);
  });

  it("does NOT classify provider faults as client faults", () => {
    expect(isClientFault(429, "rate limit exceeded")).toBe(false);
    expect(isClientFault(503, "overloaded")).toBe(false);
    // The key V6 regression: account-specific quota on a 400 must rotate.
    expect(isClientFault(400, "quota exceeded for this account")).toBe(false);
    expect(isClientFault(400, "no credentials for provider")).toBe(false);
    expect(isClientFault(400, "request not allowed")).toBe(false);
  });
});
