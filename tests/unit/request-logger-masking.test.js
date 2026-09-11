import { describe, it, expect } from "vitest";
import { maskSensitiveHeaders } from "../../open-sse/utils/requestLogger.js";

// V5: request-log files must never contain reusable credentials. Header names
// are kept for debugging; values for auth/cookie/token/secret headers are masked.
describe("request logger header masking (V5)", () => {
  it("masks authorization/cookie/api-key values", () => {
    const out = maskSensitiveHeaders({
      Authorization: "Bearer sk-super-secret-value-123456",
      Cookie: "auth_token=eyJhbGciOiJIUzI1NiJ9.long.jwt",
      "x-api-key": "abcdef1234567890",
      "Content-Type": "application/json",
    });
    expect(out.Authorization).not.toContain("sk-super-secret-value");
    expect(out.Cookie).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out["x-api-key"]).not.toBe("abcdef1234567890");
    expect(out["Content-Type"]).toBe("application/json");
  });

  it("keeps non-sensitive headers intact", () => {
    const out = maskSensitiveHeaders({ "User-Agent": "codex_cli_rs/0.149.1", Accept: "text/event-stream" });
    expect(out["User-Agent"]).toBe("codex_cli_rs/0.149.1");
    expect(out.Accept).toBe("text/event-stream");
  });

  it("handles missing/empty headers", () => {
    expect(maskSensitiveHeaders(undefined)).toEqual({});
    expect(maskSensitiveHeaders({})).toEqual({});
  });

  it("masks short secrets entirely", () => {
    const out = maskSensitiveHeaders({ "x-api-key": "short" });
    expect(out["x-api-key"]).toBe("***");
  });
});
