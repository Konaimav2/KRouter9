import { describe, it, expect } from "vitest";
import { maskEmail } from "@/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js";

describe("maskEmail (W12 quota email censor)", () => {
  it("masks local part, keeps domain", () => {
    expect(maskEmail("arraffi@gmail.com")).toBe("a***@gmail.com");
  });

  it("single-char local part stays usable", () => {
    expect(maskEmail("a@x.io")).toBe("a***@x.io");
  });

  it("passes through non-emails and empties safely", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
    expect(maskEmail("")).toBe("");
    expect(maskEmail(null)).toBe("");
    expect(maskEmail(undefined)).toBe("");
  });
});
