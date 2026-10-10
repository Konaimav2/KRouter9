import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// F12 structural RED: the inline edit panel must carry a rename field (client
// VALID_NAME_REGEX check), reuse the PUT merge path, migrate the
// comboStrategies-by-name entry on rename, and surface failures inline.
const source = readFileSync(
  new URL(
    "../../src/app/(dashboard)/dashboard/combos/page.js",
    import.meta.url,
  ),
  "utf8",
);

describe("combo rename (F12)", () => {
  it("exposes a rename entry point reusing the PUT merge path", () => {
    expect(source).toMatch(/handleRename/);
    expect(source).toMatch(/onRename/);
  });

  it("validates the rename inline with VALID_NAME_REGEX", () => {
    expect(source).toMatch(/aria-label="Rename combo"/);
    expect(source).toMatch(/VALID_NAME_REGEX\.test\(/);
  });

  it("migrates comboStrategies keys on rename (no by-name staleness)", () => {
    expect(source).toMatch(/comboStrategies\[oldName\]/);
  });

  it("reports save failures inline, never via alert()", () => {
    expect(source).not.toMatch(/alert\(/);
    expect(source).toMatch(/saveError/);
  });
});
