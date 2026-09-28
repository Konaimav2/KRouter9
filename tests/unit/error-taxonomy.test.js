// U1c: normalized error classes + refresh-invalid handling.
import { describe, it, expect } from "vitest";
import {
  normalizeErrorClass,
  errorClassLabel,
  errorClassVariant,
  ERROR_CLASSES,
} from "../../src/shared/utils/errorClass.js";
import { getStatusVariant } from "../../src/shared/utils/connectionStatus.js";

describe("normalizeErrorClass", () => {
  it("exposes the 5 decided classes", () => {
    expect(ERROR_CLASSES).toEqual([
      "auth-invalid", "refresh-invalid", "ratelimited", "network", "unknown",
    ]);
  });
  it("refresh-invalid wins on status, flag, or message", () => {
    expect(normalizeErrorClass({ testStatus: "refresh-invalid" })).toBe("refresh-invalid");
    expect(normalizeErrorClass({ testStatus: "error", refreshFailed: true })).toBe("refresh-invalid");
    expect(normalizeErrorClass({ lastError: "Failed to refresh credentials" })).toBe("refresh-invalid");
    expect(normalizeErrorClass({ lastError: "refresh token invalid" })).toBe("refresh-invalid");
  });
  it("maps 429 shapes to ratelimited", () => {
    expect(normalizeErrorClass({ errorCode: 429 })).toBe("ratelimited");
    expect(normalizeErrorClass({ testStatus: "429" })).toBe("ratelimited");
    expect(normalizeErrorClass({ lastError: "too many requests, retry later" })).toBe("ratelimited");
  });
  it("maps auth shapes to auth-invalid", () => {
    expect(normalizeErrorClass({ errorCode: 401 })).toBe("auth-invalid");
    expect(normalizeErrorClass({ errorCode: 403 })).toBe("auth-invalid");
    expect(normalizeErrorClass({ lastError: "invalid api key" })).toBe("auth-invalid");
    expect(normalizeErrorClass({ lastError: "token revoked, re-authorize" })).toBe("auth-invalid");
  });
  it("maps network shapes to network", () => {
    expect(normalizeErrorClass({ lastError: "fetch failed: socket hang up" })).toBe("network");
    expect(normalizeErrorClass({ lastError: "ETIMEDOUT after 30s" })).toBe("network");
    expect(normalizeErrorClass({ lastError: "getaddrinfo ENOTFOUND api.x.ai" })).toBe("network");
  });
  it("falls back to unknown", () => {
    expect(normalizeErrorClass({})).toBe("unknown");
    expect(normalizeErrorClass({ lastError: "something odd happened" })).toBe("unknown");
  });
  it("labels and variants cover every class", () => {
    for (const cls of ERROR_CLASSES) {
      expect(typeof errorClassLabel(cls)).toBe("string");
      expect(["error", "warning", "info", "default"]).toContain(errorClassVariant(cls));
    }
    expect(errorClassVariant("refresh-invalid")).toBe("error");
  });
});

describe("getStatusVariant refresh-invalid", () => {
  it("maps refresh-invalid to warning, keeps the rest", () => {
    expect(getStatusVariant(true, "refresh-invalid")).toBe("warning");
    expect(getStatusVariant(true, "active")).toBe("success");
    expect(getStatusVariant(true, "error")).toBe("error");
    expect(getStatusVariant(false, "refresh-invalid")).toBe("default");
  });
});
