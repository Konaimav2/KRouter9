import { describe, it, expect } from "vitest";
import { maskProxyUrl, hasProxyAuth, sanitizeProxyFields } from "@/lib/proxyMask.js";

describe("proxy no-auth leak (W16)", () => {
  it("redacts query-string secrets on credential-less URLs", () => {
    const out = maskProxyUrl("https://relay.example.com/v1?token=SECRET123");
    expect(out).not.toContain("SECRET123");
    expect(out).toContain("relay.example.com");
  });

  it("redacts api_key-style query params", () => {
    const out = maskProxyUrl("http://10.0.0.5:8080/proxy?api_key=ABCDEF");
    expect(out).not.toContain("ABCDEF");
    expect(out).toContain("10.0.0.5:8080");
  });

  it("drops fragments", () => {
    expect(maskProxyUrl("https://relay.example.com/x#SECRET")).not.toContain("SECRET");
  });

  it("keeps existing userinfo masking intact", () => {
    expect(maskProxyUrl("http://user:pass@host:8080")).toBe("http://***@host:8080");
  });

  it("keeps plain host:port visible (not secret)", () => {
    expect(maskProxyUrl("http://10.0.0.5:8080")).toBe("http://10.0.0.5:8080");
  });

  it("sanitizeProxyFields never emits raw URL with query secret", () => {
    const out = sanitizeProxyFields({ name: "relay", proxyUrl: "https://r.example/v1?token=SECRET123" });
    expect(out.proxyUrl).toBeUndefined();
    expect(out.proxyUrlMasked).not.toContain("SECRET123");
    expect(out.hasProxyAuth).toBe(false);
  });
});
