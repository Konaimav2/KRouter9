import { describe, it, expect } from "vitest";
import { CONSOLE_LOG_CONFIG } from "../../src/shared/constants/config.js";
import { filterTokenRefreshSpam } from "../../src/app/(dashboard)/dashboard/console-log/tokenRefreshSpam.js";
import { redactSensitiveText } from "../../src/lib/proxyMask.js";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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

  it("redacts credentials, URLs, hosts and IPs before console delivery", () => {
    const line = "Bearer top-secret https://alice:pass@relay.private.example/path via 10.2.3.4";
    const redacted = redactSensitiveText(line);
    expect(redacted).not.toContain("top-secret");
    expect(redacted).not.toContain("alice");
    expect(redacted).not.toContain("relay.private.example");
    expect(redacted).not.toContain("10.2.3.4");
  });

  it("applies redaction at both server buffer and client render boundaries", () => {
    const serverSource = fs.readFileSync(fileURLToPath(new URL("../../src/lib/consoleLogBuffer.js", import.meta.url)), "utf8");
    const clientSource = fs.readFileSync(fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js", import.meta.url)), "utf8");
    expect(serverSource).toMatch(/appendLine\(line\)[\s\S]*redactSensitiveText\(line\)/);
    expect(clientSource).toMatch(/renderLine\(line\)[\s\S]*redactSensitiveText\(line\)/);
    expect(clientSource).toContain("msg.logs.map(redactSensitiveText)");
  });

  it("keeps the source column clear of separators and exposes truncated text", () => {
    const clientSource = fs.readFileSync(fileURLToPath(new URL("../../src/app/(dashboard)/dashboard/console-log/ConsoleLogClient.js", import.meta.url)), "utf8");
    expect(clientSource).toContain("md:grid-cols-[5.5rem_5.5rem_minmax(8rem,10rem)_minmax(0,1fr)]");
    expect(clientSource).toMatch(/className="min-w-0 truncate text-text-muted md:border-l md:border-border md:px-3" title=\{parsed\.source\}/);
  });
});
