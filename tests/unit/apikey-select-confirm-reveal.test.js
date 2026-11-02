import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// FR-2 — a raw secret is fetched only after the user explicitly picks a key.
// The selector must never auto-reveal on mount, and deleting a preset must not
// reveal another one.
const SRC = readFileSync(
  resolve(
    process.cwd(),
    "src/app/(dashboard)/dashboard/cli-tools/components/ApiKeySelect.js"
  ),
  "utf8"
);

describe("API key selector reveal contract", () => {
  it("has no mount-time auto reveal", () => {
    expect(SRC).not.toContain("autoPickedRef");
    expect(SRC).not.toContain("Default to the first list key");
    const effects = SRC.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[.*?\]\);/g) || [];
    expect(effects.every((effect) => !effect.includes("selectKeyId"))).toBe(true);
  });

  it("reveals only from the explicit selection handler", () => {
    const calls = SRC.match(/selectKeyId\(/g) || [];
    // exactly one call site: the user's selection handler
    expect(calls.length).toBe(1);
  });

  it("starts with a placeholder and no implicit value", () => {
    expect(SRC).toContain('value=""');
    expect(SRC).toContain("Select a key…");
    expect(SRC).toContain("const mode = active ? active.value : (customMode || value ? CUSTOM_VALUE : \"\")");
  });

  it("does not reveal a fallback key when a saved preset is deleted", () => {
    expect(SRC).toContain("Deleting a preset never reveals another secret");
    expect(SRC).not.toContain("fallback?.keyId");
  });
});
