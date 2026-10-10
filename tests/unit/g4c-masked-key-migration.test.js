import { describe, it, expect } from "vitest";
import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");
describe("G4c masked-key migration", () => {
  it("ApiKeySelect selects by id, resolves via guarded reveal, never raw list key", () => {
    const s = read("src/app/(dashboard)/dashboard/cli-tools/components/ApiKeySelect.js");
    expect(s).not.toMatch(/apiKeys\[0\]\.key/);
    expect(s).not.toMatch(/\(k\)\s*=>[^;\n]*k\.key/);
    expect(s).not.toMatch(/\.some\(\(k\)/);
    expect(s).toMatch(/\/api\/keys\/.*\/reveal\?confirm=true/);
    expect(s).toMatch(/maskedKey/);
  });
  it("Codex apply never submits dummy sk_krouter9 silently (explicit error)", () => {
    const s = read("src/app/(dashboard)/dashboard/cli-tools/components/CodexToolCard.js");
    expect(s).not.toMatch(/apiKeys\[0\]\.key/);
    expect(s).toMatch(/No API key selected/);
    expect(s).not.toMatch(/\? "sk_krouter9"/);
  });
  it("terminal cliTools resolves via authenticated reveal, not list raw", () => {
    const s = read("cli/src/cli/menus/cliTools.js");
    expect(s).not.toMatch(/keys\[0\]\.key/);
    expect(s).toMatch(/revealApiKey/);
  });
  it("terminal apiKeys menu never discloses list raw key (masked display + reveal only)", () => {
    const s = read("cli/src/cli/menus/apiKeys.js");
    expect(s).not.toMatch(/Key: \$\{key\.key\}/);
    expect(s).not.toMatch(/Name: \$\{key\.name\}\\nKey: \$\{key\.key\}/);
    expect(s).toMatch(/revealApiKey/);
    expect(s).toMatch(/maskedKey/);
  });
  it("no bulk disclosure restored: keys list route stays masked-only", () => {
    const s = read("src/app/api/keys/route.js");
    expect(s).toMatch(/keys\.map\(sanitizeApiKeyRow\)/);
    // POST create returns the raw key ONCE (one-time read); GET list stays masked.
    expect(s).not.toMatch(/\{ keys: keys \}/);
  });
});
