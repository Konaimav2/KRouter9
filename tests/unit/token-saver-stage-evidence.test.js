import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = existsSync(resolve(process.cwd(), "src"))
  ? process.cwd()
  : resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const clientPath = resolve(
  repoRoot,
  "src/app/(dashboard)/dashboard/token-saver/TokenSaverClient.js"
);
const UI = readFileSync(clientPath, "utf8");

describe("Token Saver per-stage evidence contract (FR-4)", () => {
  it("renders per-stage rows for PXPIPE, Output compression, Caveman, and Ponytail", () => {
    expect(UI).toContain("PXPIPE");
    expect(UI).toContain("Output compression");
    expect(UI).toContain("Headroom");
    expect(UI).toContain("Caveman");
    expect(UI).toContain("Ponytail");
  });

  it("reflects persisted enabled states for all four stages", () => {
    expect(UI).toContain("pxpipeEnabled");
    expect(UI).toContain("headroomEnabled");
    expect(UI).toContain("cavemanEnabled");
    expect(UI).toContain("ponytailEnabled");
    // Verify each stage renders Enabled / Disabled text conditionally
    expect(UI).toMatch(/pxpipeEnabled\s*\?\s*["']Enabled["']\s*:\s*["']Disabled["']/);
    expect(UI).toMatch(/headroomEnabled\s*\?\s*["']Enabled["']\s*:\s*["']Disabled["']/);
    expect(UI).toMatch(/cavemanEnabled\s*\?\s*["']Enabled["']\s*:\s*["']Disabled["']/);
    expect(UI).toMatch(/ponytailEnabled\s*\?\s*["']Enabled["']\s*:\s*["']Disabled["']/);
  });

  it("fetches PXPIPE status and computes before, after, saved tokens and percent", () => {
    expect(UI).toContain("/api/pxpipe/status");
    expect(UI).toContain("tokensBeforeEst");
    expect(UI).toContain("tokensAfterEst");
    expect(UI).toContain("tokensSavedEst");
    expect(UI).toContain("savedPct");
    // Formats before → after with saved tokens and percent
    expect(UI).toMatch(/pxpipeSavings\.before[\s\S]*?→[\s\S]*?pxpipeSavings\.after/);
  });

  it("renders honest 'not measured per request' notice for Caveman and Ponytail without fabricated numbers", () => {
    const unmeasuredMatches = UI.match(/not measured per request/g);
    expect(unmeasuredMatches).not.toBeNull();
    expect(unmeasuredMatches.length).toBeGreaterThanOrEqual(2);

    // Caveman and Ponytail rows must not format tokens
    const cavemanIdx = UI.indexOf('td className="p-2 font-medium">Caveman</td>');
    const ponytailIdx = UI.indexOf('td className="p-2 font-medium">Ponytail</td>');
    expect(cavemanIdx).toBeGreaterThan(0);
    expect(ponytailIdx).toBeGreaterThan(0);

    const cavemanSection = UI.slice(cavemanIdx, ponytailIdx);
    const tbodyIdx = UI.indexOf("</tbody>", ponytailIdx);
    const ponytailSection = UI.slice(ponytailIdx, tbodyIdx);

    expect(cavemanSection).toContain("not measured per request");
    expect(cavemanSection).not.toContain("formatTokens");
    expect(ponytailSection).toContain("not measured per request");
    expect(ponytailSection).not.toContain("formatTokens");
  });

  it("provides independent error handling so one failed stage does not blank other rows", () => {
    // Both Headroom and PXPIPE have dedicated error states
    expect(UI).toContain("stats unavailable");
    expect(UI).toContain("setSavings({ error: true })");
    expect(UI).toContain("setPxpipeSavings({ error: true })");

    // Output compression keeps the qualifier even when unavailable
    expect(UI).toContain("Headroom service totals, not this gateway's billing");

    // PXPIPE failed request shows error state, not zeros
    const pxpipeRowStart = UI.indexOf('td className="p-2 font-medium">PXPIPE</td>');
    const outputRowStart = UI.indexOf('<span>Output compression</span>');
    expect(pxpipeRowStart).toBeGreaterThan(0);
    expect(outputRowStart).toBeGreaterThan(pxpipeRowStart);

    const pxpipeRow = UI.slice(pxpipeRowStart, outputRowStart);
    expect(pxpipeRow).toContain("pxpipeSavings?.error");
    expect(pxpipeRow).toContain("stats unavailable");
    expect(pxpipeRow).not.toContain("0 → 0");
  });
});
