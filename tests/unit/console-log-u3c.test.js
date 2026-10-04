import { describe, it, expect } from "vitest";
import { CONSOLE_LOG_CONFIG } from "../../src/shared/constants/config.js";
import { filterTokenRefreshSpam } from "../../src/app/(dashboard)/dashboard/console-log/tokenRefreshSpam.js";

describe("U3c F14 RED: console-log spam filter + buffer", () => {
  it("buffer retains 1000 lines", () => {
    expect(CONSOLE_LOG_CONFIG.maxLines).toBe(1000);
  });

  it("hides antigravity token-refresh spam lines by default pattern", () => {
    const lines = [
      "[12:00:00] INFO [TOKEN_REFRESH] Refreshing provider credentials proactively",
      "[12:00:00] INFO [BG_TOKEN_REFRESH] Connection refresh finished",
      "[12:00:00] INFO [CHAT] normal request line",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, true);
    expect(visible).toEqual(["[12:00:00] INFO [CHAT] normal request line"]);
    expect(hiddenCount).toBe(2);
  });

  it("filter is reversible: toggle OFF reveals all lines", () => {
    const lines = [
      "[12:00:00] INFO [TOKEN_REFRESH] Refreshing provider credentials proactively",
      "[12:00:00] INFO [CHAT] normal request line",
    ];
    const { visible, hiddenCount } = filterTokenRefreshSpam(lines, false);
    expect(visible).toEqual(lines);
    expect(hiddenCount).toBe(0);
  });
});
