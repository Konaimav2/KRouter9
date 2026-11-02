import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("builds the snippet from guideSteps before the generic fallback", () => {
    expect(SRC).toContain("{{baseUrl}}");
    expect(SRC).toContain("replaceAll");
    expect(SRC).toMatch(/selected\?\.guideSteps\s*\?\?\s*selected\?\.steps/);
    expect(SRC).toMatch(/selected\?\.envVars\?\.baseUrl/);
    // The generic export stays as the last resort, not the first choice.
    expect(SRC.indexOf("selected?.guideSteps")).toBeLessThan(
      SRC.indexOf("export ANTHROPIC_BASE_URL=")
    );
  });

  it("resolves the origin after hydration so server and client markup match", () => {
    expect(SRC).toContain("useSyncExternalStore");
    expect(SRC).toMatch(/\(\) => window\.location\.origin/);
    expect(SRC).toMatch(/\(\) => ""/);
    expect(SRC).not.toMatch(/typeof window !== "undefined" \? window\.location\.origin/);
    expect(SRC).toMatch(/const snippet = !origin/);
  });
});
