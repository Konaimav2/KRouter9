import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(resolve(root, p), "utf8");

describe("hot-path perf guards (F6)", () => {
  it("chat.js estimates tokens without full JSON.stringify", () => {
    const s = src("src/sse/handlers/chat.js");
    expect(s).toContain("estimateBodyChars");
    // Only the 413 post-parse measurement may stringify; estimates must not.
    expect(s).not.toMatch(/estTokens = Math\.max\(1, Math\.ceil\(JSON\.stringify/);
  });

  it("chat.js uses the cached settings reader on hot paths", () => {
    const s = src("src/sse/handlers/chat.js");
    expect(s).toContain("getCachedSettings");
    expect(s).not.toMatch(/await getSettings\(\)/);
  });

  it("hot-path policy/budget helpers are static imports, not per-request dynamic imports", () => {
    const s = src("src/sse/handlers/chat.js");
    expect(s).toMatch(/import \{[^}]*reserveBudget[^}]*\} from "@\/lib\/budget\.js"/);
    expect(s).toMatch(/import \{[^}]*checkRateLimit[^}]*\} from "@\/lib\/rateLimit\.js"/);
    expect(s).toMatch(/import \{[^}]*isModelAllowedForKey[^}]*\} from "@\/lib\/apiKeyPolicy\.js"/);
    expect(s).not.toContain('await import("@/lib/budget.js")');
    expect(s).not.toContain('await import("@/lib/rateLimit.js")');
    expect(s).not.toContain('await import("@/lib/apiKeyPolicy.js")');
  });

  it("settings writes invalidate the cache", () => {
    const s = src("src/lib/db/repos/settingsRepo.js");
    expect(s).toContain("invalidateSettingsCache()");
  });
});
