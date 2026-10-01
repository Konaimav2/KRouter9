// Antigravity / Gemini-Code-Assist eligibility failures need human action
// (re-auth, age/selfie verification — see docs/ANTIGRAVITY-ELIGIBILITY.md and
// the external antigravity-fixer tool). Retrying the account on the generic
// 2-minute 403 cooldown just hammers a dead credential, so these errors must
// lock the account out far longer than an ordinary 403.
import { describe, expect, it } from "vitest";
import { checkFallbackError, isModelScopedError } from "../../open-sse/services/accountFallback.js";

const ELIGIBILITY_SAMPLES = [
  "Eligibility check failed: Your current account is not eligible for Antigravity.",
  "Your current account is not eligible for gemini code assist for individuals at this time.",
  "403 Forbidden — VALIDATION_REQUIRED",
];

describe("antigravity eligibility failures", () => {
  it("locks the account far longer than a generic 403", () => {
    const generic = checkFallbackError(403, "forbidden");
    expect(generic.shouldFallback).toBe(true);
    for (const text of ELIGIBILITY_SAMPLES) {
      const result = checkFallbackError(403, text);
      expect(result.shouldFallback).toBe(true);
      expect(result.cooldownMs).toBeGreaterThan(generic.cooldownMs);
    }
  });

  it("stays account-scoped (never model-scoped)", () => {
    for (const text of ELIGIBILITY_SAMPLES) {
      expect(isModelScopedError(403, text, "gemini-3-flash")).toBe(false);
    }
  });
});
