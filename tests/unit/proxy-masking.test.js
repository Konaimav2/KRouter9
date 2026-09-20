import { describe, it, expect } from "vitest";
import {
  maskProxyUrl,
  hasProxyAuth,
  sanitizeProxyFields,
  sanitizeConnectionForBrowser,
} from "../../src/lib/proxyMask.js";

describe("proxy secret masking", () => {
  it("masks userinfo, keeps host", () => {
    expect(maskProxyUrl("http://user:pass@host:8080")).toBe("http://***@host:8080");
    expect(maskProxyUrl("socks5://u:p@h:1")).toBe("socks5://***@h:1");
  });

  it("leaves non-secret URLs intact", () => {
    expect(maskProxyUrl("http://host:8080")).toBe("http://host:8080");
    expect(maskProxyUrl("")).toBe("");
    expect(maskProxyUrl(undefined)).toBeUndefined();
  });

  it("detects auth presence", () => {
    expect(hasProxyAuth("http://u:p@h:1")).toBe(true);
    expect(hasProxyAuth("http://h:1")).toBe(false);
    expect(hasProxyAuth("")).toBe(false);
  });

  it("sanitizeProxyFields drops raw, adds masked + flag", () => {
    const out = sanitizeProxyFields({ id: "1", proxyUrl: "http://u:p@h:1" });
    expect(out.proxyUrl).toBeUndefined();
    expect(out.proxyUrlMasked).toBe("http://***@h:1");
    expect(out.hasProxyAuth).toBe(true);
    expect(out.id).toBe("1");
  });

  it("sanitizeConnectionForBrowser strips keys, tokens, proxy secret, locks", () => {
    const out = sanitizeConnectionForBrowser({
      id: "1",
      apiKey: "sk-x",
      accessToken: "a",
      refreshToken: "r",
      idToken: "i",
      providerSpecificData: { prefix: "p", connectionProxyUrl: "http://u:p@h:1" },
      modelLock_x: "2030-01-01",
    });
    expect(out.apiKey).toBeUndefined();
    expect(out.accessToken).toBeUndefined();
    expect(out.providerSpecificData.connectionProxyUrl).toBeUndefined();
    expect(out.providerSpecificData.connectionProxyUrlMasked).toBe("http://***@h:1");
    expect(out.providerSpecificData.prefix).toBe("p");
    expect(out.modelLock_x).toBeUndefined();
  });
});
