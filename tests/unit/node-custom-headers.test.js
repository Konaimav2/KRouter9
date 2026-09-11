import { describe, it, expect } from "vitest";
import { textToHeaders, headersToText } from "../../src/shared/utils/nodeHeaders.js";

// V9: header parsing must not allow auth confusion, CRLF injection, or abuse.
describe("node custom headers hardening (V9)", () => {
  it("lowercases header names", () => {
    expect(textToHeaders("X-Custom: v")).toEqual({ "x-custom": "v" });
  });

  it("keeps colons inside the value", () => {
    expect(textToHeaders("x-note: a:b:c")).toEqual({ "x-note": "a:b:c" });
  });

  it("drops reserved auth/cookie/host headers by default", () => {
    const out = textToHeaders("Authorization: Bearer x\nCookie: a=b\nHost: evil\nx-ok: 1");
    expect(out).toEqual({ "x-ok": "1" });
  });

  it("allows reserved headers only when explicitly opted in", () => {
    const out = textToHeaders("Authorization: Bearer x", { allowReserved: true });
    expect(out.authorization).toBe("Bearer x");
  });

  it("drops CRLF-injected values", () => {
    expect(textToHeaders("x-evil: a\r\nSet-Cookie: b")).toEqual({});
  });

  it("drops invalid token names", () => {
    expect(textToHeaders("bad name: v\nx-ok: 2")).toEqual({ "x-ok": "2" });
    expect(textToHeaders("x(a): v")).toEqual({});
  });

  it("caps value length", () => {
    const long = "a".repeat(9000);
    const out = textToHeaders(`x-long: ${long}`);
    expect(out["x-long"].length).toBe(8192);
  });

  it("caps header count", () => {
    const lines = Array.from({ length: 80 }, (_, i) => `x-h${i}: v`).join("\n");
    expect(Object.keys(textToHeaders(lines)).length).toBe(50);
  });

  it("round-trips allowed headers", () => {
    const src = { "x-one": "a", "x-two": "b" };
    expect(textToHeaders(headersToText(src))).toEqual(src);
  });
});
