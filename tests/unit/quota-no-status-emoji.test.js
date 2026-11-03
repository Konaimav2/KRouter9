import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const FILES = [
  "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/QuotaProgressBar.js",
  "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/QuotaTable.js",
  "src/app/(dashboard)/dashboard/usage/components/ProviderLimits/utils.js",
];

describe("quota status has no emoji (FR-10 grammar)", () => {
  for (const file of FILES) {
    it(`${file} ships text/colour status only`, () => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
      expect(source).not.toContain("getStatusEmoji");
    });
  }
});
