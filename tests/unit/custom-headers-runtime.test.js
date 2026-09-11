import { describe, it, expect } from "vitest";
import { applyCustomHeaders } from "../../open-sse/utils/customHeaders.js";

// V9 runtime sanitizer: connections written through other routes (or legacy
// rows) must not be able to inject reserved auth/host headers.
describe("applyCustomHeaders runtime sanitizer (V9)", () => {
  it("applies normal headers lowercased", () => {
    const h = applyCustomHeaders({}, { "X-Trace": "abc" });
    expect(h["x-trace"]).toBe("abc");
  });

  it("refuses reserved auth/host headers", () => {
    const h = applyCustomHeaders({}, {
      Authorization: "Bearer evil",
      Cookie: "a=b",
      Host: "evil",
      "content-length": "999",
      "x-api-key": "k",
      "x-ok": "1",
    });
    expect(h.authorization).toBeUndefined();
    expect(h.cookie).toBeUndefined();
    expect(h.host).toBeUndefined();
    expect(h["content-length"]).toBeUndefined();
    expect(h["x-api-key"]).toBeUndefined();
    expect(h["x-ok"]).toBe("1");
  });

  it("rejects CRLF and invalid names", () => {
    const h = applyCustomHeaders({}, { "x-bad": "a\r\nSet-Cookie: b", "bad name": "v", "x-good": "z" });
    expect(h["x-bad"]).toBeUndefined();
    expect(h["bad name"]).toBeUndefined();
    expect(h["x-good"]).toBe("z");
  });

  it("caps value length", () => {
    const h = applyCustomHeaders({}, { "x-long": "a".repeat(9000) });
    expect(h["x-long"].length).toBe(8192);
  });
});
