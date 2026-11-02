import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLI_SCAN_TARGETS } from "../../src/shared/constants/cliScanTargets.js";

// Contract test for the FR-1 setup wizard. The dashboard component is a client
// component, so these assertions pin the behaviour that the browser walk then proves:
// a missing status key is UNKNOWN, an explicit null is ABSENT, and no config path is
// invented for a tool that does not declare one.

const SRC = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/dashboard/cli-tools/components/SetupWizardCard.js"
  ),
  "utf8"
);

const TOOL_SUMMARY_SRC = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/dashboard/cli-tools/components/ToolSummaryCard.js"
  ),
  "utf8"
);

const ALL_STATUS_GETTER_IDS = [
  "claude",
  "codex",
  "opencode",
  "droid",
  "openclaw",
  "hermes",
  "cowork",
  "cline",
  "kilo",
  "deepseek-tui",
  "jcode",
  "grok-build",
  "devin",
];

describe("CLI setup wizard contract", () => {
  it("reads detection from the all-statuses endpoint", () => {
    expect(SRC).toContain("/api/cli-tools/all-statuses");
  });

  it("maps status payloads to the four states instead of treating any object as detected", () => {
    // undefined => no checker, null => the getter threw, installed:false => absent.
    expect(SRC).toMatch(/toolData === undefined[\s\S]{0,120}unavailable/);
    expect(SRC).toMatch(/toolData === null[\s\S]{0,120}check-failed/);
    expect(SRC).toMatch(/installed === false[\s\S]{0,80}absent/);
    expect(SRC).toMatch(/installed === true[\s\S]{0,80}detected/);
    expect(SRC).toContain("No checker for this client");
  });

  it("renders all four states as text, not colour alone", () => {
    for (const state of ["detected", "absent", "check-failed", "unavailable"]) {
      expect(SRC).toContain(`statusState === "${state}"`);
      expect(SRC).toContain(`data-state="${state}"`);
    }
  });

  it("shows a declared config path and invents none", () => {
    expect(SRC).toContain("settingsFile");
    expect(SRC).toMatch(/selected\?\.settingsFile/);
    expect(SRC).not.toMatch(/\/\.claude\/settings\.json/);
  });

  it("treats a failed request as check-failed, never as absent", () => {
    const failedBranch = SRC.slice(
      SRC.indexOf("if (!res.ok)"),
      SRC.indexOf("const data = await res.json()")
    );
    expect(failedBranch).toContain("check-failed");
    expect(failedBranch).not.toContain("absent");
  });

  it("marks Copied only after the clipboard write resolves", () => {
    const copy = SRC.slice(
      SRC.indexOf("const handleCopy"),
      SRC.indexOf("const renderStatus")
    );
    const awaitAt = copy.indexOf("await navigator.clipboard.writeText");
    const setCopiedAt = copy.indexOf("setCopied(true)");
    expect(awaitAt).toBeGreaterThan(-1);
    expect(setCopiedAt).toBeGreaterThan(awaitAt);
  });

  it("filters clients by name or id and keeps a live selection", () => {
    expect(SRC).toContain("setup-tool-search");
    expect(SRC).toContain("visibleTools");
    expect(SRC).toMatch(/No client matches/);
    // The selection must fall back to the first visible tool, never to a hidden id.
    expect(SRC).toMatch(/visibleTools\.some\(\(tool\) => tool\.id === selectedId\)/);
  });

  it("builds the snippet from guideSteps and never invents a generic one", () => {
    expect(SRC).toContain("{{baseUrl}}");
    expect(SRC).toContain("replaceAll");
    expect(SRC).toMatch(/selected\?\.guideSteps\s*\?\?\s*selected\?\.steps/);
    expect(SRC).toMatch(/selected\?\.envVars\?\.baseUrl/);
    // A client that declares no copyable value must say so, never borrow Claude's env var.
    expect(SRC).not.toContain("ANTHROPIC_BASE_URL");
    expect(SRC).toContain("No copy-paste snippet is declared");
  });

  it("resolves the origin after hydration so server and client markup match", () => {
    expect(SRC).toContain("useSyncExternalStore");
    expect(SRC).toMatch(/\(\) => window\.location\.origin/);
    expect(SRC).toMatch(/\(\) => ""/);
    expect(SRC).not.toMatch(/typeof window !== "undefined" \? window\.location\.origin/);
    expect(SRC).toMatch(/const snippet = !origin/);
  });

  it("covers all 13 status-getter tools in CLI_SCAN_TARGETS with non-empty probe lists", () => {
    for (const toolId of ALL_STATUS_GETTER_IDS) {
      expect(CLI_SCAN_TARGETS[toolId]).toBeDefined();
      expect(Array.isArray(CLI_SCAN_TARGETS[toolId])).toBe(true);
      expect(CLI_SCAN_TARGETS[toolId].length).toBeGreaterThan(0);
      for (const target of CLI_SCAN_TARGETS[toolId]) {
        expect(typeof target).toBe("string");
        expect(target.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("imports CLI_SCAN_TARGETS and renders scanned targets or unregistered message in Step 2", () => {
    expect(SRC).toContain("CLI_SCAN_TARGETS");
    expect(SRC).toContain("Scanned:");
    expect(SRC).toContain("No scanner registered for this client.");
    expect(SRC).toMatch(/CLI_SCAN_TARGETS\[selectedToolId\]/);
  });

  it("adds scrollable row anchors to ToolSummaryCard and links from SetupWizardCard", () => {
    // ToolSummaryCard must provide id={"tool-" + toolId} and scroll-mt-24
    expect(TOOL_SUMMARY_SRC).toMatch(/id=\{["']tool-["']\s*\+\s*toolId\}/);
    expect(TOOL_SUMMARY_SRC).toContain("scroll-mt-24");

    // SetupWizardCard must provide an Open <tool name> setup link targeting that anchor
    expect(SRC).toMatch(/href=\{`#tool-\$\{selectedToolId\}`\}/);
    expect(SRC).toMatch(/Open \{selected\?\.name\} setup/);

    // Setup link is hidden or disabled when tool is not in the installed list
    expect(SRC).toMatch(/tools\.some\(\(t\) => t\.id === selectedToolId\)/);
  });
});
