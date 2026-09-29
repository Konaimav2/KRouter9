import { describe, it, expect } from "vitest";
import {
  checkRateLimit, resetRateLimits, checkTpmLimit, resetTpmLimits,
} from "@/lib/rateLimit.js";

describe("per-key RPM/TPM enforcement (W01)", () => {
  it("allows under the RPM limit and blocks over it", () => {
    resetRateLimits("k-rpm");
    expect(checkRateLimit("k-rpm", "1.2.3.4", 2).ok).toBe(true);
    expect(checkRateLimit("k-rpm", "1.2.3.4", 2).ok).toBe(true);
    const third = checkRateLimit("k-rpm", "1.2.3.4", 2);
    expect(third.ok).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  it("treats 0 as unlimited RPM", () => {
    resetRateLimits("k-free");
    for (let i = 0; i < 10; i++) expect(checkRateLimit("k-free", "1.2.3.4", 0).ok).toBe(true);
  });

  it("enforces TPM budget and reports retry", () => {
    resetTpmLimits("k-tpm");
    expect(checkTpmLimit("k-tpm", 100, 1000).ok).toBe(true);
    const over = checkTpmLimit("k-tpm", 950, 1000);
    expect(over.ok).toBe(false);
  });

  it("treats 0 as unlimited TPM", () => {
    resetTpmLimits("k-tpmfree");
    expect(checkTpmLimit("k-tpmfree", 10 ** 9, 0).ok).toBe(true);
  });
});
