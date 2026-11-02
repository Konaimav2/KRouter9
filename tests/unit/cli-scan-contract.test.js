import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLI_SCAN_TARGETS } from "../../src/shared/constants/cliScanTargets.js";
import { GET } from "../../src/app/api/cli-tools/scan/route.js";
import { SCANNED_TOOLS } from "../../src/shared/constants/cliScanApps.js";

const ROUTE_SRC = readFileSync(
  resolve(process.cwd(), "src/app/api/cli-tools/scan/route.js"),
  "utf8"
);

const WIZARD_SRC = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/dashboard/cli-tools/components/SetupWizardCard.js"
  ),
  "utf8"
);

const EXPECTED_IDS = [
  "cursor",
  "codex",
  "cline",
  "roo",
  "opencode",
  "openclaw",
  "hermes",
  "vscode",
];

describe("CLI scan route contract", () => {
  it("imports and checks all eight ids", () => {
    const scannedIds = SCANNED_TOOLS.map((t) => t.id);
    for (const id of EXPECTED_IDS) {
      expect(scannedIds).toContain(id);
      expect(ROUTE_SRC).toContain(`"${id}"`);
    }
    expect(scannedIds.length).toBe(8);
  });

  it("is GET-only and never writes to disk", () => {
    expect(typeof GET).toBe("function");
    // Ensure no mutating HTTP methods are exported
    expect(ROUTE_SRC).not.toMatch(/export\s+async\s+function\s+POST/);
    expect(ROUTE_SRC).not.toMatch(/export\s+async\s+function\s+PUT/);
    expect(ROUTE_SRC).not.toMatch(/export\s+async\s+function\s+DELETE/);
    expect(ROUTE_SRC).not.toMatch(/export\s+async\s+function\s+PATCH/);

    // Ensure no filesystem write operations are performed
    expect(ROUTE_SRC).not.toContain("writeFile");
    expect(ROUTE_SRC).not.toContain("appendFile");
    expect(ROUTE_SRC).not.toContain("mkdir");
    expect(ROUTE_SRC).not.toContain("unlink");
    expect(ROUTE_SRC).not.toContain("rmdir");
    expect(ROUTE_SRC).not.toContain("truncate");
  });

  it("ensures every scanned id has an entry in CLI_SCAN_TARGETS", () => {
    for (const tool of SCANNED_TOOLS) {
      expect(CLI_SCAN_TARGETS[tool.id]).toBeDefined();
      expect(Array.isArray(CLI_SCAN_TARGETS[tool.id])).toBe(true);
      expect(CLI_SCAN_TARGETS[tool.id].length).toBeGreaterThan(0);
      for (const target of CLI_SCAN_TARGETS[tool.id]) {
        expect(typeof target).toBe("string");
        expect(target.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("executes read-only scan returning the expected payload structure without throwing", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBe(8);

    for (const item of data.results) {
      expect(EXPECTED_IDS).toContain(item.id);
      expect(typeof item.name).toBe("string");
      expect(Array.isArray(item.targets)).toBe(true);
      expect(item.targets.length).toBeGreaterThan(0);
      expect(typeof item.detected).toBe("boolean");
      expect(Array.isArray(item.evidence)).toBe(true);
      expect(item.error === null || typeof item.error === "string").toBe(true);
      if (item.detected) {
        expect(item.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("SetupWizardCard auto-detect integration", () => {
  it("has the Auto-detect all applications button with loading state", () => {
    expect(WIZARD_SRC).toContain("Auto-detect all applications");
    expect(WIZARD_SRC).toContain("/api/cli-tools/scan");
    expect(WIZARD_SRC).toMatch(/scanning\s*\?\s*["']Scanning\.\.\.["']\s*:\s*["']Auto-detect all applications["']/);
  });

  it("renders the three result states (Detected, Not found, Check failed)", () => {
    expect(WIZARD_SRC).toContain('data-scan-state="detected"');
    expect(WIZARD_SRC).toContain('data-scan-state="not-found"');
    expect(WIZARD_SRC).toContain('data-scan-state="check-failed"');
    expect(WIZARD_SRC).toContain("<span>Detected</span>");
    expect(WIZARD_SRC).toContain("<span>Not found</span>");
    expect(WIZARD_SRC).toContain("<span>Check failed</span>");
  });

  it("displays the 'Not scanned — no local detector' fallback for unscanned tools", () => {
    expect(WIZARD_SRC).toContain("Not scanned — no local detector");
  });

  it("clicking a scan result selects the tool and advances to Step 2", () => {
    expect(WIZARD_SRC).toContain("handleSelectScanResult");
    expect(WIZARD_SRC).toMatch(/onClick=\{.*handleSelectScanResult\(result\.id/);
    expect(WIZARD_SRC).toMatch(/setSelectedId\(toolId\)/);
    // Advances to step 2 via element targeting or status update
    expect(WIZARD_SRC).toContain("setup-step-2");
  });
});
