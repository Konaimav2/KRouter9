import { describe, it, expect } from "vitest";
import { filterTokenRefreshSpam } from "../../src/app/(dashboard)/dashboard/console-log/tokenRefreshSpam.js";

// H2 item 1 RED: live line shape from src/sse/utils/logger.js info():
//   `[${time}] ℹ️  [${tag}] ${message}` with tag "TOKEN",
// e.g. log?.info?.("TOKEN", "Antigravity refreshed") in
// open-sse/executors/antigravity.js:331 (+ default.js:251 generic
// `${provider} refreshed`, gemini-cli/github/kiro variants).
// Existing patterns only match [TOKEN_REFRESH]/[BG_TOKEN_REFRESH].
describe("H2 F31-REOPENED RED: live [TOKEN] refresh lines escape Hide-refresh-noise", () => {
  it("hides live-rendered TOKEN refresh success lines", () => {
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

  it("does not hide non-refresh TOKEN lines", () => {
    const lines = [
      "[10:03:00] \u2139\uFE0F  [TOKEN] usage quota checkpoint saved",
      "[10:03:01] \u2139\uFE0F  [TOKEN] Antigravity refreshed",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, true);
    expect(visible).toEqual(["[10:03:00] \u2139\uFE0F  [TOKEN] usage quota checkpoint saved"]);
    expect(hiddenCount).toBe(1);
  });
});
