import { describe, it, expect } from "vitest";
import { filterTokenRefreshSpam } from "../../src/app/(dashboard)/dashboard/console-log/tokenRefreshSpam.js";

// H2 F31: executor log.info("TOKEN", message) can reach console capture as
// separate arguments, joined into plain `TOKEN Antigravity refreshed`.
// The custom logger also emits bracketed tags; both shapes must be covered.
describe("H2 F31: exact TOKEN refresh noise filtering", () => {
  it("hides raw plain TOKEN refresh success lines", () => {
    const lines = [
      "TOKEN Antigravity refreshed",
      "TOKEN antigravity refreshed",
      "TOKEN Gemini CLI refreshed",
      "TOKEN Copilot token refreshed",
      "CHAT normal request line",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, true);
    expect(visible).toEqual(["CHAT normal request line"]);
    expect(hiddenCount).toBe(4);
  });

  it("hides compatible bracketed TOKEN refresh success lines", () => {
    const lines = [
      "[10:01:02] \u2139\uFE0F  [TOKEN] Antigravity refreshed",
      "[10:01:03] \u2139\uFE0F  [TOKEN] antigravity refreshed",
      "[10:01:04] \u2139\uFE0F  [TOKEN] Gemini CLI refreshed",
      "[10:01:05] \u2139\uFE0F  [TOKEN] Copilot token refreshed",
      "[10:01:06] \u2139\uFE0F  [TOKEN] ANTIGRAVITY | refreshed for embeddings",
      "[10:01:07] \u2139\uFE0F  [TOKEN] ANTIGRAVITY | refreshed for image generation",
      "[10:01:08] \u2139\uFE0F  [TOKEN] ANTIGRAVITY | refreshed for video listModels",
      "[10:01:09] \u2139\uFE0F  [CHAT] normal request line",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, true);
    expect(visible).toEqual(["[10:01:09] \u2139\uFE0F  [CHAT] normal request line"]);
    expect(hiddenCount).toBe(7);
  });

  it("hides live-rendered TOKEN refresh error lines", () => {
    const lines = [
      "[10:02:00] \u2139\uFE0F  [TOKEN] Antigravity refresh error: socket hangup",
      "[10:02:01] \u2139\uFE0F  [TOKEN] Copilot token refresh failed: 401 denied",
      "[10:02:02] \u26A0\uFE0F  [TOKEN] ANTIGRAVITY | refresh failed",
      "[10:02:03] \u26A0\uFE0F  [TOKEN] ANTIGRAVITY | retry after refresh failed",
      "[10:02:04] \u26A0\uFE0F  [TOKEN] ANTIGRAVITY | refresh threw: boom",
      "[10:02:05] \u26A0\uFE0F  [TOKEN] onCredentialsRefreshed failed: boom",
      "[10:02:06] \u2139\uFE0F  [TOKEN] Kiro refresh error: gone",
      "[10:02:07] \u2139\uFE0F  [CHAT] keep me",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, true);
    expect(visible).toEqual(["[10:02:07] \u2139\uFE0F  [CHAT] keep me"]);
    expect(hiddenCount).toBe(7);
  });

  it("preserves non-refresh TOKEN lines and arbitrary TOKEN/refreshed text", () => {
    const lines = [
      "TOKEN usage quota checkpoint saved",
      "TOKEN CHAT normal request line",
      "TOKEN Antigravity refresh scheduled",
      "CHAT Antigravity refreshed",
      "CHAT TOKEN Antigravity refreshed",
      "message mentions TOKEN Antigravity refreshed",
      "TOKENIZER Antigravity refreshed",
      "[CHAT] TOKEN Antigravity refreshed",
      "TOKEN Antigravity refreshedness",
      "TOKEN quota checkpoint refreshed from disk",
      "TOKEN Antigravity refreshed\nCHAT normal request line",
      "[10:03:00] \u2139\uFE0F  [TOKEN] usage quota checkpoint saved",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, true);
    expect(visible).toEqual(lines);
    expect(hiddenCount).toBe(0);
  });

  it("filter off restores the original plain and bracketed lines", () => {
    const lines = [
      "TOKEN Antigravity refreshed",
      "TOKEN usage quota checkpoint saved",
      "TOKEN CHAT normal request line",
      "[10:03:01] \u2139\uFE0F  [TOKEN] Antigravity refreshed",
      "CHAT normal request line",
    ];
    const original = [...lines];
    filterTokenRefreshSpam(lines, true);
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, false);
    expect(visible).toEqual(original);
    expect(lines).toEqual(original);
    expect(visible).not.toBe(lines);
    expect(hiddenCount).toBe(0);
  });
});
